import { getJSON, setJSON, hasKV } from '../../../lib/store';

export const dynamic = 'force-dynamic';

// Cached per-player season stats, independent of any room (the shared room
// persists indefinitely too, but this data is about the player's real
// Valorant performance, not a specific match — same lifetime class as
// /api/records and /api/roster).
const KEY = 'seasonstats:all';

export async function GET() {
  try {
    const stats = (await getJSON(KEY)) || {};
    return Response.json({ stats, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), stats: {} }, { status: 502 });
  }
}

// body: { id: '닉네임#태그', data: {...} } — merges one player's stats into the shared cache
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.id || !body?.data) return Response.json({ error: 'id and data required' }, { status: 400 });

  try {
    const all = (await getJSON(KEY)) || {};
    all[body.id] = body.data;
    await setJSON(KEY, all);
    return Response.json({ stats: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
