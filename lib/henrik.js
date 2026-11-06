// Shared server-side rate limiter for every call to HenrikDev. Each route
// used to pace itself independently (e.g. a stats fetch's own pages 200ms
// apart), but that only bounds ONE feature's own requests — it says nothing
// about tier-check + season-stats + another browser tab all hitting
// HenrikDev at once. HenrikDev's 30/min cap is shared across everything our
// server sends regardless of which route or which client triggered it, so
// the limiter has to live here, not in each route or in the frontend.
//
// Implemented as a strict serial queue (one HenrikDev request in flight at a
// time, spaced at least MIN_INTERVAL_MS apart) rather than a sliding-window
// counter. A counter-based limiter has a check-then-increment gap that a
// burst of concurrent requests can race through — measured empirically: 40
// concurrent calls still produced 429s with a naive "count timestamps in the
// last 60s" approach. A promise-chain mutex has no such gap: replacing
// globalThis.__henrikChain with a fresh promise happens synchronously, so
// two concurrent callers can never both grab the same "turn".
//
// Even with correct pacing, HenrikDev still returned occasional 429s in
// practice (root cause unconfirmed — possibly window-alignment differences,
// possibly quota shared with other traffic on the same key). So on top of
// pacing, a 429 is treated as retryable: back off (using the reset header
// when present) and try again rather than surfacing the error to the user.
//
// globalThis-backed so it survives across requests within the same Node
// process (same caveat as lib/store.js's in-memory KV fallback: this doesn't
// coordinate across multiple serverless instances, only within one).
// 2.2초 간격 = 분당 약 27번. 한도(30)에 살짝 여유를 두고, 그래도 429가 나면 아래에서 기다렸다 다시 보낸다.
const MIN_INTERVAL_MS = 2200;
const MAX_RETRIES = 4;

async function henrikFetchOnce(url, opts) {
  const myTurnStarts = globalThis.__henrikChain || Promise.resolve();
  let release;
  globalThis.__henrikChain = new Promise((resolve) => { release = resolve; });

  await myTurnStarts; // wait for everyone ahead of us to finish
  try {
    const now = Date.now();
    const last = globalThis.__henrikLastFetchAt || 0;
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - last));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    globalThis.__henrikLastFetchAt = Date.now();
    return await fetch(url, opts);
  } finally {
    release(); // let the next request in line proceed — even if we're about to retry, we re-queue from scratch
  }
}

// 관리자 화면에 보여 줄 HenrikDev 상태. 키가 막히거나 만료되면 모두가 "언랭"으로만
// 보여서 원인을 알 수 없었다. 서버 메모리라 재시작하면 비워진다.
const status = globalThis.__henrikStatus || (globalThis.__henrikStatus = {
  okAt: 0, lastStatus: null, lastErrorAt: 0, lastError: null, rateLimitedAt: 0, rateLimitCount: 0, authErrorAt: 0, total: 0
});

function note(res, err) {
  status.total++;
  if (err) { Object.assign(status, { lastStatus: 'network', lastErrorAt: Date.now(), lastError: String(err) }); return; }
  status.lastStatus = res.status;
  if (res.ok || res.status === 404) { status.okAt = Date.now(); return; } // 404 = 없는 계정, API는 정상
  status.lastErrorAt = Date.now();
  status.lastError = `HTTP ${res.status}`;
  if (res.status === 429) { status.rateLimitedAt = Date.now(); status.rateLimitCount++; }
  if (res.status === 401 || res.status === 403) status.authErrorAt = Date.now();
}

// state: 'ok' | 'rate_limited' | 'auth' | 'error' | 'unknown' | 'no_key'
export function henrikStatus() {
  const recent = (t) => t && Date.now() - t < 10 * 60 * 1000;
  let state = 'unknown';
  if (!process.env.HENRIKDEV_API_KEY) state = 'no_key';
  else if (status.authErrorAt && status.authErrorAt >= status.okAt) state = 'auth';
  else if (recent(status.rateLimitedAt) && status.rateLimitedAt > status.okAt) state = 'rate_limited';
  else if (status.lastErrorAt && status.lastErrorAt > status.okAt && recent(status.lastErrorAt)) state = 'error';
  else if (status.okAt) state = 'ok';
  return { state, ...status, now: Date.now() };
}

export async function henrikFetch(url, opts, attempt = 0) {
  let res;
  try {
    res = await henrikFetchOnce(url, opts);
  } catch (e) {
    note(null, e);
    throw e;
  }
  note(res);
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const resetHeader = res.headers.get('x-ratelimit-reset') || res.headers.get('retry-after');
    const resetSec = resetHeader ? Number(resetHeader) : NaN;
    const waitMs = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 + 300 : 3000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 15000)));
    return henrikFetch(url, opts, attempt + 1);
  }
  return res;
}
