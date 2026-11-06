import { getJSON, getCached, setJSON, withLock, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';
import { logAdmin } from '../../../lib/adminLog';

export const dynamic = 'force-dynamic';

const KEY = 'roster:all';
const sameSet = (x, y) => JSON.stringify([...(x || [])].sort()) === JSON.stringify([...(y || [])].sort());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 보낸 명단을 그대로 저장하지 않고 3-way로 합친다. 예전엔 받은 목록으로 통째로
// 바꿔서, 오래 열어 둔 탭이 예전 명단을 보내면 그 사이 다른 사람이 추가한 사람이
// 빠지거나 바꾼 포지션이 되돌아갔다. 이제 클라이언트는 마지막으로 서버에서 받은
// 명단(base)을 같이 보내고, 서버는 base와 비교해 이 탭이 실제로 바꾼 것만 지금
// 명단(cur)에 반영한다:
//   - base에 있었는데 보낸 목록에 없음  → 이 탭이 삭제
//   - base와 다르게 보냄 / base에 없던 사람 → 이 탭이 추가 · 수정
//   - base와 똑같이 보냄 / 이 탭이 모르는 사람 → 지금 서버 값 유지
// base가 없는 예전 화면은 삭제를 못 한다(추가 · 수정만).
function mergeRoster(cur, sent, base) {
  const byName = (list) => new Map((list || []).filter((r) => r?.name).map((r) => [String(r.name).trim(), r]));
  const curM = byName(cur), sentM = byName(sent), baseM = base ? byName(base) : null;
  const out = new Map(curM);
  if (baseM) baseM.forEach((_, name) => { if (!sentM.has(name)) out.delete(name); });
  sentM.forEach((r, name) => {
    const b = baseM?.get(name);
    if (b && same(b, r) && out.has(name)) return;
    out.set(name, r);
    // 닉변(같은 puuid, 새 이름): 이 탭이 예전 이름을 몰라 base에서 못 지웠어도 옛 항목을 뺀다.
    if (r.puuid) curM.forEach((c, n) => { if (n !== name && c.puuid === r.puuid && !sentM.has(n)) out.delete(n); });
  });
  return [...out.values()];
}

export async function GET() {
  try {
    const roster = (await getCached(KEY, 60000)) || [];
    return Response.json({ roster, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), roster: [] }, { status: 502 });
  }
}

// body: { roster: [{ name, pos, realName, alts, puuid }], base: 마지막으로 받은 명단 } — mergeRoster로 합친다, deduped by name.
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
  return withLock(KEY, async () => {
  let prevList = [];
  try { prevList = (await getJSON(KEY)) || []; } catch { /* treat as empty, not fatal for a fresh roster */ }
  const merged = mergeRoster(prevList, body.roster, Array.isArray(body.base) ? body.base : null);
  const prevByName = new Map(prevList.map((r) => [r.name, r]));
  const prevByPuuid = new Map(prevList.filter((r) => r.puuid).map((r) => [r.puuid, r]));

  const map = new Map();
  const altLog = [];
  merged.forEach((r) => {
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
    if (admin && !sameAccounts) {
      const added = finalAlts.filter((a) => !prevAlts.includes(a)), removed = prevAlts.filter((a) => !finalAlts.includes(a));
      if (added.length) altLog.push(['부계정 추가', `${name} ← ${added.join(', ')}`]);
      if (removed.length) altLog.push(['부계정 삭제', `${name} ✕ ${removed.join(', ')}`]);
    }
    const keptAltPuuids = Object.fromEntries(finalAlts.filter((a) => altPuuids[a]).map((a) => [a, String(altPuuids[a])]));
    map.set(name, { name, pos: r.pos || '미정', realName: String(r?.realName || '').trim(), alts: finalAlts, puuid, altPuuids: keptAltPuuids });
  });
  const roster = [...map.values()];

  try {
    await setJSON(KEY, roster);
    for (const [a, d] of altLog) await logAdmin(a, d);
    return Response.json({ roster, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
  });
}
