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
    // When a rename folds a duplicate entry (already re-added under the new
    // name) into the original, both previous entries' alts carry over.
    const prevs = [prevByName.get(name), puuid && prevByPuuid.get(puuid)].filter(Boolean);
    const prevAlts = [...new Set(prevs.flatMap((x) => x.alts || []))].filter((a) => a.toLowerCase() !== name.toLowerCase());
    // 부계정별 puuid (부계정 닉변 감지용, app/page.js 새로고침). 이 필드를
    // 모르는 예전 화면이 보낸 명단이어도 지워지지 않게 이전 값 위에 덮는다.
    const prevAltPuuids = Object.assign({}, ...prevs.map((x) => x.altPuuids || {}));
    const altPuuids = { ...prevAltPuuids, ...(r?.altPuuids && typeof r.altPuuids === 'object' ? r.altPuuids : {}) };
    // 부계정 닉변(같은 puuid, 이름만 바뀜)은 관리자가 아니어도 통과 — 계정
    // 목록 자체는 그대로니까. puuid를 아는 부계정은 puuid로 맞춰 본다.
    const ident = (list, pu) => list.map((a) => pu[a] || a);
    const sameAccounts = sameSet(ident(alts, altPuuids), ident(prevAlts, prevAltPuuids));
    const finalAlts = (prevs.length && !admin && !sameSet(alts, prevAlts) && !sameAccounts) ? prevAlts : alts;
    const keptAltPuuids = Object.fromEntries(finalAlts.filter((a) => altPuuids[a]).map((a) => [a, String(altPuuids[a])]));
    map.set(name, { name, pos: r.pos || '미정', realName: String(r?.realName || '').trim(), alts: finalAlts, puuid, altPuuids: keptAltPuuids });
  });
  const roster = [...map.values()];

  try {
    await setJSON(KEY, roster);
    return Response.json({ roster, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
