// 홈의 "내전 하이라이트": 내전 날 하루 동안의 경기만 모아 그날의 MVP, 최다 킬,
// 최고 ACS, 전승(또는 최고 승률), 최대 접전, 새로 받은 칭호를 뽑는다.
// 저장된 내전 기록(records)만으로 계산한다.
import { groupMatches, matchAwards, countMvps, computeTitles } from './fame';

// 새벽까지 이어지는 내전을 같은 날로 묶기 위해 오전 6시를 하루의 시작으로 본다.
const DAY_START_HOUR = 6;
function dayStartOf(ts) {
  const d = new Date(ts - DAY_START_HOUR * 3600e3);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

// 내전이 있었던 날들, 최신순. [{ start, end, count }]
export function highlightDays(records) {
  const days = new Map();
  groupMatches(records).forEach((mt) => {
    const start = dayStartOf(mt.date);
    const e = days.get(start) || { start, end: start + 86400e3, count: 0 };
    e.count += 1;
    days.set(start, e);
  });
  return [...days.values()].sort((a, b) => b.start - a.start);
}

// records에서 date < before 인 경기만 남긴 사본.
function recordsBefore(records, before) {
  const out = {};
  Object.entries(records).forEach(([id, r]) => {
    const matches = (r.matches || []).filter((m) => m.date < before);
    if (matches.length) out[id] = { ...r, matches };
  });
  return out;
}

const roundsOf = (score) => {
  const [a, b] = String(score || '').split(/[:\-]/).map((s) => parseInt(s, 10));
  // "2 : 1" 같은 세트 스코어(직접 저장한 경기)는 라운드 점수가 아니라서 뺀다.
  return Number.isFinite(a) && Number.isFinite(b) && Math.max(a, b) >= 6 ? [a, b] : null;
};

// 하루치 하이라이트. 순위 제외(excludedIds)된 선수는 선수 칸에서 빠진다.
export function dayHighlight(records, day, excludedIds) {
  const ok = (id) => !excludedIds.includes(id);
  const matches = groupMatches(records).filter((mt) => mt.date >= day.start && mt.date < day.end).sort((a, b) => a.date - b.date);
  const players = matches.flatMap((mt) => [...mt.winners, ...mt.losers].map((p) => ({ ...p, mt }))).filter((p) => ok(p.id));

  // 👑 그날의 MVP 한 명: 그날 판수의 절반 이상 뛴 사람 중 그날 평균 ACS가
  // 가장 높은 사람. 같으면 경기 MVP를 더 많이 받은 사람, 그다음 K/D.
  const mvpN = {};
  matches.forEach((mt) => { const { mvp } = matchAwards(mt); if (mvp) mvpN[mvp.id] = (mvpN[mvp.id] || 0) + 1; });
  const agg = {};
  players.forEach((p) => {
    const e = (agg[p.id] ||= { id: p.id, games: 0, w: 0, st: 0, acs: 0, kills: 0, deaths: 0, assists: 0, agents: {}, best: null });
    e.games += 1; if (p.result === '승') e.w += 1;
    if (p.agent) e.agents[p.agent] = { n: (e.agents[p.agent]?.n || 0) + 1, icon: p.agentIcon };
    if (p.acs == null) return;
    e.st += 1; e.acs += p.acs; e.kills += p.kills || 0; e.deaths += p.deaths || 0; e.assists += p.assists || 0;
    if (!e.best || p.acs > e.best.acs) e.best = p;
  });
  const kdOf = (e) => (e.deaths ? e.kills / e.deaths : e.kills);
  const mvp = Object.values(agg)
    .filter((e) => e.st && e.games * 2 >= matches.length)
    .map((e) => {
      const [agent, a] = Object.entries(e.agents).sort((x, y) => y[1].n - x[1].n)[0] || [null, null];
      return { id: e.id, games: e.games, w: e.w, l: e.games - e.w, acs: Math.round(e.acs / e.st), kd: kdOf(e), kills: e.kills, deaths: e.deaths, assists: e.assists, mvp: mvpN[e.id] || 0, agent, agentIcon: a?.icon || null, map: e.best?.mt.map || null };
    })
    .sort((a, b) => b.acs - a.acs || b.mvp - a.mvp || b.kd - a.kd)[0] || null;

  // 💥 / 📈 한 경기 최다 킬 · 최고 ACS (같으면 먼저 세운 기록).
  const best = (key) => players.filter((p) => p[key] != null).reduce((a, p) => (!a || p[key] > a[key] ? p : a), null);
  const kills = best('kills');
  const acs = best('acs');

  // 🔥 2판 이상 해서 한 판도 안 진 사람. 없으면 이 줄은 안 나온다.
  const wl = {};
  players.forEach((p) => { const e = (wl[p.id] ||= { w: 0, l: 0 }); p.result === '승' ? e.w++ : e.l++; });
  const perfect = Object.entries(wl).filter(([, e]) => e.w >= 2 && !e.l).sort((a, b) => b[1].w - a[1].w);
  const streak = perfect.length
    ? { ids: perfect.filter(([, e]) => e.w === perfect[0][1].w).map(([id]) => id), w: perfect[0][1].w }
    : null;

  // 😰 라운드 차이가 가장 작은 경기 (같으면 라운드가 더 많은 쪽 = 연장).
  const close = matches
    .map((mt) => ({ mt, r: roundsOf(mt.score) }))
    .filter((x) => x.r)
    .sort((a, b) => Math.abs(a.r[0] - a.r[1]) - Math.abs(b.r[0] - b.r[1]) || (b.r[0] + b.r[1]) - (a.r[0] + a.r[1]))[0]?.mt || null;

  // 🏅 그날 경기로 새로 생긴 칭호: 그날까지의 칭호 − 그 전날까지의 칭호.
  const until = recordsBefore(records, day.end);
  const before = recordsBefore(records, day.start);
  const after = computeTitles(until, countMvps(until));
  const prev = computeTitles(before, countMvps(before));
  const played = new Set(players.map((p) => p.id));
  const newTitles = [];
  played.forEach((id) => {
    const had = new Set((prev[id] || []).map((t) => t.name));
    (after[id] || []).forEach((t) => { if (!had.has(t.name)) newTitles.push({ ...t, player: id }); });
  });

  return { matches, mvp, kills, acs, streak, close, newTitles };
}
