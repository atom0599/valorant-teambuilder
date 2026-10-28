'use client';

// 명예의 전당 / 불명예의 전당 시상대. 부문 하나를 무대 하나로 보여 주고(화살표 · 막대 ·
// 좌우로 밀기 · 키보드 ← →로 넘김), 1 · 2 · 3위가 각자 그 기록을 세운 요원으로 단상 위에 선다.
// 명예는 축하 무대(핀 조명 · 금빛 빛줄기 · 후광 · 금가루 · 꽃가루), 불명예는 비 내리는 밤의
// 뒷골목(흔들리는 전구 · 네온 띠 · 보랏빛 비 · 색 바랜 요원). 스타일은 globals.css의 .ps*.
import { useEffect, useRef, useState } from 'react';
import { agentKo, fmtDate } from '../lib/constants';
import FameIcon from './FameIcons';

// 부문 영어 이름 (무대 위 작은 제목)
const EN = {
  kills: 'MOST KILLS', acs: 'HIGHEST ACS', hs: 'HEADSHOT %', firstKills: 'FIRST BLOODS', plants: 'SPIKE PLANTS',
  assists: 'ASSISTS', kd: 'BEST K/D', deaths: 'MOST DEATHS', firstDeaths: 'FIRST DEATHS', lowKills: 'FEWEST KILLS',
  mvpLoss: 'MVP IN DEFEAT', lowAcs: 'LOWEST ACS'
};

// 같은 순위(공동)를 한 칸으로 묶는다: { rank, tied, value, rows }.
function groupRows(rows) {
  const groups = [];
  rows.forEach((r) => {
    const g = groups[groups.length - 1];
    if (g && g.rank === r.rank) g.rows.push(r);
    else groups.push({ rank: r.rank, tied: r.tied, value: r.value, rows: [r] });
  });
  return groups;
}
// 공동 순위(2명 이상)는 "누구 외 N명", 마우스를 올리면 전원 이름.
const names = (g) => (g.rows.length > 1 ? `${g.rows[0].id} 외 ${g.rows.length - 1}명` : g.rows[0].id);
const allNames = (g) => (g.rows.length > 1 ? g.rows.map((r) => r.id).join(', ') : undefined);
// 그 판 정보 한 줄 / 그 판 스탯. 경기 하나에 묶이지 않는 누적 기록은 모스트 요원.
const matchLine = (r) => (r.m
  ? [fmtDate(r.m.date), r.m.map, r.m.agent ? agentKo(r.m.agent) : null, r.m.score ? `${r.m.score} ${r.m.result}` : r.m.result].filter(Boolean).join(' · ')
  : [r.sub, r.agent ? `모스트 요원 ${agentKo(r.agent)}` : null].filter(Boolean).join(' · '));
const statsOf = (r) => (r.m ? [
  r.m.kills != null && ['K/D/A', `${r.m.kills}/${r.m.deaths ?? 0}/${r.m.assists ?? 0}`],
  r.m.acs != null && ['ACS', r.m.acs],
  r.m.hsPct != null && ['HS', `${r.m.hsPct}%`]
].filter(Boolean) : []);
const Mini = ({ stats }) => (stats.length ? (
  <div className="psMini">{stats.map(([k, v]) => <span key={k}><i>{k}</i><b>{v}</b></span>)}</div>
) : null);

// "40킬" · "5.00" · "53%" → 0부터 그 값까지 올라가는 숫자.
export function CountUp({ value, dur }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const m = String(value).match(/^(\d+(?:\.\d+)?)(.*)$/);
    if (!m) { setText(value); return undefined; }
    const n = Number(m[1]), dec = (m[1].split('.')[1] || '').length, suf = m[2];
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      setText((n * e).toFixed(dec) + suf);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return text;
}

export default function FamePodium({ cats, kind, agentArt }) {
  const shame = kind === 'shame';
  const [idx, setIdx] = useState(0);
  const [tip, setTip] = useState(null); // { g, x, y }
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fx = useRef({ motes: [], confetti: [], W: 0, H: 0 });
  const x0 = useRef(null);
  const first = useRef(true);
  const n = cats.length;
  const i = Math.min(idx, n - 1);
  const go = (d) => setIdx((v) => (Math.min(v, n - 1) + d + n) % n);

  // 입자: 명예는 떠오르는 금가루 + 넘길 때 꽃가루, 불명예는 비스듬히 내리는 보랏빛 비.
  useEffect(() => {
    const cv = canvasRef.current, stage = stageRef.current;
    if (!cv || !stage) return undefined;
    const cx = cv.getContext('2d');
    const s = fx.current;
    const seed = () => {
      s.motes = Array.from({ length: shame ? 150 : 70 }, () => ({ x: Math.random() * s.W, y: Math.random() * s.H, r: Math.random() * 1.8 + .4, s: Math.random() * .35 + .1, w: Math.random() * Math.PI * 2 }));
    };
    const resize = () => {
      const r = stage.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      s.W = r.width; s.H = r.height; cv.width = s.W * d; cv.height = s.H * d; cx.setTransform(d, 0, 0, d, 0, 0);
      seed();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    let raf;
    const loop = () => {
      cx.clearRect(0, 0, s.W, s.H);
      s.motes.forEach((m) => {
        m.w += .02;
        if (shame) {
          m.y += 7 + m.s * 10; m.x -= 1.2;
          if (m.y > s.H + 20) { m.y = -20 - Math.random() * 60; m.x = Math.random() * (s.W + 80); }
          cx.strokeStyle = `rgba(175,160,240,${.14 + m.r * .06})`; cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(m.x, m.y); cx.lineTo(m.x + 2.4, m.y - 16); cx.stroke();
          return;
        }
        m.y -= m.s;
        if (m.y < -5) { m.y = s.H + 5; m.x = Math.random() * s.W; }
        cx.fillStyle = `rgba(255,220,150,${.35 + Math.sin(m.w) * .25})`;
        cx.beginPath(); cx.arc(m.x + Math.sin(m.w) * 4, m.y, m.r, 0, 7); cx.fill();
      });
      s.confetti = s.confetti.filter((p) => p.life > 0);
      s.confetti.forEach((p) => {
        p.vy += .22; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .009;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.max(0, p.life); cx.fillStyle = p.c;
        cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); cx.restore();
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [shame]);

  // 명예는 넘길 때마다 꽃가루 (처음 그릴 때는 빼고). 연타하면 꽃가루가 수천 개 쌓여 화면이
  // 버벅이고 클릭이 씹힌 것처럼 느껴져서, 새로 터질 때 이전 꽃가루는 치우고 0.35초 안의 연타는 건너뛴다.
  const lastBurst = useRef(0);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (shame) return;
    const now = performance.now();
    if (now - lastBurst.current < 350) return;
    lastBurst.current = now;
    const s = fx.current, cols = ['#FFE29A', '#FFF6D6', '#E8B23D', '#ffffff', '#F5C451'];
    s.confetti = [];
    for (let k = 0; k < 120; k++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 1.6, v = Math.random() * 9 + 5;
      s.confetti.push({ x: s.W / 2, y: s.H * .42, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: Math.random() * 6 + 4, h: Math.random() * 3 + 2, c: cols[k % cols.length], life: 1 });
    }
  }, [i, shame]);

  if (!n) return null;
  const c = cats[i];
  const groups = groupRows(c.rows);
  const byRank = (rk) => groups.find((g) => g.rank === rk) || null;
  const top = groups[0].rows[0];
  const art = agentArt(top.agent);
  const order = [[2, byRank(2)], [1, groups[0]], [3, byRank(3)]];
  const leds = shame ? ['#4FA3B8', '#E0566C', '#9B6BD0'] : ['#C9D2DA', 'var(--th)', '#E7B27E'];

  const onKey = (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  // 화살표 · 막대는 누르는 순간(pointerdown) 바로 넘긴다. 아주 빠르게 연타하면 누를 때와 뗄 때 위치가
  // 조금 달라져 브라우저가 클릭으로 치지 않는 일이 있어서. 키보드(Enter · Space)는 click으로 받는다.
  const press = (fn) => ({
    onPointerDown: (e) => { if (e.button === 0) { e.preventDefault(); fn(); } },
    onClick: (e) => { if (e.detail === 0) fn(); }
  });
  // 툴팁 · 깊이감은 마우스에서만. 터치 기기는 탭할 때 화면이 바뀌면 첫 탭을 "마우스 올리기"로 써 버려
  // 화살표를 두 번 눌러야 넘어가는 일이 있었다.
  const showTip = (e, g, rk) => {
    if (!g || e.pointerType !== 'mouse') return;
    const sr = stageRef.current.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect();
    setTip({ g, rk, x: Math.min(sr.width - 260, Math.max(10, r.left - sr.left + r.width / 2 - 125)), y: Math.max(90, r.top - sr.top + 20) });
  };

  return (
    <div className="psWrap">
      <div
        ref={stageRef}
        className={`ps${shame ? ' shame' : ''}`}
        tabIndex={0}
        onKeyDown={onKey}
        style={art?.colors[0] ? { '--c0': art.colors[0].slice(0, 7) } : undefined}
        // 좌우로 밀기. 버튼을 누른 건 밀기로 치지 않고, 무대 밖에서 손을 떼면 시작점을 버린다 —
        // 남아 있던 시작점 때문에 다음 화살표 클릭이 반대쪽 밀기와 겹쳐 제자리에 머무는 일이 있었다.
        onPointerDown={(e) => { x0.current = e.target.closest('button') ? null : e.clientX; }}
        onPointerUp={(e) => {
          const start = x0.current;
          x0.current = null;
          if (start == null || e.target.closest('button')) return;
          const dx = e.clientX - start;
          if (dx < -50) go(1); else if (dx > 50) go(-1);
        }}
        onPointerCancel={() => { x0.current = null; }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3));
          e.currentTarget.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3));
        }}
        onPointerLeave={(e) => { x0.current = null; e.currentTarget.style.setProperty('--px', 0); e.currentTarget.style.setProperty('--py', 0); }}
      >
        <div className="psText" style={{ backgroundImage: art?.text ? `url(${art.text})` : 'none' }} />
        <div className="psLayer"><div className="psBeam b2" /><div className="psBeam b3" /><div className="psPend"><div className="psCord" /><div className="psBulb" /><div className="psBeam b1" /></div></div>
        <div className="psRays" /><div className="psAura" />
        <canvas ref={canvasRef} className="psFx" />
        <div key={`hud-${c.key}`} className="psHud">
          <div className="en">{shame ? 'HALL OF SHAME' : 'HALL OF FAME'} · {EN[c.key] || ''}</div>
          <div className="ko"><FameIcon k={c.key} />{c.label}</div>
          <div className="line" />
        </div>
        <div key={`pod-${c.key}`} className="psPodium">
          {order.map(([rk, g]) => {
            const r = g?.rows[0];
            const a = r && agentArt(r.agent);
            return (
              <div key={rk} className={`psStep g${rk}`} onPointerEnter={(e) => showTip(e, g, rk)} onPointerLeave={() => setTip(null)}>
                <div className="psAgent">{a?.portrait && <img className="rise" src={a.portrait} alt={agentKo(r.agent) || ''} draggable={false} decoding="async" style={{ animationDelay: `${rk === 1 ? 0 : rk === 2 ? 180 : 320}ms` }} />}</div>
                <div className="psBlock">
                  <div className="psNum">{['', 'I', 'II', 'III'][rk]}</div>
                  {g ? (
                    <>
                      <div className="psName" title={allNames(g)}>{names(g)}</div>
                      <div className="psVal">{rk === 1 ? <CountUp value={g.value} dur={shame ? 2200 : 1000} /> : g.value}</div>
                      {rk === 1 && <Mini stats={statsOf(r)} />}
                    </>
                  ) : <div className="psEmpty">기록 없음</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="psReflect">{leds.map((l, k) => <div key={k} style={{ '--led': l }} />)}</div>
        <div className="psFloor" /><div className="psFog" /><div className="psVignette" />
        {tip && (
          <div className="psTip" style={{ left: tip.x, top: tip.y }}>
            <div className="t1">{allNames(tip.g) || tip.g.rows[0].id}</div>
            <div className="t2">{matchLine(tip.g.rows[0])}</div>
            <Mini stats={statsOf(tip.g.rows[0])} />
          </div>
        )}
        <button className="psNav l" {...press(() => go(-1))} aria-label="이전 부문">◀</button>
        <button className="psNav r" {...press(() => go(1))} aria-label="다음 부문">▶</button>
        <div className="psDots">
          {cats.map((x, k) => <button key={x.key} className={k === i ? 'on' : undefined} {...press(() => setIdx(k))} aria-label={`${k + 1}번째 부문`} />)}
        </div>
      </div>
    </div>
  );
}
