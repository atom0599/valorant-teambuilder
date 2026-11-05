// Storage layer. Tries Supabase (Postgres via REST) first, then Vercel KV /
// Upstash Redis REST, otherwise falls back to an in-process Map (fine for
// local dev, not for multi-instance prod).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);

export const hasKV = hasSupabase || hasRedis;

const mem = globalThis.__scrimMem || (globalThis.__scrimMem = new Map());

// ---------- Supabase (table: kv_store(key text primary key, value jsonb, expires_at timestamptz)) ----------
async function supabaseGet(key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value,expires_at&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`supabase get ${res.status}`);
  const rows = await res.json();
  const row = rows && rows[0];
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.value;
}

async function supabaseSet(key, value, ttlSeconds) {
  const expires_at = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ key, value, expires_at })
  });
  if (!res.ok) throw new Error(`supabase set ${res.status} ${await res.text().catch(() => '')}`);
}

// ---------- Vercel KV / Upstash Redis REST ----------
async function redis(path, body) {
  const res = await fetch(`${REDIS_URL}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`kv ${path} ${res.status}`);
  return res.json();
}

export async function getJSON(key) {
  if (hasSupabase) return supabaseGet(key);
  if (hasRedis) {
    const out = await redis(`get/${encodeURIComponent(key)}`);
    if (!out || out.result == null) return null;
    try { return JSON.parse(out.result); } catch { return null; }
  }
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.exp && hit.exp < Date.now()) { mem.delete(key); return null; }
  return hit.value;
}

// Compare-and-set on a JSON object's `version` field: writes `value` only if
// the stored object's version is still `expectedVersion`, all in one atomic
// step. Returns false if someone else wrote in between. A separate get →
// check → set lets two concurrent writers both pass the check, and the
// slower one silently overwrites the faster one's update.
export async function casJSON(key, value, expectedVersion) {
  const ok = await casJSONRaw(key, value, expectedVersion);
  if (ok) cachePut(key, value); else cacheDrop(key);
  return ok;
}

async function casJSONRaw(key, value, expectedVersion) {
  if (hasSupabase) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&value->>version=eq.${encodeURIComponent(expectedVersion)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ value, expires_at: null })
      }
    );
    if (!res.ok) throw new Error(`supabase cas ${res.status} ${await res.text().catch(() => '')}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  }
  if (hasRedis) {
    const script = "local cur = redis.call('GET', KEYS[1]) "
      + "if cur then local ok, obj = pcall(cjson.decode, cur) "
      + "if ok and type(obj) == 'table' and tonumber(obj.version) ~= tonumber(ARGV[2]) then return 0 end end "
      + "redis.call('SET', KEYS[1], ARGV[1]) return 1";
    const out = await redis('', ['EVAL', script, '1', key, JSON.stringify(value), String(expectedVersion)]);
    return out?.result === 1;
  }
  const hit = mem.get(key);
  if (hit && hit.value?.version !== expectedVersion) return false;
  mem.set(key, { value, exp: 0 });
  return true;
}

export async function setJSON(key, value, ttlSeconds) {
  try {
    await setJSONRaw(key, value, ttlSeconds);
  } catch (e) {
    cacheDrop(key);
    throw e;
  }
  if (ttlSeconds) cacheDrop(key); else cachePut(key, value);
}

async function setJSONRaw(key, value, ttlSeconds) {
  if (hasSupabase) return supabaseSet(key, value, ttlSeconds);
  if (hasRedis) {
    const path = ttlSeconds
      ? `set/${encodeURIComponent(key)}?EX=${ttlSeconds}`
      : `set/${encodeURIComponent(key)}`;
    await redis(path, value);
    return;
  }
  mem.set(key, { value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
}

// ---------- 읽기 캐시 (GET 전용) ----------
// 서버가 한 대로 계속 떠 있으니(Render), 접속자 모두가 2초 · 30초마다 보내는
// 조회를 매번 Supabase로 넘기지 않고 서버 메모리에서 바로 돌려준다. 접속자가
// 늘어도 Supabase 요청 · 전송량(무료 월 5GB)이 거의 안 늘어난다.
// 이 서버를 거친 쓰기(setJSON / casJSON)는 캐시도 바로 고치니 내 화면에 늦게
// 보이는 일은 없고, ttl은 Supabase를 직접 고쳤을 때만 걸리는 최대 지연이다.
// 쓰기 경로(방 POST의 prev 등)는 getJSON을 그대로 써서 항상 DB 최신값을 본다.
// 문자열로 저장해서 매번 새 객체로 돌려주니, 받은 쪽이 고쳐도 캐시는 안 바뀐다.
const readCache = globalThis.__scrimReadCache || (globalThis.__scrimReadCache = new Map());
// 키마다 쓰기 횟수. 조회가 DB를 읽는 사이에 쓰기가 끼어들면, 늦게 도착한 조회
// 결과(옛날 값)로 캐시를 덮지 않게 한다.
const writeGen = globalThis.__scrimWriteGen || (globalThis.__scrimWriteGen = new Map());

export async function getCached(key, ttlMs) {
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.raw == null ? null : JSON.parse(hit.raw);
  const gen = writeGen.get(key) || 0;
  const value = await getJSON(key);
  if ((writeGen.get(key) || 0) === gen) cachePut(key, value, true);
  return value;
}

// 방처럼 version이 있는 값은 더 낮은 version으로 캐시를 되돌리지 않는다
// (동시에 끝난 두 쓰기의 응답 순서가 뒤바뀌어도 최신 방이 남게).
function cachePut(key, value, fromRead = false) {
  if (!fromRead) writeGen.set(key, (writeGen.get(key) || 0) + 1);
  const hit = readCache.get(key);
  if (!fromRead && hit?.raw != null && typeof value?.version === 'number') {
    const cur = JSON.parse(hit.raw);
    if (typeof cur?.version === 'number' && cur.version > value.version) return;
  }
  readCache.set(key, { raw: value == null ? null : JSON.stringify(value), at: Date.now() });
}

function cacheDrop(key) {
  writeGen.set(key, (writeGen.get(key) || 0) + 1);
  readCache.delete(key);
}
