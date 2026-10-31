import { henrikFetch } from '../../../lib/henrik';
import { agentIconUrl, toKoLabel } from '../../../lib/constants';
import { getJSON } from '../../../lib/store';

export const dynamic = 'force-dynamic';

// HenrikDev v3-by-name matches endpoint caps at 10 results and its `start`
// param doesn't actually paginate (verified empirically). v4 does support
// real pagination via `start`, but the response shape is different from v3:
// flat `players[]` (not players.all_players), `metadata.season.id` (not
// season_id), `stats.damage.dealt` (not top-level damage_made), and round
// count comes from teams[].rounds.won/lost (no rounds_played field). It also
// has no season filter, so we still infer "current season" the same way:
// the most recent competitive match sets the reference season id, and we
// page backward until a match's season no longer matches.
const PAGE_SIZE = 10; // HenrikDev's actual effective cap per request, regardless of a larger `size` value
const MAX_PAGES = 10; // up to 100 matches scanned, safety cap against very long seasons / API weirdness
const MAX_IDS = 120; // match ids remembered for the next incremental refresh

const SUM_KEYS = ['rounds', 'kills', 'deaths', 'assists', 'score', 'damage', 'hs', 'bs', 'ls'];

// ?name&tag (or ?puuid, preferred — survives a Riot ID rename) [&id=캐시 키]
//
// 증분 새로고침: id로 저장된 지난 결과(seasonstats:all[id])에 raw 합계와 본
// 경기 id 목록이 있고 시즌이 같으면, 그 뒤에 새로 한 경기만 받아서 더한다.
// 보통 요청 1번(예전엔 시즌 전체를 다시 훑느라 최대 10번, 서버가 3초 간격으로
// 보내니 한 사람에 30초)으로 끝난다.
export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const puuid = (url.searchParams.get('puuid') || '').trim();
  const id = (url.searchParams.get('id') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  if (!puuid && (!name || !tag)) return Response.json({ error: 'name and tag (or puuid) required' }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set' }, { status: 503 });

  let prior = null;
  if (id) {
    try { prior = ((await getJSON('seasonstats:all')) || {})[id] || null; } catch { /* full scan instead */ }
    if (!prior?.raw || !Array.isArray(prior.ids) || !prior.seasonId) prior = null;
  }

  try {
    let seasonId = null;
    const sum = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
    let matchesUsed = 0, maxKills = 0, scanned = 0;
    let fetchError = null;
    let selfPuuid = puuid || null;
    let account = null, matchTier = null;
    const agentCounts = {};
    const ids = [];
    let knownIds = null; // set once we know this is an incremental refresh
    let reachedKnown = false;

    for (let page = 0; page < MAX_PAGES && !reachedKnown; page++) {
      const start = page * PAGE_SIZE;
      const path = puuid
        ? `https://api.henrikdev.xyz/valorant/v4/by-puuid/matches/${region}/pc/${encodeURIComponent(puuid)}`
        : `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
      const res = await henrikFetch(`${path}?mode=competitive&size=${PAGE_SIZE}&start=${start}`, { headers: { Authorization: key }, cache: 'no-store' });
      if (!res.ok) {
        fetchError = res.status === 429 ? 'rate_limited' : `henrikdev ${res.status}`;
        break;
      }
      const json = await res.json();
      const matches = Array.isArray(json?.data) ? json.data : [];
      if (!matches.length) break;

      let hitSeasonBoundary = false;
      for (const m of matches) {
        const sid = m?.metadata?.season?.id;
        if (seasonId == null) {
          seasonId = sid;
          if (prior && prior.seasonId === sid) knownIds = new Set(prior.ids);
        }
        if (sid !== seasonId) { hitSeasonBoundary = true; break; }
        const mid = m?.metadata?.match_id;
        if (knownIds && mid && knownIds.has(mid)) { reachedKnown = true; break; }
        if (mid) ids.push(mid);

        scanned++;
        const players = Array.isArray(m?.players) ? m.players : [];
        const me = selfPuuid
          ? players.find((p) => p?.puuid === selfPuuid)
          : players.find(
              (p) => String(p?.name).trim().toLowerCase() === name.toLowerCase() && String(p?.tag).trim().toLowerCase() === tag.toLowerCase()
            );
        if (!me) continue;
        if (!selfPuuid) selfPuuid = me.puuid;
        // 가장 최근 경기의 이름 · 티어 — 닉변 감지(app/page.js 새로고침)와
        // 티어가 그대로면 티어 조회를 건너뛰는 데 쓴다.
        if (!account && me.name && me.tag) {
          account = `${me.name}#${me.tag}`;
          matchTier = toKoLabel(me.tier?.name);
        }

        const teams = Array.isArray(m?.teams) ? m.teams : [];
        const st = me.stats || {};
        const k = st.kills || 0;

        sum.rounds += teams.length ? (teams[0]?.rounds?.won || 0) + (teams[0]?.rounds?.lost || 0) : 0;
        sum.kills += k;
        sum.deaths += st.deaths || 0;
        sum.assists += st.assists || 0;
        sum.score += st.score || 0;
        sum.damage += st.damage?.dealt || 0;
        sum.hs += st.headshots || 0;
        sum.bs += st.bodyshots || 0;
        sum.ls += st.legshots || 0;
        matchesUsed++;
        maxKills = Math.max(maxKills, k);

        const agent = me.agent;
        if (agent?.id) {
          const key2 = agent.name || agent.id;
          if (!agentCounts[key2]) agentCounts[key2] = { count: 0, icon: agentIconUrl(agent.name, `https://media.valorant-api.com/agents/${agent.id}/displayicon.png`) };
          agentCounts[key2].count++;
        }
      }
      if (hitSeasonBoundary || matches.length < PAGE_SIZE) break;
    }

    if (knownIds) {
      // 중간에 끊긴 증분 결과를 저장하면 빠진 경기가 다음부터 영영 안 더해진다
      // (다음 새로고침은 저장된 id에서 멈추니까) — 실패는 실패로 돌려준다.
      if (fetchError) return Response.json({ matches: 0, seasonId, error: fetchError });
      SUM_KEYS.forEach((k) => { sum[k] += prior.raw[k] || 0; });
      matchesUsed += prior.raw.matches || 0;
      maxKills = Math.max(maxKills, prior.raw.maxKills || 0);
      Object.entries(prior.raw.agentCounts || {}).forEach(([a, v]) => {
        if (!agentCounts[a]) agentCounts[a] = { count: 0, icon: v.icon };
        agentCounts[a].count += v.count || 0;
      });
      ids.push(...prior.ids);
      if (!account) { account = prior.account || null; matchTier = prior.matchTier || null; }
    }

    if (!matchesUsed) {
      return Response.json({
        matches: 0,
        seasonId,
        error: fetchError || (scanned > 0 ? 'self_not_found_in_matches' : undefined)
      });
    }

    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([agent, v]) => ({ agent, count: v.count, pct: Math.round((v.count / matchesUsed) * 100), icon: v.icon }));

    const { rounds, kills, deaths, assists, score, damage, hs, bs, ls } = sum;
    return Response.json({
      seasonId,
      matches: matchesUsed,
      rounds,
      acs: rounds ? Math.round(score / rounds) : 0,
      adr: rounds ? Math.round(damage / rounds) : 0,
      kpr: rounds ? Math.round((kills / rounds) * 100) / 100 : 0,
      apr: rounds ? Math.round((assists / rounds) * 100) / 100 : 0,
      hsPct: hs + bs + ls ? Math.round((hs / (hs + bs + ls)) * 100) : 0,
      kills,
      deaths,
      kd: deaths ? Math.round((kills / deaths) * 100) / 100 : kills,
      maxKills,
      topAgents,
      account,
      puuid: selfPuuid,
      matchTier,
      newMatches: knownIds ? ids.length - prior.ids.length : null,
      // 다음 증분 새로고침용. 전체를 다시 훑다 중간에 끊긴 결과(fetchError)는
      // 이어 붙이면 안 되니 raw를 빼서 다음엔 처음부터 다시 훑게 한다.
      ...(fetchError ? {} : { raw: { ...sum, matches: matchesUsed, maxKills, agentCounts }, ids: [...new Set(ids)].slice(0, MAX_IDS) })
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
