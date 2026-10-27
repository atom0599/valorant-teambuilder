'use client';
// 요원 일러스트: 전신 초상화 · 색 그라데이션은 valorant-api.com에서 한 번만 받아 오고,
// 배경 문구(요원 이름 글씨 무늬)는 VALORANT 위키(fandom)의 "<요원> Background Text" 이미지를 쓴다.
// 아직 등록 안 된 요원(예: 허시)은 null이라 쓰는 쪽에서 기존 모양으로 돌아간다.
import { useEffect, useState } from 'react';
import { normalizeAgent } from './constants';

const FANDOM = 'https://static.wikia.nocookie.net/valorant/images/';
const BG_TEXT = {
  astra: '4/4a/Astra_Background_Text.png',
  breach: '4/41/Breach_Background_Text.png',
  brimstone: '0/09/Brimstone_Background_Text.png',
  chamber: '7/79/Chamber_Background_Text.png',
  cypher: 'e/e7/Cypher_Background_Text.png',
  fade: 'e/e5/Fade_Background_Text.png',
  jett: '5/5a/Jett_Background_Text.png',
  killjoy: '6/61/Killjoy_Background_Text.png',
  neon: '0/0b/Neon_Background_Text.png',
  omen: 'a/a1/Omen_Background_Text.png',
  phoenix: 'd/db/Phoenix_Background_Text.png',
  raze: 'f/f8/Raze_Background_Text.png',
  reyna: '5/52/Reyna_Background_Text.png',
  sage: 'c/c4/Sage_Background_Text.png',
  skye: 'f/f8/Skye_Background_Text.png',
  sova: 'b/bf/Sova_Background_Text.png',
  viper: '5/5b/Viper_Background_Text.png',
  yoru: 'f/f6/Yoru_Background_Text.png',
  harbor: 'a/a0/Harbor_Background_Text.png',
  gekko: '0/06/Gekko_Background_Text.png',
  deadlock: 'd/d0/Deadlock_Background_Text.png',
  iso: '1/19/Iso_Background_Text.png',
  clove: '7/7d/Clove_Background_Text.png',
  vyse: '4/46/Vyse_Background_Text.png',
  tejo: '4/4c/Tejo_Background_Text.png',
  waylay: '9/95/Waylay_Background_Text.png',
  veto: 'a/ae/Veto_Background_Text.png',
  miks: '2/2f/Miks_Background_Text.png',
  kayo: 'f/f3/KAYO_Background_Text.png'
};

let cache = null;
let pending = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true')
      .then((r) => r.json())
      .then((j) => {
        const map = {};
        (j.data || []).forEach((a) => {
          if (!a.fullPortrait) return;
          const key = normalizeAgent(a.displayName);
          map[key] = {
            portrait: a.fullPortrait,
            text: BG_TEXT[key] ? FANDOM + BG_TEXT[key] : a.background || null,
            // RRGGBBAA 그대로 CSS 8자리 hex로 쓴다. [0] 요원 색, [1] 바탕(짙은 남색).
            colors: (a.backgroundGradientColors || []).map((c) => `#${c}`)
          };
        });
        cache = map;
        return map;
      })
      .catch(() => { pending = null; return {}; });
  }
  return pending;
}

export function useAgentArt() {
  const [art, setArt] = useState(cache || {});
  useEffect(() => {
    let alive = true;
    load().then((m) => { if (alive) setArt(m); });
    return () => { alive = false; };
  }, []);
  return (name) => (name ? art[normalizeAgent(name)] || null : null);
}

// 카드 전체 배경: 왼쪽(글자 자리)만 어둡게 → 배경 문구 → 요원 색 그라데이션.
// 오른쪽 초상화 자리는 아무것도 덮지 않는다.
export function agentCardBg(art, text = ['auto 125%', 'right 10% center']) {
  const c0 = art.colors[0] || '#1F2A36', c1 = art.colors[1] || '#0F1923';
  const layers = [
    ['linear-gradient(90deg,rgba(11,13,16,.86) 0%,rgba(11,13,16,.55) 38%,rgba(11,13,16,0) 66%)', 'cover', 'center'],
    art.text && [`url(${art.text})`, ...text],
    [`radial-gradient(110% 130% at 92% 20%,${c0} 0%,${c1} 78%)`, 'cover', 'center']
  ].filter(Boolean);
  return {
    backgroundColor: c1,
    backgroundImage: layers.map((l) => l[0]).join(', '),
    backgroundSize: layers.map((l) => l[1]).join(', '),
    backgroundPosition: layers.map((l) => l[2]).join(', '),
    backgroundRepeat: 'no-repeat'
  };
}
