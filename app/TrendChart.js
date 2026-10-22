'use client';
// 선수 상세 "추이" 탭: 경기마다 ACS / K/D / 최근 5판 승률이 어떻게 변했는지
// 꺾은선으로 보여 준다. 점은 이긴 판이 꽉 찬 점, 진 판이 빈 점.
import { useEffect, useRef, useState } from 'react';
import { agentKo, fmtDate } from '../lib/constants';

const MAX_POINTS = 30;
const H = 200, PAD = { l: 38, r: 12, t: 16, b: 24 };
const LINE = '#C8F24C';

const METRICS = {
  acs: { label: 'ACS', need: (m) => m.acs != null, val: (m) => m.acs, fmt: (v) => String(Math.round(v)) },
  kd: { label: 'K/D', need: (m) => m.kills != null, val: (m) => (m.deaths ? m.kills / m.deaths : m.kills), fmt: (v) => v.toFixed(2) },
  rate: { label: '승률 (최근 5판)', need: () => true, val: null, fmt: (v) => `${Math.round(v)}%` }
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

  const sorted = [...(matches || [])].sort((a, b) => a.date - b.date);
  let points;
  if (metric === 'rate') {
    // 그 판까지 최근 5판의 승률 (5판이 안 되면 그때까지의 판).
    points = sorted.map((m, i) => {
      const win = sorted.slice(Math.max(0, i - 4), i + 1);
      return { m, v: (win.filter((x) => x.result === '승').length / win.length) * 100, n: win.length };
    });
  } else {
    points = sorted.filter(def.need).map((m) => ({ m, v: def.val(m) }));
  }
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
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (metric === 'rate') { lo = 0; hi = 100; }
  else { const padY = (hi - lo || hi || 1) * 0.12; lo = Math.max(0, lo - padY); hi += padY; }
  const ticks = metric === 'rate' ? [0, 50, 100] : niceTicks(lo, hi).filter((t) => t >= lo && t <= hi);
  const x = (i) => PAD.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  const last5 = vals.slice(-5);
  const recentAvg = last5.reduce((a, b) => a + b, 0) / last5.length;
  const diff = recentAvg - avg;
  const hp = hover != null ? points[hover] : null;
  const colW = (W - PAD.l - PAD.r) / Math.max(points.length - 1, 1);

  return (
    <div ref={boxRef}>
      {head}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 11, color: '#8B949E' }}>
        <span>전체 평균 <b style={{ color: '#E8EAEC', fontFamily: "'IBM Plex Mono'" }}>{def.fmt(avg)}</b></span>
        {metric !== 'rate' && (
          <span>최근 5판 평균 <b style={{ color: '#E8EAEC', fontFamily: "'IBM Plex Mono'" }}>{def.fmt(recentAvg)}</b>
            <span style={{ marginLeft: 4, color: diff >= 0 ? '#C8F24C' : '#FF7A84' }}>{diff >= 0 ? '▲' : '▼'} {def.fmt(Math.abs(diff))}</span>
          </span>
        )}
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
          <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} stroke="#8B949E" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - PAD.r} y={y(avg) - 5} textAnchor="end" fontSize="10" fill="#8B949E">평균 {def.fmt(avg)}</text>
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
            <div style={{ fontWeight: 700, color: '#E8EAEC' }}>{def.label} {def.fmt(hp.v)}{metric === 'rate' ? ` (${hp.n}판)` : ''}</div>
            <div style={{ color: '#8B949E', marginTop: 2 }}>{fmtDate(hp.m.date)} · {hp.m.map}{hp.m.agent ? ` · ${agentKo(hp.m.agent)}` : ''}</div>
            <div style={{ color: hp.m.result === '승' ? '#C8F24C' : '#FF7A84', marginTop: 2 }}>{hp.m.result} {hp.m.score}{hp.m.kills != null ? ` · ${hp.m.kills}/${hp.m.deaths}/${hp.m.assists}` : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}
