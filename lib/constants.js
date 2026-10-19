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

export const ALL_MAPS = ['어센트', '바인드', '헤이븐', '아이스박스', '로터스', '스플릿', '선셋', '브리즈', '프랙처', '펄', '어비스', '코로드', '서밋'];
export const ROTATION = ['어센트', '서밋', '헤이븐', '로터스', '선셋', '스플릿', '어비스'];

// Rooms saved before a map was renamed still carry the old name in their pool.
const LEGACY_MAP_NAMES = { '코르도': '코로드' };
export function normalizePool(pool) {
  if (!Array.isArray(pool)) return pool;
  return [...new Set(pool.map((m) => LEGACY_MAP_NAMES[m] || m))].filter((m) => ALL_MAPS.includes(m));
}

export const MAP_IMG = {
  '어센트': '/maps/ascent.png', '바인드': '/maps/bind.png', '헤이븐': '/maps/haven.png',
  '아이스박스': '/maps/icebox.png', '로터스': '/maps/lotus.png', '스플릿': '/maps/split.png',
  '선셋': '/maps/sunset.png', '브리즈': '/maps/breeze.png', '프랙처': '/maps/fracture.png',
  '펄': '/maps/pearl.png', '어비스': '/maps/abyss.png', '코로드': '/maps/corrode.png', '서밋': '/maps/summit.png'
};

export const BG_SEQ = ['어센트', '로터스', '헤이븐', '선셋', '아이스박스', '펄', '어비스', '서밋', '바인드', '브리즈', '스플릿', '프랙처', '코로드'];

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

// HenrikDev returns agent names in English; show them in Korean (in-game KR names).
// Unknown/new agents fall back to the original name — add them here as they release.
const AGENT_KO = {
  astra: '아스트라', breach: '브리치', brimstone: '브림스톤', chamber: '체임버',
  clove: '클로브', cypher: '사이퍼', deadlock: '데드록', fade: '페이드',
  gekko: '게코', harbor: '하버', iso: '아이소', jett: '제트', kayo: '케이/오',
  killjoy: '킬조이', neon: '네온', omen: '오멘', phoenix: '피닉스', raze: '레이즈',
  reyna: '레이나', sage: '세이지', skye: '스카이', sova: '소바', tejo: '테호',
  viper: '바이퍼', vyse: '바이스', waylay: '웨이레이', yoru: '요루', veto: '비토',
  miks: '믹스', hush: '허쉬'
};
// Valorant agent -> in-game role, mapped to this app's Korean position labels.
// New agents ship every few patches — add them here as they release.
export const AGENT_ROLE = {
  jett: '타격대', phoenix: '타격대', raze: '타격대', reyna: '타격대',
  yoru: '타격대', neon: '타격대', iso: '타격대', waylay: '타격대', hush: '타격대',
  sova: '척후대', breach: '척후대', skye: '척후대', kayo: '척후대',
  fade: '척후대', gekko: '척후대', tejo: '척후대',
  brimstone: '전략가', viper: '전략가', omen: '전략가', astra: '전략가',
  harbor: '전략가', clove: '전략가', miks: '전략가',
  cypher: '감시자', killjoy: '감시자', sage: '감시자', chamber: '감시자',
  deadlock: '감시자', vyse: '감시자', veto: '감시자'
};
export function normalizeAgent(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function agentRole(name) {
  return AGENT_ROLE[normalizeAgent(name)] || null;
}

export function agentKo(name) {
  if (!name) return name;
  return AGENT_KO[String(name).toLowerCase().replace(/[^a-z0-9]/g, '')] || name;
}
