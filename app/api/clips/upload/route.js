import { randomUUID } from 'crypto';
import { storageEnabled, createSignedUpload, publicUrl, MAX_CLIP_BYTES } from '../../../../lib/clipStorage';

export const dynamic = 'force-dynamic';

// Step 1 of a file clip: hands the browser a one-time signed URL to PUT the
// video straight into Supabase Storage. Step 2 is /api/clips `create` with
// the returned `path`.
// body: { type: 'video/mp4', size: bytes, ext: 'mp4' }
export async function POST(request) {
  if (!storageEnabled) return Response.json({ error: 'storage not configured' }, { status: 503 });
  const body = await request.json().catch(() => null);
  const type = String(body?.type || '');
  const size = Number(body?.size);
  if (!type.startsWith('video/')) return Response.json({ error: 'video files only' }, { status: 400 });
  if (!(size > 0) || size > MAX_CLIP_BYTES) return Response.json({ error: 'too_large', max: MAX_CLIP_BYTES }, { status: 400 });
  const ext = /^[a-z0-9]{2,5}$/i.test(body?.ext || '') ? body.ext.toLowerCase() : 'mp4';

  try {
    const path = `${Date.now()}-${randomUUID()}.${ext}`;
    const uploadUrl = await createSignedUpload(path);
    return Response.json({ path, uploadUrl, publicUrl: publicUrl(path) });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
