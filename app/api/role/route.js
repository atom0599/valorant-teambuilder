import { henrikFetch } from '../../../lib/henrik';

export const dynamic = 'force-dynamic';

// Valorant agent -> in-game role, mapped to this app's Korean position labels.
// New agents ship every few patches — add them here as they release.
const AGENT_ROLE = {
  jett: '타격대', phoenix: '타격대', raze: '타격대', reyna: '타격대',
  yoru: '타격대', neon: '타격대', iso: '타격대', waylay: '타격대',
  sova: '척후대', breach: '척후대', skye: '척후대', kayo: '척후대',
  fade: '척후대', gekko: '척후대', tejo: '척후대',
  brimstone: '전략가', viper: '전략가', omen: '전략가', astra: '전략가',
  harbor: '전략가', clove: '전략가',
  cypher: '감시자', killjoy: '감시자', sage: '감시자', chamber: '감시자',
  deadlock: '감시자', vyse: '감시자'
};

function normalizeAgent(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  if (!name || !tag) return Response.json({ error: 'name and tag required', role: null }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set', role: null }, { status: 503 });

  try {
    const res = await henrikFetch(
      `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=30`,
      { headers: { Authorization: key }, cache: 'no-store' }
    );
    if (!res.ok) return Response.json({ error: `henrikdev ${res.status}`, role: null, topAgents: [] }, { status: res.status });

    const json = await res.json();
    const matches = Array.isArray(json?.data) ? json.data : [];

    const roleCounts = {};
    const agentCounts = {};
    let analyzed = 0;
    let totalAgentMatches = 0;
    for (const m of matches) {
      const players = m?.players?.all_players || [];
      const me = players.find(
        (p) => String(p?.name).toLowerCase() === name.toLowerCase() && String(p?.tag).toLowerCase() === tag.toLowerCase()
      );
      const agent = me?.character;
      if (!agent) continue;
      totalAgentMatches++;
      if (!agentCounts[agent]) {
        agentCounts[agent] = { count: 0, icon: me.assets?.agent?.small || null, portrait: me.assets?.agent?.bust || null };
      }
      agentCounts[agent].count++;
      const role = AGENT_ROLE[normalizeAgent(agent)];
      if (role) { roleCounts[role] = (roleCounts[role] || 0) + 1; analyzed++; }
    }

    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([agent, v]) => ({
        agent, count: v.count, icon: v.icon, portrait: v.portrait,
        pct: totalAgentMatches ? Math.round((v.count / totalAgentMatches) * 100) : 0
      }));

    if (!analyzed) return Response.json({ role: null, counts: roleCounts, analyzed: 0, topAgents });

    const [topRole, topCount] = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0];
    const role = topCount / analyzed >= 0.5 ? topRole : '플렉스';

    return Response.json({ role, counts: roleCounts, analyzed, topAgents });
  } catch (e) {
    return Response.json({ error: String(e), role: null, topAgents: [] }, { status: 502 });
  }
}
