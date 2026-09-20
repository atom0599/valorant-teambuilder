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
const MIN_INTERVAL_MS = Math.ceil(60_000 / 20); // conservative headroom under HenrikDev's 30/min
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

export async function henrikFetch(url, opts, attempt = 0) {
  const res = await henrikFetchOnce(url, opts);
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const resetHeader = res.headers.get('x-ratelimit-reset') || res.headers.get('retry-after');
    const resetSec = resetHeader ? Number(resetHeader) : NaN;
    const waitMs = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 + 300 : 3000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 15000)));
    return henrikFetch(url, opts, attempt + 1);
  }
  return res;
}
