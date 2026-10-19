// 전체 전적의 자동 칭호와 명예의 전당. 둘 다 저장된 내전 기록(records)만으로
// 매번 계산한다 — 따로 저장하는 값이 없어서 경기가 추가·삭제되면 바로 바뀐다.
import { agentKo } from './constants';

// 칭호 목록. 순서 = 우선순위 (순위표에는 맨 앞 칭호 하나만 보인다).
// name은 칭호 도감에 보이는 이름, desc는 받는 조건 설명.
export const TITLE_DEFS = [
  { id: 'mvpMaker', icon: '👑', name: 'MVP 제조기', desc: '경기 MVP를 4판에 1번 이상 받았습니다. (8판 이상)' },
  { id: 'busDriver', icon: '🚌', name: '버스 기사', desc: 'K/D 1.2 이상에 승률 55% 이상. 팀을 태우고 이기는 사람입니다. (스탯 있는 경기 5판 이상)' },
  { id: 'unlucky', icon: '😢', name: '억울한 사람', desc: '경기 MVP·팀 MVP를 합쳐 10판에 3번 이상 받았는데 승률은 45% 미만입니다. (8판 이상)' },
  { id: 'headhunter', icon: '🎯', name: '헤드헌터', desc: '내전 평균 헤드샷률 30% 이상. (스탯 있는 경기 5판 이상)' },
  { id: 'agentMain', icon: '🧬', name: '○○ 장인', desc: '한 요원으로 5판 이상, 요원 기록이 있는 경기의 절반 이상을 그 요원으로 했습니다.' },
  { id: 'mapKing', icon: '🗺️', name: '○○ 지배자', desc: '한 맵에서 5판 이상 하고 그 맵 승률이 70% 이상입니다. 여러 맵이면 승률이 가장 높은 맵.' },
  { id: 'onFire', icon: '🔥', name: '상승세', desc: '최근 5경기에서 4승 이상. (5판 이상)' },
  { id: 'passenger', icon: '🎫', name: '버스 승객', desc: 'K/D는 0.9 미만인데 승률은 55% 이상. 잘 타고 다니는 사람입니다. (스탯 있는 경기 5판 이상)' },
  { id: 'helper', icon: '🤝', name: '도우미', desc: '경기당 어시스트 7개 이상. (스탯 있는 경기 5판 이상)' },
  { id: 'allRounder', icon: '🎲', name: '만능 플레이어', desc: '내전에서 서로 다른 요원을 8개 이상 했습니다.' },
  { id: 'veteran', icon: '🏠', name: '내전 고인물', desc: '내전을 가장 많이 한 사람입니다. (1명, 공동이면 모두)' },
  { id: 'slump', icon: '🧊', name: '슬럼프', desc: '최근 5경기에서 1승 이하. (5판 이상)' }
];

const byDate = (a, b) => a.date - b.date;

// 기록 순서대로 연승/연패 최대치.
function streaks(sorted) {
  let win = 0, lose = 0, maxWin = 0, maxLose = 0, winEnd = null, loseEnd = null;
  sorted.forEach((m) => {
    if (m.result === '승') { win += 1; lose = 0; if (win > maxWin) { maxWin = win; winEnd = m.date; } }
    else { lose += 1; win = 0; if (lose > maxLose) { maxLose = lose; loseEnd = m.date; } }
  });
  return { maxWin, maxLose, winEnd, loseEnd };
}

// id -> [{ id, icon, name, desc }] (TITLE_DEFS 순서).
export function computeTitles(records, mvpCounts) {
  const out = {};
  const maxGames = Math.max(0, ...Object.values(records).map((r) => (r.matches || []).length));
  Object.entries(records).forEach(([id, r]) => {
    const ms = [...(r.matches || [])].sort(byDate);
    const games = ms.length;
    if (!games) return;
    const wins = ms.filter((m) => m.result === '승').length;
    const rate = (wins / games) * 100;
    const st = ms.filter((m) => m.kills != null);
    const kills = st.reduce((n, m) => n + m.kills, 0);
    const deaths = st.reduce((n, m) => n + m.deaths, 0);
    const kd = st.length ? (deaths ? kills / deaths : kills) : null;
    const hs = st.length ? st.reduce((n, m) => n + (m.hsPct || 0), 0) / st.length : null;
    const ast = st.length ? st.reduce((n, m) => n + (m.assists || 0), 0) / st.length : null;
    const mvp = mvpCounts[id]?.mvp || 0;
    const teamMvp = mvpCounts[id]?.teamMvp || 0;
    const last5 = ms.slice(-5);
    const last5Wins = last5.filter((m) => m.result === '승').length;

    const agents = {};
    ms.forEach((m) => { if (m.agent) agents[m.agent] = (agents[m.agent] || 0) + 1; });
    const agentGames = Object.values(agents).reduce((a, b) => a + b, 0);
    const [topAgent, topAgentN] = Object.entries(agents).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    const maps = {};
    ms.forEach((m) => {
      if (!m.map || String(m.map).includes(',')) return;
      const e = (maps[m.map] ||= { g: 0, w: 0 });
      e.g += 1; if (m.result === '승') e.w += 1;
    });
    const kingMap = Object.entries(maps)
      .filter(([, e]) => e.g >= 5 && e.w / e.g >= 0.7)
      .sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g || b[1].g - a[1].g)[0];

    const has = {
      mvpMaker: games >= 8 && mvp / games >= 0.25,
      busDriver: st.length >= 5 && kd >= 1.2 && rate >= 55,
      unlucky: games >= 8 && (mvp + teamMvp) / games >= 0.3 && rate < 45,
      headhunter: st.length >= 5 && hs >= 30,
      agentMain: topAgentN >= 5 && topAgentN / agentGames >= 0.5,
      mapKing: !!kingMap,
      onFire: games >= 5 && last5Wins >= 4,
      passenger: st.length >= 5 && kd < 0.9 && rate >= 55,
      helper: st.length >= 5 && ast >= 7,
      allRounder: Object.keys(agents).length >= 8,
      veteran: games === maxGames && maxGames >= 5,
      slump: games >= 5 && last5Wins <= 1
    };
    const list = TITLE_DEFS.filter((d) => has[d.id]).map((d) => {
      if (d.id === 'agentMain') return { ...d, name: `${agentKo(topAgent)} 장인`, desc: `요원 기록이 있는 경기 중 ${Math.round((topAgentN / agentGames) * 100)}%(${topAgentN}판)가 ${agentKo(topAgent)}입니다.` };
      if (d.id === 'mapKing') return { ...d, name: `${kingMap[0]} 지배자`, desc: `${kingMap[0]}에서 ${kingMap[1].g}판 ${kingMap[1].w}승, 승률 ${Math.round((kingMap[1].w / kingMap[1].g) * 100)}%입니다.` };
      return d;
    });
    if (list.length) out[id] = list;
  });
  return out;
}

// 명예의 전당 / 불명예의 전당. 각 부문 상위 3명 (한 사람은 부문마다 한 번만,
// 자기 최고 기록으로). excludedIds(순위 제외)는 빠진다.
export function computeFame(records, mvpCounts, excludedIds) {
  const people = Object.entries(records).filter(([id]) => !excludedIds.includes(id));

  // 한 경기 기록: 사람마다 가장 높은(같으면 먼저 세운) 경기 하나.
  const perMatch = (key, { min = () => true, fmt = (v) => String(v), lowest = false } = {}) => people
    .map(([id, r]) => {
      const best = [...(r.matches || [])].sort(byDate)
        .filter((m) => m[key] != null && min(m))
        .reduce((a, m) => (!a || (lowest ? m[key] < a[key] : m[key] > a[key]) ? m : a), null);
      return best && { id, v: best[key], value: fmt(best[key]), date: best.date, map: best.map, agent: best.agent, score: best.score, result: best.result };
    })
    .filter(Boolean)
    .sort((a, b) => (lowest ? a.v - b.v : b.v - a.v) || a.date - b.date)
    .slice(0, 3);

  // 누적 기록: 사람마다 값 하나.
  const total = (fn, { fmt = (v) => String(v), sub = () => null } = {}) => people
    .map(([id, r]) => {
      const v = fn(id, r);
      return v == null ? null : { id, v, value: fmt(v), sub: sub(id, r) };
    })
    .filter(Boolean)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  const games = (r) => (r.matches || []).length;
  const statOf = (r) => (r.matches || []).filter((m) => m.kills != null);
  const streakOf = (r) => streaks([...(r.matches || [])].sort(byDate));

  const fame = [
    { key: 'kills', icon: '💥', label: '한 경기 최다 킬', rows: perMatch('kills', { fmt: (v) => `${v}킬` }) },
    { key: 'acs', icon: '📈', label: '한 경기 최고 ACS', rows: perMatch('acs') },
    { key: 'hs', icon: '🎯', label: '한 경기 최고 헤드샷률', note: '10킬 이상 경기만', rows: perMatch('hsPct', { min: (m) => m.kills >= 10, fmt: (v) => `${v}%` }) },
    { key: 'assists', icon: '🤝', label: '한 경기 최다 어시스트', rows: perMatch('assists', { fmt: (v) => `${v}어시` }) },
    { key: 'winStreak', icon: '🔥', label: '최장 연승', rows: total((id, r) => streakOf(r).maxWin || null, { fmt: (v) => `${v}연승` }) },
    { key: 'mvp', icon: '👑', label: '최다 경기 MVP', rows: total((id) => mvpCounts[id]?.mvp || null, { fmt: (v) => `${v}회`, sub: (id) => `팀 MVP ${mvpCounts[id]?.teamMvp || 0}회` }) },
    { key: 'rate', icon: '🏆', label: '최고 승률', note: '10판 이상', rows: total((id, r) => {
      const g = games(r);
      return g >= 10 ? Math.round(((r.matches || []).filter((m) => m.result === '승').length / g) * 100) : null;
    }, { fmt: (v) => `${v}%`, sub: (id, r) => `${games(r)}판` }) },
    { key: 'kd', icon: '⚔️', label: '최고 K/D', note: '스탯 있는 경기 10판 이상', rows: total((id, r) => {
      const st = statOf(r);
      if (st.length < 10) return null;
      const k = st.reduce((n, m) => n + m.kills, 0), d = st.reduce((n, m) => n + m.deaths, 0);
      return Math.round((d ? k / d : k) * 100) / 100;
    }, { sub: (id, r) => `${statOf(r).length}판` }) },
    { key: 'games', icon: '🏠', label: '최다 출전', rows: total((id, r) => games(r) || null, { fmt: (v) => `${v}판` }) }
  ];
  const shame = [
    { key: 'deaths', icon: '💀', label: '한 경기 최다 데스', rows: perMatch('deaths', { fmt: (v) => `${v}데스` }) },
    { key: 'loseStreak', icon: '🧊', label: '최장 연패', rows: total((id, r) => streakOf(r).maxLose || null, { fmt: (v) => `${v}연패` }) },
    { key: 'lowAcs', icon: '📉', label: '한 경기 최저 ACS', rows: perMatch('acs', { lowest: true }) }
  ];
  return { fame: fame.filter((c) => c.rows.length), shame: shame.filter((c) => c.rows.length) };
}
