import { setJSON, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';
import { ROTATION, normalizePool } from '../../../lib/constants';
import { MAPPOOL_KEY, loadRotation } from '../../../lib/mappool';

export const dynamic = 'force-dynamic';

// See lib/mappool.js for why this is stored separately from the room.
export async function GET() {
  try {
    return Response.json({ rotation: await loadRotation(), persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), rotation: ROTATION }, { status: 502 });
  }
}

// Admin only. body: { rotation: string[] }
export async function POST(request) {
  if (!isAdmin(request)) return Response.json({ error: 'admin only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const rotation = normalizePool(body?.rotation);
  if (!Array.isArray(rotation) || !rotation.length) return Response.json({ error: 'rotation array required' }, { status: 400 });
  try {
    await setJSON(MAPPOOL_KEY, rotation);
    return Response.json({ rotation, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
