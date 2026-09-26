// Supabase Storage helpers for uploaded clip videos. Files go straight from
// the browser to Supabase through a signed upload URL — Vercel Functions cap
// request bodies at 4.5 MB, far below a typical clip — so the server only
// hands out upload URLs and deletes objects.

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const BUCKET = 'clips';
// Supabase's free plan caps every upload at 50 MB regardless of bucket settings.
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
export const storageEnabled = !!(SUPABASE_URL && SUPABASE_KEY);

const headers = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });

export const publicUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
export const publicPrefix = () => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

// Created on first use instead of requiring a manual dashboard step. Public
// so <video> can stream it directly; writes still need a signed URL.
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) {
    const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_CLIP_BYTES, allowed_mime_types: ['video/*'] })
    });
    // 409 = someone else created it in the meantime — fine.
    if (!created.ok && created.status !== 409) throw new Error(`bucket create ${created.status} ${await created.text().catch(() => '')}`);
  }
  bucketReady = true;
}

export async function createSignedUpload(path) {
  await ensureBucket();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: headers(), cache: 'no-store'
  });
  if (!res.ok) throw new Error(`sign upload ${res.status} ${await res.text().catch(() => '')}`);
  const d = await res.json();
  return `${SUPABASE_URL}/storage/v1${d.url}`;
}

export async function removeObject(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: headers() });
  if (!res.ok && res.status !== 404) throw new Error(`delete object ${res.status}`);
}
