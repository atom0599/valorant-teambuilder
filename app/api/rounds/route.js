import { getJSON, setJSON, hasKV } from '../../../lib/store';
import { henrikFetch } from '../../../lib/henrik';

export const dynamic = 'force-dynamic';

const KEY = 'records:all';

// 라운드 기록이 생기기 전에 저장된 내전 경기의 라운드별 승리 팀을 HenrikDev에서
// 다시 받아 채운다. 홈 하이라이트의 "흐름" 장을 처음 열 때 그 경기 하나만 부른다.
// body: { matchKey: 'customs:<HenrikDev match id>' }. 그 경기를 가진 모든 선수
// 기록에 rounds('W'/'L', 그 선수 팀 기준)를 넣는다.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const matchKey = typeof body?.matchKey === 'string' ? body.matchKey : '';
  const m = matchKey.match(/^customs:([0-9a-f-]{20,})$/i);
  if (!m) return Response.json({ error: 'customs matchKey required' }, { status: 400 });
  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set' }, { status: 503 });

  const entriesOf = (all) => Object.values(all).flatMap((r) => (r.matches || []).filter((x) => x.matchKey === matchKey));
  try {
    const before = (await getJSON(KEY)) || {};
    const found = entriesOf(before);
    if (!found.length) return Response.json({ error: 'match not found' }, { status: 404 });
    if (found.every((x) => x.rounds)) return Response.json({ records: before, persistent: hasKV });

    const res = await henrikFetch(`https://api.henrikdev.xyz/valorant/v4/match/kr/${m[1]}`, { headers: { Authorization: key }, cache: 'no-store' });
    if (!res.ok) return Response.json({ error: res.status === 429 ? 'rate_limited' : `henrikdev ${res.status}` }, { status: 502 });
    const data = (await res.json())?.data;
    const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
    if (!rounds.length) return Response.json({ error: 'no rounds' }, { status: 502 });
    const seq = rounds.map((r) => r.winning_team);
    const red = seq.filter((t) => t === 'Red').length;
    const winTeam = red > seq.length - red ? 'Red' : 'Blue';
    const loseTeam = winTeam === 'Red' ? 'Blue' : 'Red';

    // HenrikDev 응답을 기다리는 동안 다른 저장이 있었을 수 있어 다시 읽고 쓴다.
    const all = (await getJSON(KEY)) || {};
    entriesOf(all).forEach((x) => {
      const team = x.result === '승' ? winTeam : loseTeam;
      x.rounds = seq.map((t) => (t === team ? 'W' : 'L')).join('');
    });
    await setJSON(KEY, all);
    return Response.json({ records: all, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
