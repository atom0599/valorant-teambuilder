import { getJSON, setJSON, hasKV } from '../../../lib/store';

export const dynamic = 'force-dynamic';

// Cached per-player season stats, independent of any room (the shared room
// persists indefinitely too, but this data is about the player's real
// Valorant performance, not a specific match — same lifetime class as
// /api/records and /api/roster).
const KEY = 'seasonstats:all';
// Current-season tier per player ({ tier: TIERS index | null, tierIcon, at }),
// kept apart from the stats blob above so a tier refresh never clobbers
// season K/D (or vice versa). This is what 전체전적 shows — the tier stored on
// each match record is only a snapshot from import time and could be a peak
// tier fallback, not what the player is this season.
const TIERS_KEY = 'seasonstats:tiers';

export async function GET() {
  try {
    const [stats, tiers] = await Promise.all([getJSON(KEY), getJSON(TIERS_KEY)]);
    return Response.json({ stats: stats || {}, tiers: tiers || {}, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), stats: {}, tiers: {} }, { status: 502 });
  }
}

// body: { id: '닉네임#태그', data: {...} } — merges one player's stats into the shared cache
// body: { id: '닉네임#태그', tier: { tier, tierIcon, at } } — sets one player's current-season tier
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.id || (!body?.data && !body?.tier)) return Response.json({ error: 'id and data (or tier) required' }, { status: 400 });

  try {
    if (body.tier) {
      const tiers = (await getJSON(TIERS_KEY)) || {};
      tiers[body.id] = body.tier;
      await setJSON(TIERS_KEY, tiers);
      return Response.json({ tiers, persistent: hasKV });
    }
    const all = (await getJSON(KEY)) || {};
    all[body.id] = body.data;
    await setJSON(KEY, all);
    return Response.json({ stats: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
