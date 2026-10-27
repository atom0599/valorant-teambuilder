'use client';
// 요원 일러스트(fullPortrait · background · backgroundGradientColors)를
// valorant-api.com에서 한 번만 받아 와 이름(normalizeAgent)으로 찾는다.
// 아직 등록 안 된 요원(예: 허시)은 없으니 쓰는 쪽에서 기존 모양으로 돌아간다.
import { useEffect, useState } from 'react';
import { normalizeAgent } from './constants';

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
          map[normalizeAgent(a.displayName)] = {
            portrait: a.fullPortrait,
            background: a.background || null,
            // RRGGBBAA 그대로 CSS 8자리 hex로 쓴다.
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
