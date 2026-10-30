import { getJSON, setJSON, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

const KEY = 'records:all';
const KEYS_KEY = 'records:savedKeys';
// Player ids an admin has hidden from the 선수별 leaderboard. Kept apart from
// `records:all` so excluding someone never touches their actual record —
// un-excluding brings them straight back with everything intact.
const EXCLUDED_KEY = 'records:excluded';

// Folds record `src` into `dst` (same person under two keys). Matches are
// deduped by matchKey (falling back to date) in case the same match ended
// up saved under both; a duplicate's win/loss is taken back out of the
// summed counters so it can't count twice.
function mergeRecords(dst, src) {
  const seen = new Set((dst?.matches || []).map((m) => m.matchKey || String(m.date)));
  let wins = (dst?.wins || 0) + (src?.wins || 0);
  let losses = (dst?.losses || 0) + (src?.losses || 0);
  const matches = [...(dst?.matches || [])];
  (src?.matches || []).forEach((m) => {
    const k = m.matchKey || String(m.date);
    if (seen.has(k)) { if (m.result === '승') wins--; else losses--; return; }
    seen.add(k);
    matches.push(m);
  });
  matches.sort((x, y) => y.date - x.date);
  const puuids = [...new Set([...(dst?.puuids || []), ...(src?.puuids || [])])];
  return { wins: Math.max(0, wins), losses: Math.max(0, losses), matches, ...(puuids.length ? { puuids } : {}) };
}

async function renameExcluded(from, to) {
  const excluded = (await getJSON(EXCLUDED_KEY)) || [];
  if (excluded.includes(from)) await setJSON(EXCLUDED_KEY, [...new Set(excluded.map((x) => (x === from ? to : x)))]);
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  try {
    const [all, excluded] = await Promise.all([getJSON(KEY), getJSON(EXCLUDED_KEY)]);
    if (id) return Response.json({ id, record: (all || {})[id] || null, persistent: hasKV });
    return Response.json({ records: all || {}, excluded: excluded || [], persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), records: {} }, { status: 502 });
  }
}

// body: { winner: 'A'|'B', score: '2 : 1', maps: string[], teams: { A: [{name, tier}], B: [...] } }
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.winner || !body?.teams) return Response.json({ error: 'winner and teams required' }, { status: 400 });

  try {
    const all = (await getJSON(KEY)) || {};

    // Everyone in the room can hit "전적에 저장" — the client sends a per-match
    // key (the banpick session seed) so the same match is only ever counted
    // once, however many people click it.
    const matchKey = body.matchKey != null ? String(body.matchKey) : null;
    const savedKeys = matchKey ? ((await getJSON(KEYS_KEY)) || []) : [];
    if (matchKey && savedKeys.includes(matchKey)) {
      return Response.json({ records: all, duplicate: true, persistent: hasKV });
    }

    // Regular saves omit `date` and get "now" (the match just finished). A
    // past-customs import (see 과거 내전 불러오기 in app/page.js) knows the
    // real HenrikDev `startedAt` for that match and passes it explicitly —
    // otherwise every backfilled match would show today's date (import time)
    // instead of when it was actually played.
    const date = Number.isFinite(body.date) ? body.date : Date.now();
    const mapLabel = (body.maps || []).join(', ');

    let wrote = 0;
    const renamed = [];
    ['A', 'B'].forEach((side) => {
      (body.teams[side] || []).forEach((p) => {
        if (!p?.name) return;
        // Same Riot account already recorded under another key = they
        // changed their Riot ID since. Move that history onto the name
        // this match is being saved under so it stays one person.
        const puuid = p.puuid ? String(p.puuid) : null;
        if (puuid) {
          Object.keys(all).forEach((k) => {
            if (k === p.name || !(all[k].puuids || []).includes(puuid)) return;
            // 여러 계정(본계정 + 부계정)이 합쳐진 기록은 옮기지 않는다 — 부계정
            // 하나가 닉변했다고 그 사람 전적 전체가 부계정의 새 이름으로 넘어가
            // 버렸다(본계정 이름은 그대로인데).
            if ((all[k].puuids || []).some((x) => x !== puuid)) return;
            all[p.name] = mergeRecords(all[p.name], all[k]);
            delete all[k];
            renamed.push([k, p.name]);
          });
        }
        const r = all[p.name] || { wins: 0, losses: 0, matches: [] };
        if (puuid && !(r.puuids || []).includes(puuid)) r.puuids = [...(r.puuids || []), puuid];
        const win = side === body.winner;
        r[win ? 'wins' : 'losses'] += 1;
        // kills/deaths/assists/acs/hsPct are only present for matches
        // imported from real HenrikDev data (과거 내전 불러오기) — a regular
        // in-app save has no per-player combat stats, so these stay null.
        // Every match is kept (no per-player cap) — 함께한 팀원 and 경기별
        // 기록 are rebuilt from these lists, so a cap silently dropped older
        // matches from them while the win/loss counters still had them.
        // matchKey rides along on the entry itself so a later delete-by-date
        // (see DELETE below) can free it back up in `records:savedKeys` —
        // otherwise a deleted match could never be re-imported, since its
        // dedup key would still say "already saved" forever.
        r.matches = [{
          date, map: mapLabel, score: body.score || '', result: win ? '승' : '패', tier: p.tier ?? null, tierIcon: p.tierIcon ?? null,
          agent: p.agent ?? null, agentIcon: p.agentIcon ?? null,
          kills: p.kills ?? null, deaths: p.deaths ?? null, assists: p.assists ?? null, acs: p.acs ?? null, hsPct: p.hsPct ?? null,
          combat: p.combat ?? null, mvp: p.mvp ?? null,
          firstKills: p.firstKills ?? null, firstDeaths: p.firstDeaths ?? null,
          plants: p.plants ?? null, defuses: p.defuses ?? null, clutches: p.clutches ?? null,
          matchKey
        }, ...(r.matches || [])];
        all[p.name] = r;
        wrote++;
      });
    });

    // A matchKey is only worth remembering (to block a future re-submit as a
    // duplicate) if this submission actually wrote someone's record. Marking
    // it "saved" regardless — e.g. both teams somehow came through empty —
    // would permanently block that real match from ever being importable
    // again while leaving it recorded nowhere, which is worse than just
    // letting a genuinely empty submission be retried.
    if (wrote) await setJSON(KEY, all);
    for (const [from, to] of renamed) await renameExcluded(from, to);
    if (matchKey && wrote) await setJSON(KEYS_KEY, [matchKey, ...savedKeys].slice(0, 5000));
    return Response.json({ records: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

// Not admin-gated — fires automatically when app/page.js's runLookup detects
// a Riot ID rename (via the by-puuid fallback) so a name change migrates
// existing history onto the new name instead of fragmenting it into two
// separate leaderboard entries. body: { from, to }. If `to` already has its
// own record (they were re-registered under the new name before the
// rename was noticed), the two get merged via mergeRecords rather than
// one clobbering the other.
export async function PATCH(request) {
  const body = await request.json().catch(() => null);
  const from = body?.from ? String(body.from).trim() : null;
  const to = body?.to ? String(body.to).trim() : null;
  if (!from || !to || from === to) return Response.json({ error: 'from and to (different) required' }, { status: 400 });

  try {
    const all = (await getJSON(KEY)) || {};
    const src = all[from];
    if (!src) return Response.json({ records: all, persistent: hasKV });

    all[to] = mergeRecords(all[to], src);
    delete all[from];

    await setJSON(KEY, all);
    // An excluded player stays excluded under their new Riot ID.
    await renameExcluded(from, to);
    return Response.json({ records: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

// Admin only. body: { id, excluded: boolean } hides (or restores) one player
// on the 선수별 leaderboard without deleting anything from their record.
export async function PUT(request) {
  if (!isAdmin(request)) return Response.json({ error: 'admin only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = body?.id != null ? String(body.id) : null;
  if (!id || typeof body.excluded !== 'boolean') return Response.json({ error: 'id and excluded required' }, { status: 400 });

  try {
    const cur = (await getJSON(EXCLUDED_KEY)) || [];
    const next = body.excluded ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
    await setJSON(EXCLUDED_KEY, next);
    return Response.json({ excluded: next, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

// Admin only. body: { id } removes one player's whole record, or
// { date } removes one saved match from every player who played it (all
// players of a match share the same `date`, see POST above) and rolls their
// win/loss counters back accordingly.
export async function DELETE(request) {
  if (!isAdmin(request)) return Response.json({ error: 'admin only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || (body.id == null && body.date == null)) return Response.json({ error: 'id or date required' }, { status: 400 });

  try {
    const all = (await getJSON(KEY)) || {};
    if (body.id != null) {
      delete all[body.id];
    } else {
      const freedKeys = new Set();
      Object.keys(all).forEach((name) => {
        const r = all[name];
        const removed = (r.matches || []).filter((m) => m.date === body.date);
        if (!removed.length) return;
        removed.forEach((m) => {
          if (m.result === '승') r.wins = Math.max(0, r.wins - 1); else r.losses = Math.max(0, r.losses - 1);
          if (m.matchKey) freedKeys.add(m.matchKey);
        });
        r.matches = r.matches.filter((m) => m.date !== body.date);
        if (r.wins + r.losses <= 0) delete all[name];
      });
      // Deleting a whole match (every player who has it, by date) should let
      // it be imported again later — otherwise its 과거 내전 불러오기 dedup
      // key stays "already saved" forever with nothing actually recorded
      // anywhere, which is exactly the stuck state this is fixing.
      if (freedKeys.size) {
        const savedKeys = (await getJSON(KEYS_KEY)) || [];
        await setJSON(KEYS_KEY, savedKeys.filter((k) => !freedKeys.has(k)));
      }
    }
    await setJSON(KEY, all);
    return Response.json({ records: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
