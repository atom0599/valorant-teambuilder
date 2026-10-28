// 전체 전적의 자동 칭호와 명예의 전당. 둘 다 저장된 내전 기록(records)만으로
// 매번 계산한다 — 따로 저장하는 값이 없어서 경기가 추가·삭제되면 바로 바뀐다.
import { agentKo, agentRole } from './constants';

// 칭호 목록. 순서 = 선수 상세에 보이는 순서.
// name은 칭호 이름, desc는 받는 조건 설명 (선수 상세의 칭호 탭에 보인다).
export const TITLE_DEFS = [
  { id: 'mvpMaker', icon: '👑', name: 'MVP 제조기', desc: '경기 MVP를 평균 3판에 1번 이상 받았습니다. (8판 이상)' },
  { id: 'busDriver', icon: '🚌', name: '버스 기사', desc: 'K/D 1.2 이상에 승률 55% 이상(55% 포함). 팀을 태우고 이기는 사람입니다. (스탯 있는 경기 5판 이상)' },
  { id: 'unlucky', icon: '😢', name: '억울한 사람', desc: '경기 MVP·팀 MVP를 합쳐 10판에 4번 이상 받았는데 승률은 50% 미만(50%는 제외)입니다. (8판 이상)' },
  { id: 'headhunter', icon: '🎯', name: '헤드헌터', desc: '내전 평균 헤드샷률 30% 이상. (스탯 있는 경기 5판 이상)' },
  { id: 'agentMain', icon: '🧬', name: '○○ 장인', desc: '한 요원으로 5판 이상, 요원 기록이 있는 경기의 절반 이상을 그 요원으로 했습니다.' },
  { id: 'mapKing', icon: '🗺️', name: '○○ 지배자', desc: '한 맵에서 5판 이상 하고 그 맵 승률이 70% 이상입니다. 여러 맵이면 승률이 가장 높은 맵.' },
  { id: 'roleMain', icon: '🎭', name: '○○ 중독', desc: '요원 기록이 있는 경기의 70% 이상을 한 역할(타격대·척후대·전략가·감시자)로 했습니다. (8판 이상)' },
  { id: 'luckyCharm', icon: '🍀', name: '승리 요정', desc: '같은 팀이 되면 팀원들이 평소(이 사람과 같은 팀이 아닐 때)보다 15%p 이상 더 이깁니다. (10판 이상)' },
  { id: 'steady', icon: '⚖️', name: '기복 없음', desc: '판마다 ACS 차이가 작습니다. ACS 변동폭이 평균의 20% 이하. (스탯 있는 경기 8판 이상)' },
  { id: 'onFire', icon: '🔥', name: '상승세', desc: '최근 5경기에서 4승 이상. (5판 이상)' },
  { id: 'passenger', icon: '🎫', name: '버스 승객', desc: 'K/D는 0.9 미만인데 승률은 55% 이상(55% 포함). 잘 타고 다니는 사람입니다. (스탯 있는 경기 5판 이상)' },
  { id: 'helper', icon: '🤝', name: '도우미', desc: '경기당 어시스트 7개 이상. (스탯 있는 경기 5판 이상)' },
  { id: 'entry', icon: '⚡', name: '돌격대장', desc: '경기당 퍼스트 킬(라운드 첫 킬) 3.5번 이상. (라운드 기록 있는 경기 5판 이상)' },
  { id: 'spike', icon: '💣', name: '스파이크 담당', desc: '스파이크 설치와 해체를 합쳐 경기당 4번 이상. (라운드 기록 있는 경기 5판 이상)' },
  { id: 'clutch', icon: '🦸', name: '클러치 장인', desc: '혼자 남은 라운드를 이긴 클러치를 경기당 평균 1번 이상. (라운드 기록 있는 경기 5판 이상)' },
  { id: 'rollercoaster', icon: '🎢', name: '롤러코스터', desc: '판마다 ACS 차이가 큽니다. ACS 변동폭이 평균의 45% 이상. 잘할 땐 미치고 못할 땐 사라집니다. (스탯 있는 경기 8판 이상)' },
  { id: 'allRounder', icon: '🎲', name: '만능 플레이어', desc: '내전에서 서로 다른 요원을 12개 이상 했고, 타격대·척후대·전략가·감시자 네 역할을 모두 해 봤습니다.' },
  { id: 'jinx', icon: '😤', name: '패배 요정', desc: '같은 팀이 되면 팀원들이 평소(이 사람과 같은 팀이 아닐 때)보다 15%p 이상 더 집니다. (10판 이상)' },
  { id: 'bodyShot', icon: '🔫', name: '몸샷러', desc: '내전 평균 헤드샷률 15% 미만. 머리보다 몸통을 좋아합니다. (헤드샷 기록 있는 경기 5판 이상)' },
  { id: 'firstVictim', icon: '🪦', name: '첫 번째 희생자', desc: '경기당 퍼스트 데스(라운드에서 가장 먼저 죽음) 3번 이상. (라운드 기록 있는 경기 5판 이상)' },
  { id: 'slump', icon: '🧊', name: '슬럼프', desc: '최근 5경기에서 1승 이하. (5판 이상)' }
];

// 한 경기의 경기 MVP / 팀 MVP. HenrikDev가 준 실제 인게임 수상(see
// app/api/customs/route.js) — 경기 MVP + 반대편 팀의 팀 MVP. 그 정보가
// 저장되기 전에 불러온 경기는 전투 점수(더 예전 건 ACS) 1위로 대신한다.
// 직접 입력해서 스탯이 없는 경기는 MVP 없음. 경기별 보기 배지와 전체 전적의
// MVP 횟수, 오늘의 하이라이트가 같은 기준을 쓰도록 여기 한 곳에 둔다.
export function matchAwards(mt) {
  const all = [...mt.winners, ...mt.losers];
  const cs = (p) => p.combat ?? p.acs;
  const best = (list) => list.filter((p) => cs(p) != null).sort((a, b) => cs(b) - cs(a) || b.kills - a.kills)[0] || null;
  const realAwards = all.some((p) => p.mvp);
  const mvp = realAwards ? all.find((p) => p.mvp === 'match') || null : best(all);
  const teamMvp = realAwards
    ? all.find((p) => p.mvp === 'team' && !(mvp && mt.winners.includes(mvp) === mt.winners.includes(p))) || null
    : best(mvp && mt.winners.includes(mvp) ? mt.losers : mt.winners);
  return { mvp, teamMvp };
}

// 내전 기록을 경기 단위로 다시 묶는다 (같은 date = 같은 경기).
export function groupMatches(records) {
  const byDate = new Map();
  Object.entries(records).forEach(([id, r]) => (r.matches || []).forEach((m) => {
    let e = byDate.get(m.date);
    if (!e) { e = { date: m.date, map: m.map, score: m.score, winners: [], losers: [] }; byDate.set(m.date, e); }
    (m.result === '승' ? e.winners : e.losers).push({ ...m, id, combat: m.combat ?? null, mvp: m.mvp ?? null });
  }));
  return [...byDate.values()];
}

// 선수별 경기 MVP / 팀 MVP 횟수 (+ MVP 받고 진 판).
export function countMvps(records) {
  const out = {};
  const blank = () => ({ mvp: 0, teamMvp: 0, mvpLoss: 0 });
  groupMatches(records).forEach((mt) => {
    const { mvp, teamMvp } = matchAwards(mt);
    if (mvp) {
      (out[mvp.id] ||= blank()).mvp += 1;
      if (mt.losers.includes(mvp)) out[mvp.id].mvpLoss += 1;
    }
    if (teamMvp) (out[teamMvp.id] ||= blank()).teamMvp += 1;
  });
  return out;
}

const ROLE_ICON ={ 타격대: '🗡️', 척후대: '🔭', 전략가: '🌫️', 감시자: '🪤' };

// 승리 요정 / 패배 요정: 이 사람과 같은 팀일 때 팀원들이 이긴 비율을, 그
// 팀원들 각자의 "이 사람과 같은 팀이 아닐 때" 승률과 비교한 차이(%p).
// 팀원마다 기준 승률이 있어야 해서(같은 팀 아닌 판 3판 이상) 그런 팀원만 센다.
function teammateEffects(records) {
  const byDate = new Map();
  const totals = {};
  Object.entries(records).forEach(([id, r]) => (r.matches || []).forEach((m) => {
    let e = byDate.get(m.date);
    if (!e) { e = { 승: [], 패: [] }; byDate.set(m.date, e); }
    (m.result === '승' ? e.승 : e.패).push(id);
    const t = (totals[id] ||= { g: 0, w: 0 });
    t.g += 1; if (m.result === '승') t.w += 1;
  }));
  const pair = {}; // pair[x][t] = { g, w } — x와 t가 같은 팀이었던 판
  byDate.forEach((e) => [['승', 1], ['패', 0]].forEach(([side, win]) => {
    const ids = e[side];
    ids.forEach((x) => ids.forEach((t) => {
      if (x === t) return;
      const p = ((pair[x] ||= {})[t] ||= { g: 0, w: 0 });
      p.g += 1; p.w += win;
    }));
  }));
  const out = {};
  Object.entries(pair).forEach(([x, mates]) => {
    let g = 0, actual = 0, expected = 0;
    Object.entries(mates).forEach(([t, p]) => {
      const restG = totals[t].g - p.g;
      if (restG < 3) return;
      const base = (totals[t].w - p.w) / restG;
      g += p.g; actual += p.w; expected += p.g * base;
    });
    if (g) out[x] = Math.round(((actual - expected) / g) * 100);
  });
  return out;
}

// ACS가 판마다 얼마나 흔들리는지: 표준편차 / 평균.
function acsSpread(st) {
  const list = st.map((m) => m.acs).filter((v) => v != null);
  if (list.length < 8) return null;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  if (!mean) return null;
  const sd = Math.sqrt(list.reduce((a, v) => a + (v - mean) ** 2, 0) / list.length);
  return { mean: Math.round(mean), sd: Math.round(sd), cv: sd / mean };
}

const byDate = (a, b) => a.date - b.date;

// id -> [{ id, icon, name, desc }] (TITLE_DEFS 순서).
export function computeTitles(records, mvpCounts) {
  const out = {};
  const effects = teammateEffects(records);
  Object.entries(records).forEach(([id, r]) => {
    const ms = [...(r.matches || [])].sort(byDate);
    const games = ms.length;
    if (!games) return;
    const wins = ms.filter((m) => m.result === '승').length;
    // 화면에 보이는 승률(반올림)과 같은 값으로 비교한다 — 44.6%가 "45%"로
    // 보이는데 "45% 미만" 칭호가 붙는 식으로 어긋나지 않게.
    const rate = Math.round((wins / games) * 100);
    const st = ms.filter((m) => m.kills != null);
    const kills = st.reduce((n, m) => n + m.kills, 0);
    const deaths = st.reduce((n, m) => n + m.deaths, 0);
    const kd = st.length ? (deaths ? kills / deaths : kills) : null;
    const hs = st.length ? st.reduce((n, m) => n + (m.hsPct || 0), 0) / st.length : null;
    const ast = st.length ? st.reduce((n, m) => n + (m.assists || 0), 0) / st.length : null;
    const rs = ms.filter((m) => m.firstKills != null);
    const rsAvg = (key) => (rs.length >= 5 ? rs.reduce((n, m) => n + (m[key] || 0), 0) / rs.length : null);
    const fk = rsAvg('firstKills'), fd = rsAvg('firstDeaths'), cl = rsAvg('clutches');
    const pl = rsAvg('plants'), df = rsAvg('defuses');
    // 몸샷러는 헤드샷률이 실제로 기록된 경기만 본다 — 빈 값을 0%로 세면 엉뚱하게 붙는다.
    const hsList = st.map((m) => m.hsPct).filter((v) => v != null);
    const hsLow = hsList.length >= 5 ? hsList.reduce((a, b) => a + b, 0) / hsList.length : null;    const mvp = mvpCounts[id]?.mvp || 0;
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

    const roles = {};
    Object.entries(agents).forEach(([a, n]) => { const role = agentRole(a); if (role) roles[role] = (roles[role] || 0) + n; });
    const roleGames = Object.values(roles).reduce((a, b) => a + b, 0);
    const [topRole, topRoleN] = Object.entries(roles).sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const effect = games >= 10 ? effects[id] ?? null : null;
    const spread = acsSpread(st);

    const has = {
      mvpMaker: games >= 8 && mvp * 3 >= games,
      busDriver: st.length >= 5 && kd >= 1.2 && rate >= 55,
      unlucky: games >= 8 && (mvp + teamMvp) / games >= 0.4 && rate < 50,
      headhunter: st.length >= 5 && hs >= 30,
      agentMain: topAgentN >= 5 && topAgentN / agentGames >= 0.5,
      mapKing: !!kingMap,
      roleMain: roleGames >= 8 && topRoleN / roleGames >= 0.7,
      luckyCharm: effect != null && effect >= 15,
      steady: !!spread && spread.cv <= 0.2,
      rollercoaster: !!spread && spread.cv >= 0.45,
      jinx: effect != null && effect <= -15,
      onFire: games >= 5 && last5Wins >= 4,
      passenger: st.length >= 5 && kd < 0.9 && rate >= 55,
      helper: st.length >= 5 && ast >= 7,
      entry: fk != null && fk >= 3.5,
      spike: pl != null && pl + df >= 4,
      clutch: cl != null && cl >= 1,
      firstVictim: fd != null && fd >= 3,
      bodyShot: hsLow != null && hsLow < 15,
      allRounder: Object.keys(agents).length >= 12 && new Set(Object.keys(agents).map(agentRole).filter(Boolean)).size === 4,
      slump: games >= 5 && last5Wins <= 1
    };
    const list = TITLE_DEFS.filter((d) => has[d.id]).map((d) => {
      if (d.id === 'agentMain') return { ...d, name: `${agentKo(topAgent)} 장인`, desc: `요원 기록이 있는 경기 중 ${Math.round((topAgentN / agentGames) * 100)}%(${topAgentN}판)가 ${agentKo(topAgent)}입니다.` };
      if (d.id === 'roleMain') return { ...d, icon: ROLE_ICON[topRole] || d.icon, name: `${topRole} 중독`, desc: `요원 기록이 있는 경기 중 ${Math.round((topRoleN / roleGames) * 100)}%(${topRoleN}판)를 ${topRole} 요원으로 했습니다.` };
      if (d.id === 'luckyCharm') return { ...d, desc: `같은 팀이 되면 팀원들이 평소보다 ${effect}%p 더 이깁니다. (평소 = 이 사람과 같은 팀이 아닐 때 그 팀원들의 승률)` };
      if (d.id === 'jinx') return { ...d, desc: `같은 팀이 되면 팀원들이 평소보다 ${-effect}%p 더 집니다. (평소 = 이 사람과 같은 팀이 아닐 때 그 팀원들의 승률)` };
      if (d.id === 'steady' || d.id === 'rollercoaster') return { ...d, desc: `${d.id === 'steady' ? '판마다 ACS 차이가 작습니다.' : '판마다 ACS 차이가 큽니다. 잘할 땐 미치고 못할 땐 사라집니다.'} 평균 ACS ${spread.mean}, 보통 ±${spread.sd} 정도 오르내립니다(평균의 ${Math.round(spread.cv * 100)}%).` };
      if (d.id === 'mapKing') return { ...d, name: `${kingMap[0]} 지배자`, desc: `${kingMap[0]}에서 ${kingMap[1].g}판 ${kingMap[1].w}승, 승률 ${Math.round((kingMap[1].w / kingMap[1].g) * 100)}%입니다.` };
      if (d.id === 'entry') return { ...d, desc: `라운드 기록이 있는 ${rs.length}판에서 경기당 퍼스트 킬(라운드 첫 킬) ${fk.toFixed(1)}번입니다.` };
      if (d.id === 'spike') return { ...d, desc: `라운드 기록이 있는 ${rs.length}판에서 경기당 스파이크 설치 ${pl.toFixed(1)}번, 해체 ${df.toFixed(1)}번입니다.` };
      if (d.id === 'clutch') return { ...d, desc: `라운드 기록이 있는 ${rs.length}판에서 혼자 남은 라운드를 ${rs.reduce((n, m) => n + (m.clutches || 0), 0)}번 이겼습니다(경기당 ${cl.toFixed(1)}번).` };
      if (d.id === 'bodyShot') return { ...d, desc: `헤드샷 기록이 있는 ${hsList.length}판의 평균 헤드샷률이 ${hsLow.toFixed(1)}%입니다. 머리보다 몸통을 좋아합니다.` };
      if (d.id === 'firstVictim') return { ...d, desc: `라운드 기록이 있는 ${rs.length}판에서 경기당 퍼스트 데스(라운드에서 가장 먼저 죽음) ${fd.toFixed(1)}번입니다.` };
      return d;
    });
    if (list.length) out[id] = list;
  });
  return out;
}

// 같은 값은 공동 순위이고 다음 기록은 바로 다음 순위 (1, 1, 2 …) — 공동 순위가
// 단상 한 칸("누구 외 N명")에 서고 다음 기록이 다음 단상에 서서 단상이 비지 않는다.
// 서로 다른 기록 세 개(3위)까지만 남긴다.
function rankRows(sorted) {
  let rank = 0;
  const ranked = sorted.map((x, i) => ({ ...x, rank: i && sorted[i - 1].v === x.v ? rank : ++rank }));
  const counts = ranked.reduce((m, x) => (m[x.rank] = (m[x.rank] || 0) + 1, m), {});
  return ranked.filter((x) => x.rank <= 3).map((x) => ({ ...x, tied: counts[x.rank] > 1 }));
}

// 가장 많이 한 요원 (같으면 먼저 그 판 수에 닿은 요원). { agent, agentIcon } 또는 {}.
export function mostAgent(r) {
  const n = {};
  let best = null;
  (r?.matches || []).forEach((m) => {
    if (!m.agent) return;
    const e = (n[m.agent] ||= { c: 0, icon: m.agentIcon || null });
    e.c += 1;
    if (!best || e.c > n[best].c) best = m.agent;
  });
  return best ? { agent: best, agentIcon: n[best].icon } : {};
}

// 명예의 전당 / 불명예의 전당. 각 부문 3위까지 (동점은 공동). 한 사람은
// 부문마다 자기 최고 기록으로 한 번만 오른다. excludedIds(순위 제외)는 빠진다.
export function computeFame(records, mvpCounts, excludedIds) {
  const people = Object.entries(records).filter(([id]) => !excludedIds.includes(id));

  // 한 경기 기록: 사람마다 가장 높은(같으면 먼저 세운) 경기 하나.
  // 다른 사람과 값이 같으면 날짜와 상관없이 공동 순위.
  // key는 경기 기록의 필드 이름, 또는 경기 -> 값 함수.
  const perMatch = (key, { min = () => true, fmt = (v) => String(v), lowest = false } = {}) => rankRows(people
    .map(([id, r]) => {
      const val = typeof key === 'function' ? key : (m) => m[key];
      const best = [...(r.matches || [])].sort(byDate)
        .filter((m) => val(m) != null && min(m))
        .reduce((a, m) => (!a || (lowest ? val(m) < val(a) : val(m) > val(a)) ? m : a), null);
      // m: 그 경기 기록 전체 — 카드에 그 판의 K/D/A · ACS 등 자세한 정보를 보여 준다.
      return best && { id, v: val(best), value: fmt(val(best)), date: best.date, map: best.map, agent: best.agent, agentIcon: best.agentIcon || null, score: best.score, result: best.result, m: best };
    })
    .filter(Boolean)
    .sort((a, b) => (lowest ? a.v - b.v : b.v - a.v) || a.date - b.date));

  // 누적 기록: 사람마다 값 하나.
  const total = (fn, { fmt = (v) => String(v), sub = () => null } = {}) => rankRows(people
    .map(([id, r]) => {
      const v = fn(id, r);
      // 경기 하나에 묶이지 않는 누적 기록은 그 사람의 모스트 요원을 같이 넘긴다 (카드 일러스트).
      return v == null ? null : { id, v, value: fmt(v), sub: sub(id, r), ...mostAgent(r) };
    })
    .filter(Boolean)
    .sort((a, b) => b.v - a.v));

  const fame = [
    { key: 'kills', icon: '💥', label: '한 경기 최다 킬', rows: perMatch('kills', { fmt: (v) => `${v}킬` }) },
    { key: 'acs', icon: '📈', label: '한 경기 최고 ACS', rows: perMatch('acs') },
    { key: 'hs', icon: '🎯', label: '한 경기 최고 헤드샷률', note: '10킬 이상 경기만', rows: perMatch('hsPct', { min: (m) => m.kills >= 10, fmt: (v) => `${v}%` }) },
    { key: 'firstKills', icon: '⚡', label: '한 경기 최다 퍼스트 킬', note: '라운드 첫 킬', rows: perMatch('firstKills', { fmt: (v) => `${v}번` }) },
    { key: 'plants', icon: '💣', label: '한 경기 최다 스파이크 설치', rows: perMatch('plants', { min: (m) => m.plants > 0, fmt: (v) => `${v}번` }) },
    { key: 'assists', icon: '🤝', label: '한 경기 최다 어시스트', rows: perMatch('assists', { fmt: (v) => `${v}어시` }) },
    { key: 'kd', icon: '⚔️', label: '한 경기 최고 K/D', note: '데스 0이면 킬 수로', rows: perMatch((m) => (m.kills == null ? null : Math.round((m.deaths ? m.kills / m.deaths : m.kills) * 100) / 100), { fmt: (v) => v.toFixed(2) }) }
  ];
  const shame = [
    { key: 'deaths', icon: '💀', label: '한 경기 최다 데스', rows: perMatch('deaths', { fmt: (v) => `${v}데스` }) },
    { key: 'firstDeaths', icon: '🪦', label: '한 경기 최다 퍼스트 데스', note: '라운드에서 가장 먼저 죽음', rows: perMatch('firstDeaths', { fmt: (v) => `${v}번` }) },
    { key: 'lowKills', icon: '🥚', label: '한 경기 최저 킬', rows: perMatch('kills', { lowest: true, fmt: (v) => `${v}킬` }) },
    { key: 'mvpLoss', icon: '😭', label: 'MVP 받고 진 판', note: '경기 MVP를 받았는데 팀이 진 횟수', rows: total((id) => mvpCounts[id]?.mvpLoss || null, { fmt: (v) => `${v}번` }) },
    { key: 'lowAcs', icon: '📉', label: '한 경기 최저 ACS', rows: perMatch('acs', { lowest: true }) }
  ];
  // 요원 초상화가 있는 부문(1위 경기에 요원 아이콘이 있는 것)을 위로, 없는
  // 부문은 아래로. 같은 그룹 안에서는 위에 적은 순서 그대로.
  const order = (cats) => cats.filter((c) => c.rows.length)
    .map((c, i) => ({ c, i, icon: c.rows.some((r) => r.rank === 1 && r.agentIcon) ? 0 : 1 }))
    .sort((a, b) => a.icon - b.icon || a.i - b.i)
    .map((x) => x.c);
  return { fame: order(fame), shame: order(shame) };
}
