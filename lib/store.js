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
