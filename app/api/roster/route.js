import { getJSON, setJSON, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

const KEY = 'roster:all';
const sameSet = (x, y) => JSON.stringify([...(x || [])].sort()) === JSON.stringify([...(y || [])].sort());

export async function GET() {
  try {
    const roster = (await getJSON(KEY)) || [];
    return Response.json({ roster, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), roster: [] }, { status: 502 });
  }
}

// body: { roster: [{ name, pos, realName, alts, puuid }] } — full replace, deduped by name.
// `alts` are other Riot IDs (부계정) the same person also plays on — see
// rosterAlias in app/page.js, which folds their match records back onto
// `name` so switching accounts doesn't split one person's 전적 in two.
// `puuid` (Riot's stable per-account id, cached from the last successful
// tier lookup) survives a Riot ID rename even though `name` doesn't — it's
// what lets a later lookup detect the rename and auto-relink instead of
// silently failing under the now-stale name.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.roster)) return Response.json({ error: 'roster array required' }, { status: 400 });

  const admin = isAdmin(request);
  let prevList = [];
  try { prevList = (await getJSON(KEY)) || []; } catch { /* treat as empty, not fatal for a fresh roster */ }
  const prevByName = new Map(prevList.map((r) => [r.name, r]));
  const prevByPuuid = new Map(prevList.filter((r) => r.puuid).map((r) => [r.puuid, r]));

  const map = new Map();
  body.roster.forEach((r) => {
    const name = String(r?.name || '').trim();
    if (!name) return;
    const puuid = r?.puuid ? String(r.puuid).trim() : null;
    const alts = Array.isArray(r?.alts) ? [...new Set(r.alts.map((a) => String(a || '').trim()).filter(Boolean))] : [];
    // 부계정 add/remove is admin-only — matched against the previous entry by
    // name, or by puuid when the name itself changed (a detected Riot ID
    // rename, see relinkRosterName in app/page.js, still needs to go
    // through even for non-admin callers; only the *alts list* is protected).
    const prev = prevByName.get(name) || (puuid && prevByPuuid.get(puuid));
    const finalAlts = (prev && !admin && !sameSet(alts, prev.alts)) ? (prev.alts || []) : alts;
    map.set(name, { name, pos: r.pos || '미정', realName: String(r?.realName || '').trim(), alts: finalAlts, puuid });
  });
  const roster = [...map.values()];

  try {
    await setJSON(KEY, roster);
    return Response.json({ roster, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
