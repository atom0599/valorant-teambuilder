import { henrikFetch } from '../../../lib/henrik';

export const dynamic = 'force-dynamic';

// Custom (내전) games aren't reachable through HenrikDev's `mode=custom`
// filter (verified: it returns 0 even for accounts that have customs) — they
// come back in the unfiltered v4 history with queue.name "Custom Game" and an
// empty queue.id. So we page the plain history newest-first and pick them out
// ourselves. `since` (ms epoch, the banpick start) lets us stop paging as
// soon as we're past the current session.
const PAGE_SIZE = 10;
const MAX_PAGES = 5;

const norm = (p) => `${String(p?.name || '').trim()}#${String(p?.tag || '').trim()}`;

// Per-player combat stats for one match, alongside the plain roster names —
// ACS needs the match's total rounds (both teams' rounds-won summed, since
// every round has exactly one winner) which isn't known until both sides'
// round counts are read, so it's computed by the caller and passed in.
const statFor = (p, totalRounds) => {
  const st = p?.stats || {};
  const hsTotal = (st.headshots || 0) + (st.bodyshots || 0) + (st.legshots || 0);
  return {
    name: norm(p),
    agent: p?.agent?.name || null,
    agentIcon: p?.agent?.id ? `https://media.valorant-api.com/agents/${p.agent.id}/displayicon.png` : null,
    kills: st.kills || 0,
    deaths: st.deaths || 0,
    assists: st.assists || 0,
    acs: totalRounds ? Math.round((st.score || 0) / totalRounds) : 0,
    hsPct: hsTotal ? Math.round(((st.headshots || 0) / hsTotal) * 100) : 0
  };
};

export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  const since = Number(url.searchParams.get('since')) || 0;
  if (!name || !tag) return Response.json({ error: 'name and tag required' }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set' }, { status: 503 });

  const out = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await henrikFetch(
        `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${PAGE_SIZE}&start=${page * PAGE_SIZE}`,
        { headers: { Authorization: key }, cache: 'no-store' }
      );
      if (!res.ok) {
        // Keep whatever earlier pages already found rather than failing outright.
        if (out.length) break;
        return Response.json({ error: res.status === 429 ? 'rate_limited' : `henrikdev ${res.status}` }, { status: 502 });
      }
      const matches = (await res.json())?.data;
      if (!Array.isArray(matches) || !matches.length) break;

      let pastSince = false;
      for (const m of matches) {
        const started = Date.parse(m?.metadata?.started_at || '');
        if (since && Number.isFinite(started) && started < since) { pastSince = true; break; }

        const isCustom = m?.metadata?.queue?.name === 'Custom Game';
        const byId = Object.fromEntries((m?.teams || []).map((t) => [t.team_id, t]));
        if (!isCustom || !byId.Red || !byId.Blue) continue; // skips custom deathmatch etc.

        const players = Array.isArray(m.players) ? m.players : [];
        const redRounds = byId.Red.rounds?.won ?? 0;
        const blueRounds = byId.Blue.rounds?.won ?? 0;
        const totalRounds = redRounds + blueRounds;
        out.push({
          id: m.metadata.match_id,
          startedAt: m.metadata.started_at,
          map: m.metadata.map?.name || '',
          red: { rounds: redRounds, players: players.filter((p) => p.team_id === 'Red').map((p) => statFor(p, totalRounds)) },
          blue: { rounds: blueRounds, players: players.filter((p) => p.team_id === 'Blue').map((p) => statFor(p, totalRounds)) }
        });
      }
      if (pastSince || matches.length < PAGE_SIZE) break;
    }
    return Response.json({ matches: out }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
