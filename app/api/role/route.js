import { henrikFetch } from '../../../lib/henrik';
import { agentRole } from '../../../lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  if (!name || !tag) return Response.json({ error: 'name and tag required', role: null }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set', role: null }, { status: 503 });

  try {
    // 경쟁전만 — 모드 필터가 없으면 스파이크 러시·데스매치·팀 데스매치 등
    // 아무 요원이나 고르는 모드까지 섞여 주 사용 요원과 포지션이 틀어졌다.
    // v3 by-name은 size와 상관없이 최대 10경기만 준다 (see app/api/stats).
    const res = await henrikFetch(
      `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=10`,
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
      const role = agentRole(agent);
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
