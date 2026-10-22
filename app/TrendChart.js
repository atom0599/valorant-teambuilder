'use client';
// 선수 상세 "추이" 탭: 경기를 할 때마다 그 판까지의 평균 ACS / K/D / 승률이
// 어떻게 변했는지(누적 평균) 꺾은선으로 보여 준다. 점은 그 판에 이겼으면
// 꽉 찬 점, 졌으면 빈 점.
import { useEffect, useRef, useState } from 'react';
import { agentKo, fmtDate } from '../lib/constants';

const MAX_POINTS = 30;
const H = 200, PAD = { l: 38, r: 12, t: 16, b: 24 };
const LINE = '#C8F24C';

// 각 지표: 그 판까지 누적한 값(acc)으로 평균을 낸다. need = 이 지표에 쓸 수 있는 경기.
const METRICS = {
  acs: { label: '평균 ACS', need: (m) => m.acs != null, add: (a, m) => ({ n: (a?.n || 0) + 1, s: (a?.s || 0) + m.acs }), avg: (a) => a.s / a.n, one: (m) => `이 판 ACS ${m.acs}`, fmt: (v) => String(Math.round(v)) },
  kd: { label: 'K/D', need: (m) => m.kills != null, add: (a, m) => ({ k: (a?.k || 0) + m.kills, d: (a?.d || 0) + (m.deaths || 0) }), avg: (a) => (a.d ? a.k / a.d : a.k), one: (m) => `이 판 ${m.kills}/${m.deaths}/${m.assists}`, fmt: (v) => v.toFixed(2) },
  rate: { label: '승률', need: () => true, add: (a, m) => ({ n: (a?.n || 0) + 1, w: (a?.w || 0) + (m.result === '승' ? 1 : 0) }), avg: (a) => (a.w / a.n) * 100, one: (m) => `${m.result} ${m.score}`, fmt: (v) => `${Math.round(v)}%` }
};

function niceTicks(lo, hi) {
  const span = hi - lo || 1;
  const step = [1, 2, 2.5, 5, 10].map((s) => s * 10 ** Math.floor(Math.log10(span / 3))).find((s) => span / s <= 4);
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export default function TrendChart({ matches, pill }) {
  const [metric, setMetric] = useState('acs');
  const [hover, setHover] = useState(null);
  // 그래프를 칸의 실제 너비(px)로 그려야 좁은 선수 상세에서도 글자가 작아지지 않는다.
  const boxRef = useRef(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const def = METRICS[metric];

  // 누적은 전체 경기로 하고, 그래프에는 최근 MAX_POINTS판만 그린다.
  let acc = null;
  let points = [...(matches || [])].sort((a, b) => a.date - b.date).filter(def.need).map((m, i) => {
    acc = def.add(acc, m);
    return { m, v: def.avg(acc), n: i + 1 };
  });
  const total = points.length;
  points = points.slice(-MAX_POINTS);

  const head = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {Object.entries(METRICS).map(([k, d]) => (
        <button key={k} onClick={() => { setMetric(k); setHover(null); }} style={{ ...pill(metric === k, '#C8F24C'), padding: '6px 12px', fontSize: 11 }}>{d.label}</button>
      ))}
    </div>
  );
  if (points.length < 2) {
    return <div ref={boxRef}>{head}<div style={{ fontSize: 12, color: '#6B737C', padding: '6px 0' }}>{metric === 'rate' ? '경기가 2판 이상 있어야 추이를 볼 수 있습니다.' : '스탯이 있는 경기가 2판 이상 있어야 추이를 볼 수 있습니다.'}</div></div>;
  }

  const vals = points.map((p) => p.v);
  const now = vals[vals.length - 1];
  // 최근 5판 동안 평균이 얼마나 움직였는지.
  const ago = vals[Math.max(0, vals.length - 6)];
  const diff = now - ago;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const minSpan = metric === 'rate' ? 20 : metric === 'kd' ? 0.4 : 40;
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const padY = (hi - lo) * 0.12;
  lo = Math.max(0, lo - padY); hi = metric === 'rate' ? Math.min(100, hi + padY) : hi + padY;
  const ticks = niceTicks(lo, hi).filter((t) => t >= lo && t <= hi);
  const x = (i) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  const hp = hover != null ? points[hover] : null;
  const colW = (W - PAD.l - PAD.r) / Math.max(points.length - 1, 1);

  return (
    <div ref={boxRef}>
      {head}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8, fontSize: 11, color: '#8B949E' }}>
        <span>지금 {def.label} <b style={{ color: '#E8EAEC', fontFamily: "'IBM Plex Mono'", fontSize: 13 }}>{def.fmt(now)}</b></span>
        <span>최근 5판 동안 {def.fmt(Math.abs(diff)) === def.fmt(0)
          ? <span style={{ color: '#8B949E' }}>변화 없음</span>
          : <span style={{ color: diff > 0 ? '#C8F24C' : '#FF7A84', fontFamily: "'IBM Plex Mono'" }}>{diff > 0 ? '▲' : '▼'} {def.fmt(Math.abs(diff))}</span>}</span>
        <span style={{ marginLeft: 'auto', color: '#6B737C' }}>● 승 ○ 패{total > MAX_POINTS ? ` · 최근 ${MAX_POINTS}판` : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#20262E" strokeWidth="1" />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6B737C" fontFamily="IBM Plex Mono">{def.fmt(t)}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 6} fontSize="10" fill="#6B737C" fontFamily="IBM Plex Mono">{fmtDate(points[0].m.date).slice(5)}</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="#6B737C" fontFamily="IBM Plex Mono">{fmtDate(points[points.length - 1].m.date).slice(5)}</text>
          {hp && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#3A424C" strokeWidth="1" />}
          <path d={path} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const win = p.m.result === '승';
            return <circle key={i} cx={x(i)} cy={y(p.v)} r={hover === i ? 5.5 : 4} fill={win ? LINE : '#14181D'} stroke={win ? '#14181D' : LINE} strokeWidth="2" />;
          })}
          {points.map((p, i) => (
            <rect key={`h${i}`} x={x(i) - colW / 2} y={0} width={colW} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hp && (
          <div style={{ position: 'absolute', top: 4, left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) / W > 0.6 ? 'calc(-100% - 10px)' : '10px'})`, pointerEvents: 'none', background: '#0F1318', border: '1px solid #2A323B', borderRadius: 8, padding: '6px 9px', fontSize: 11, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,.4)' }}>
            <div style={{ fontWeight: 700, color: '#E8EAEC' }}>{def.label} {def.fmt(hp.v)} <span style={{ fontWeight: 400, color: '#8B949E' }}>({hp.n}판 누적)</span></div>
            <div style={{ color: '#8B949E', marginTop: 2 }}>{fmtDate(hp.m.date)} · {hp.m.map}{hp.m.agent ? ` · ${agentKo(hp.m.agent)}` : ''}</div>
            <div style={{ color: hp.m.result === '승' ? '#C8F24C' : '#FF7A84', marginTop: 2 }}>{metric === 'rate' ? def.one(hp.m) : `${hp.m.result} · ${def.one(hp.m)}`}</div>
          </div>
        )}
      </div>
    </div>
  );
}
