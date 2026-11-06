// 내전 실력 점수 (Elo 방식). 저장된 내전 기록을 날짜순으로 다시 돌려서 계산한다 —
// 서버에 따로 저장하지 않으니 경기를 지우거나 불러오면 점수도 저절로 다시 맞춰진다.
//
// - 기준 점수는 이번 시즌 티어: 1000 + (티어 칸 - 12) × 25. 티어 한 칸 = 25점이라
//   점수를 25로 나누면 다시 "티어 칸" 단위가 되고, 밸런싱(내전 점수 모드)이 그대로 쓴다.
// - 보이는 점수 = 기준 점수 + 내전 보정. 보정은 Elo로 쌓은 성적을 CAP(티어 한 칸보다 조금
//   작게)에 부드럽게 눌러 담는다(tanh). 팀을 맞춰 나누는 내전은 승패에 팀운이 크게 섞여서,
//   그대로 쓰면 37판 만에 ±5티어씩 벌어져 초월자 3이 초월자 1보다 낮아지곤 했다. 이제 두 티어
//   이상 차이는 내전 성적으로 뒤집히지 않고, 바로 위 · 아래 티어끼리만 뒤집힐 수 있다.
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
const CAP = 24;   // 보정 최대치(점) — 티어 한 칸(25)보다 작게
const SCALE = 80; // 성적 80점에서 보정이 CAP의 약 76%
const shown = (seed, elo) => Math.round(seed + CAP * Math.tanh((elo - seed) / SCALE));

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
// 반환: { id: { rating: 보이는 점수, seed: 티어 기준 점수, bonus: 내전 보정, elo: 눌러 담기 전 성적, games, wins, losses, last: 마지막 경기 변동, history } }
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
  const get = (id) => {
    if (out[id]) return out[id];
    const seed = seedRating(seedTierOf(id) ?? firstTier[id]);
    return (out[id] = { seed, elo: seed, rating: seed, bonus: 0, games: 0, wins: 0, losses: 0, last: 0, history: [] });
  };
  // 이길 확률은 눌러 담기 전 Elo로 계산한다(성적을 끝까지 따라가도록).
  const avg = (ids) => ids.reduce((n, id) => n + get(id).elo, 0) / ids.length;

  [...games.values()].sort((a, b) => a.date - b.date).forEach((g) => {
    if (!g.winners.length || !g.losers.length) return; // 한쪽만 기록된 경기는 점수 계산에서 뺀다
    const rw = avg(g.winners), rl = avg(g.losers);
    const expectW = 1 / (1 + 10 ** ((rl - rw) / 400));
    const mult = marginMult(g.score);
    const apply = (id, won) => {
      const p = get(id);
      const k = p.games < PLACEMENT ? K_PLACEMENT : K_NORMAL;
      const before = p.rating;
      p.elo += Math.round(k * mult * (won ? 1 - expectW : -(1 - expectW)));
      p.rating = shown(p.seed, p.elo);
      p.bonus = p.rating - p.seed;
      p.games++;
      if (won) p.wins++; else p.losses++;
      p.last = p.rating - before;
      p.history.push({ date: g.date, rating: p.rating, delta: p.last });
    };
    g.winners.forEach((id) => apply(id, true));
    g.losers.forEach((id) => apply(id, false));
  });
  return out;
}

// 밸런싱에 쓰는 "티어 칸" 단위 실력. 내전을 안 해 봤으면 null(호출하는 쪽이 티어를 쓴다).
export const ratingToSkill = (r) => (r && r.games ? CENTER_TIER + (r.rating - RATING_BASE) / POINTS_PER_TIER : null);
