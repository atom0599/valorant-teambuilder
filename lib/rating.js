// 내전 실력 점수 (Elo 방식). 저장된 내전 기록을 날짜순으로 다시 돌려서 계산한다 —
// 서버에 따로 저장하지 않으니 경기를 지우거나 불러오면 점수도 저절로 다시 맞춰진다.
//
// - 시작 점수는 티어로 정한다: 1000 + (티어 칸 - 12) × 25. 티어 한 칸 = 25점이라
//   점수를 25로 나누면 다시 "티어 칸" 단위가 되고, 밸런싱(내전 점수 모드)이 그대로 쓴다.
// - 한 경기마다 팀 평균 점수로 이길 확률을 계산하고(400점 차 = 10배), 결과와 차이만큼 오르내린다.
//   이길 만한 팀이 이기면 조금, 질 만한 팀이 이기면 많이 오른다.
// - 처음 PLACEMENT판은 K를 크게(빨리 제자리 찾기), 그 뒤로는 작게.
// - 라운드 점수(13 : 5 같은)가 있으면 크게 이긴 판일수록 조금 더(최대 1.5배).
export const RATING_BASE = 1000;
export const POINTS_PER_TIER = 25;
export const PLACEMENT = 5;
const CENTER_TIER = 12;
const K_PLACEMENT = 40;
const K_NORMAL = 24;

export const seedRating = (tierIdx) => RATING_BASE + ((tierIdx ?? CENTER_TIER) - CENTER_TIER) * POINTS_PER_TIER;

function marginMult(score) {
  const m = String(score || '').match(/(\d+)\s*:\s*(\d+)/);
  if (!m) return 1;
  const a = Number(m[1]), b = Number(m[2]);
  if (Math.max(a, b) <= 3) return 1; // BO3 세트 점수(2 : 1)는 라운드 차가 아님
  return Math.min(1.5, 1 + Math.max(0, Math.abs(a - b) - 2) / 16);
}

// records: { id: { matches: [{ date, result: '승'|'패', score, tier }] } }
// seedTierOf(id) → 시작 티어 칸 (없으면 그 사람의 가장 오래된 경기 티어, 그것도 없으면 가운데)
// 반환: { id: { rating, games, wins, losses, last: 마지막 경기 변동, history: [{ date, rating, delta }] } }
export function computeRatings(records, seedTierOf = () => null) {
  const games = new Map(); // date -> { score, winners: [id], losers: [id] }
  const firstTier = {};
  Object.entries(records || {}).forEach(([id, r]) => {
    [...(r.matches || [])].sort((a, b) => a.date - b.date).forEach((m) => {
      if (firstTier[id] == null && m.tier != null) firstTier[id] = m.tier;
      let g = games.get(m.date);
      if (!g) { g = { date: m.date, score: m.score, winners: [], losers: [] }; games.set(m.date, g); }
      (m.result === '승' ? g.winners : g.losers).push(id);
    });
  });

  const out = {};
  const get = (id) => out[id] || (out[id] = {
    rating: seedRating(seedTierOf(id) ?? firstTier[id]), games: 0, wins: 0, losses: 0, last: 0, history: []
  });
  const avg = (ids) => ids.reduce((n, id) => n + get(id).rating, 0) / ids.length;

  [...games.values()].sort((a, b) => a.date - b.date).forEach((g) => {
    if (!g.winners.length || !g.losers.length) return; // 한쪽만 기록된 경기는 점수 계산에서 뺀다
    const rw = avg(g.winners), rl = avg(g.losers);
    const expectW = 1 / (1 + 10 ** ((rl - rw) / 400));
    const mult = marginMult(g.score);
    const apply = (id, won) => {
      const p = get(id);
      const k = p.games < PLACEMENT ? K_PLACEMENT : K_NORMAL;
      const delta = Math.round(k * mult * (won ? 1 - expectW : -(1 - expectW)));
      p.rating += delta;
      p.games++;
      if (won) p.wins++; else p.losses++;
      p.last = delta;
      p.history.push({ date: g.date, rating: p.rating, delta });
    };
    g.winners.forEach((id) => apply(id, true));
    g.losers.forEach((id) => apply(id, false));
  });
  return out;
}

// 밸런싱에 쓰는 "티어 칸" 단위 실력. 내전을 안 해 봤으면 null(호출하는 쪽이 티어를 쓴다).
export const ratingToSkill = (r) => (r && r.games ? CENTER_TIER + (r.rating - RATING_BASE) / POINTS_PER_TIER : null);
