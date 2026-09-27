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
