import { henrikFetch } from '../../../lib/henrik';

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

export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  if (!name || !tag) return Response.json({ error: 'name and tag required' }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set' }, { status: 503 });

  try {
    let seasonId = null;
    let rounds = 0, kills = 0, deaths = 0, assists = 0, score = 0, damage = 0, hs = 0, bs = 0, ls = 0;
    let matchesUsed = 0, maxKills = 0, scanned = 0;
    let fetchError = null;
    let selfPuuid = null;
    const agentCounts = {};

    for (let page = 0; page < MAX_PAGES; page++) {
      const start = page * PAGE_SIZE;
      const res = await henrikFetch(
        `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=${PAGE_SIZE}&start=${start}`,
        { headers: { Authorization: key }, cache: 'no-store' }
      );
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
        if (seasonId == null) seasonId = sid;
        if (sid !== seasonId) { hitSeasonBoundary = true; break; }

        scanned++;
        const players = Array.isArray(m?.players) ? m.players : [];
        const me = selfPuuid
          ? players.find((p) => p?.puuid === selfPuuid)
          : players.find(
              (p) => String(p?.name).trim().toLowerCase() === name.toLowerCase() && String(p?.tag).trim().toLowerCase() === tag.toLowerCase()
            );
        if (!me) continue;
        if (!selfPuuid) selfPuuid = me.puuid;

        const teams = Array.isArray(m?.teams) ? m.teams : [];
        const roundsThisMatch = teams.length ? (teams[0]?.rounds?.won || 0) + (teams[0]?.rounds?.lost || 0) : 0;
        const st = me.stats || {};
        const k = st.kills || 0;

        rounds += roundsThisMatch;
        kills += k;
        deaths += st.deaths || 0;
        assists += st.assists || 0;
        score += st.score || 0;
        damage += st.damage?.dealt || 0;
        hs += st.headshots || 0;
        bs += st.bodyshots || 0;
        ls += st.legshots || 0;
        matchesUsed++;
        maxKills = Math.max(maxKills, k);

        const agent = me.agent;
        if (agent?.id) {
          const key2 = agent.name || agent.id;
          if (!agentCounts[key2]) agentCounts[key2] = { count: 0, icon: `https://media.valorant-api.com/agents/${agent.id}/displayicon.png` };
          agentCounts[key2].count++;
        }
      }
      if (hitSeasonBoundary || matches.length < PAGE_SIZE) break;
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
      .slice(0, 3)
      .map(([agent, v]) => ({ agent, count: v.count, pct: Math.round((v.count / matchesUsed) * 100), icon: v.icon }));

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
      topAgents
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
