export const POSITIONS = ['미정', '타격대', '척후대', '전략가', '감시자', '플렉스'];

const RANKS = [
  ['아이언', 3, '#6B7280'], ['브론즈', 3, '#A4795A'], ['실버', 3, '#B8C0C8'],
  ['골드', 3, '#D8B24A'], ['플래티넘', 3, '#4FB6C4'], ['다이아몬드', 3, '#B183E8'],
  ['초월자', 3, '#43C97B'], ['불멸', 3, '#E1424F'], ['레디언트', 1, '#F3E9B5']
];

export const TIERS = (() => {
  const out = [];
  RANKS.forEach(([n, d, c]) => {
    for (let i = 1; i <= d; i++) out.push({ label: d === 1 ? n : `${n} ${i}`, color: c, value: out.length });
  });
  return out;
})();

export const ALL_MAPS = ['어센트', '바인드', '헤이븐', '아이스박스', '로터스', '스플릿', '선셋', '브리즈', '프랙처', '펄', '어비스', '코르도', '서밋'];
export const ROTATION = ['어센트', '서밋', '헤이븐', '로터스', '선셋', '스플릿', '어비스'];

export const MAP_IMG = {
  '어센트': '/maps/ascent.png', '바인드': '/maps/bind.png', '헤이븐': '/maps/haven.png',
  '아이스박스': '/maps/icebox.png', '로터스': '/maps/lotus.png', '스플릿': '/maps/split.png',
  '선셋': '/maps/sunset.png', '브리즈': '/maps/breeze.png', '프랙처': '/maps/fracture.png',
  '펄': '/maps/pearl.png', '어비스': '/maps/abyss.png', '코르도': '/maps/corrode.png', '서밋': '/maps/summit.png'
};

export const BG_SEQ = ['어센트', '로터스', '헤이븐', '선셋', '아이스박스', '펄', '어비스', '서밋', '바인드', '브리즈', '스플릿', '프랙처', '코르도'];

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function fmtDate(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function tierPill(v, big) {
  if (v == null) return { label: '언랭', style: { fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' } };
  const t = TIERS[v];
  return {
    label: t.label,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: big ? 13 : 12, fontWeight: 600,
      color: t.color, background: `${t.color}1A`, border: `1px solid ${t.color}40`,
      borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap'
    }
  };
}

// BO3 is fixed at ban(A)-ban(B)-pick(A)-pick(B)-decider regardless of pool
// size: whatever's left after those 4 steps (1 map on a 7-map pool, more on
// a bigger pool) is resolved by randomly drawing one, not by banning down to
// exactly one. BO5 keeps the older pool-size-scaled behavior (bans scale up
// so exactly one map is left before the decider) since that wasn't asked to
// change.
export function seqFor(series, poolSize) {
  if (series === 'BO3') {
    return [['ban', 'A'], ['ban', 'B'], ['pick', 'A'], ['pick', 'B'], ['decider', null]];
  }
  const n = poolSize || 7;
  const picks = ['A', 'B', 'A', 'B'];
  const bans = Math.max(0, n - (picks.length + 1));

  const seq = [];
  let turn = 'A';
  for (let i = 0; i < bans; i++) { seq.push(['ban', turn]); turn = turn === 'A' ? 'B' : 'A'; }
  picks.forEach((t) => seq.push(['pick', t]));
  seq.push(['decider', null]);
  return seq;
}
