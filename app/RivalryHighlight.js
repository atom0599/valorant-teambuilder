'use client';
// 홈 "내전 하이라이트": 내전 날 하나를 같은 두 팀이 치른 시리즈(세트 여러 개)로 보고,
// 세 장으로 넘겨 본다.
//   01 에이스 대결 — 양 팀 에이스의 그날 전체 스탯 비교 + 세트별 세부
//   02 라인업     — 열 명 전원 스탯
//   03 흐름       — 세트마다 라운드를 누가 땄는지 (라운드 기록이 없으면 불러온다)
// 위의 "전체 / 1세트 / 2세트 …"로 보는 범위를 고르면 세 장 모두 그 범위로 바뀐다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_IMG, agentKo } from '../lib/constants';
import { CountUp } from './FamePodium';

const TEAM = ['#2FD3B7', '#FF4B57']; // 팀 밸런싱 화면과 같은 두 팀 색 (왼쪽 = 시리즈 이긴 팀)
const SLIDES = ['에이스 대결', '라인업', '흐름'];
const short = (id) => String(id).split('#')[0];
const scoreOf = (mt) => String(mt.score || '').split(/[:\-]/).map((s) => parseInt(s, 10));
const mapImg = (map) => MAP_IMG[map] || MAP_IMG[String(map).split(',')[0]?.trim()] || '/maps/ascent.png';
const overlap = (list, set) => list.filter((p) => set.has(p.id)).length;

// 그날 경기들을 시리즈로 묶는다: 양 팀 명단이 5명 중 3명 이상 겹치면 같은 두 팀.
// 팀이 새로 짜이면 다음 시리즈. 각 세트는 sides[0] = 시리즈 왼쪽 팀 선수들.
function buildSeries(matches) {
  const out = [];
  let cur = null;
  matches.forEach((mt) => {
    const [ws, ls] = scoreOf(mt);
    let aWon = null;
    if (cur) {
      if (overlap(mt.winners, cur.A) >= 3 && overlap(mt.losers, cur.B) >= 3) aWon = true;
      else if (overlap(mt.winners, cur.B) >= 3 && overlap(mt.losers, cur.A) >= 3) aWon = false;
    }
    if (aWon == null) { cur = { A: new Set(), B: new Set(), sets: [] }; out.push(cur); aWon = true; }
    (aWon ? mt.winners : mt.losers).forEach((p) => cur.A.add(p.id));
    (aWon ? mt.losers : mt.winners).forEach((p) => cur.B.add(p.id));
    cur.sets.push({ mt, sides: aWon ? [mt.winners, mt.losers] : [mt.losers, mt.winners], score: aWon ? [ws, ls] : [ls, ws], winner: aWon ? 0 : 1 });
  });
  // 세트를 더 많이 딴 팀을 왼쪽으로 (같으면 첫 세트 이긴 팀)
  return out.map((s) => {
    const wins = [0, 1].map((t) => s.sets.filter((x) => x.winner === t).length);
    const flip = wins[1] > wins[0];
    const sets = s.sets.map((x, i) => (flip ? { ...x, sides: [x.sides[1], x.sides[0]], score: [x.score[1], x.score[0]], winner: 1 - x.winner } : x)).map((x, i) => ({ ...x, no: i + 1 }));
    return { sets, wins: flip ? [wins[1], wins[0]] : wins };
  });
}

// 선수별 합계: 킬 · 데스 · 어시 · 퍼스트 킬 · 클러치는 더하고, ACS · HS%는 라운드 수로 가중 평균.
function aggregate(sets, side) {
  const by = new Map();
  sets.forEach((s) => {
    const n = (s.score[0] + s.score[1]) || 1;
    s.sides[side].forEach((p) => {
      const e = by.get(p.id) || { id: p.id, sets: 0, rounds: 0, acsW: 0, acsN: 0, hsW: 0, hsN: 0, kills: null, deaths: null, assists: null, firstKills: null, clutches: null, mvp: 0, agents: {} };
      e.sets += 1;
      if (p.acs != null) { e.acsW += p.acs * n; e.acsN += n; }
      if (p.hsPct != null) { e.hsW += p.hsPct * n; e.hsN += n; }
      ['kills', 'deaths', 'assists', 'firstKills', 'clutches'].forEach((k) => { if (p[k] != null) e[k] = (e[k] || 0) + p[k]; });
      if (p.mvp === 'match') e.mvp += 1;
      if (p.agent) e.agents[p.agent] = { n: (e.agents[p.agent]?.n || 0) + 1, icon: p.agentIcon };
      by.set(p.id, e);
    });
  });
  return [...by.values()].map((e) => {
    const [agent, a] = Object.entries(e.agents).sort((x, y) => y[1].n - x[1].n)[0] || [null, null];
    return {
      ...e, agent, agentIcon: a?.icon || null,
      acs: e.acsN ? Math.round(e.acsW / e.acsN) : null,
      hsPct: e.hsN ? Math.round(e.hsW / e.hsN) : null,
      kd: e.kills == null ? null : Math.round((e.deaths ? e.kills / e.deaths : e.kills) * 100) / 100
    };
  }).sort((a, b) => (b.acs ?? -1) - (a.acs ?? -1));
}

// 라운드마다 이긴 팀 (0 = 왼쪽, 1 = 오른쪽). 선수 기록의 rounds('W'/'L')에서 읽는다.
function roundSeq(set) {
  const a = set.sides[0].find((p) => p.rounds)?.rounds;
  if (a) return [...a].map((c) => (c === 'W' ? 0 : 1));
  const b = set.sides[1].find((p) => p.rounds)?.rounds;
  return b ? [...b].map((c) => (c === 'W' ? 1 : 0)) : null;
}
const matchKeyOf = (set) => [...set.sides[0], ...set.sides[1]].find((p) => p.matchKey)?.matchKey || null;

export default function RivalryHighlight({ hl, hlDay, hlDays, hlIndex, setHlIndex, agentArt, realNameOf, openPlayer, openMatch, ensureRounds }) {
  const series = useMemo(() => buildSeries(hl.matches), [hl.matches]);
  // 세트가 가장 많은 시리즈부터 (같으면 나중 것)
  const defaultSeries = series.reduce((best, s, i) => (s.sets.length >= series[best].sets.length ? i : best), 0);
  const [seriesIdx, setSeriesIdx] = useState(null);
  const [scope, setScope] = useState(0); // 0 = 전체, n = n세트
  const [slide, setSlide] = useState(0);
  useEffect(() => { setSeriesIdx(null); setScope(0); }, [hlDay.start]);
  const sr = series[seriesIdx ?? defaultSeries] || series[0];
  const sets = scope ? sr.sets.filter((s) => s.no === scope) : sr.sets;

  // 에이스는 시리즈 전체 기준으로 고정 (절반 이상 세트를 뛴 사람 중 평균 ACS 1위)
  const total = useMemo(() => [0, 1].map((t) => aggregate(sr.sets, t)), [sr]);
  const aceIds = total.map((list) => (list.find((p) => p.sets * 2 >= sr.sets.length && p.acs != null) || list[0])?.id);
  const rows = useMemo(() => [0, 1].map((t) => aggregate(sets, t)), [sets]);
  const teamName = (t) => (aceIds[t] ? `팀 ${short(aceIds[t])}` : t ? '오른쪽 팀' : '왼쪽 팀');

  const d0 = new Date(hl.matches[0].date), d1 = new Date(hl.matches[hl.matches.length - 1].date);
  const dayLabel = `${d0.getMonth() + 1}월 ${d0.getDate()}${d1.getDate() !== d0.getDate() ? `~${d1.getMonth() !== d0.getMonth() ? `${d1.getMonth() + 1}월 ` : ''}${d1.getDate()}` : ''}일`;
  const isToday = Date.now() >= hlDay.start && Date.now() < hlDay.end;

  const drag = useRef(null);
  const go = (i) => setSlide(Math.max(0, Math.min(SLIDES.length - 1, i)));
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    const s = drag.current; drag.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(slide + (dx < 0 ? 1 : -1));
  };

  const k = `${hlDay.start}-${seriesIdx ?? defaultSeries}-${scope}`;
  const ctx = { sr, sets, scope, rows, total, aceIds, teamName, agentArt, realNameOf, openPlayer };
  const bgMap = (scope ? sets[0] : sr.sets[sr.sets.length - 1]).mt.map;

  return (
    <div className="rvCard" data-lift="1">
      <div className="rvBg" key={`bg-${bgMap}`} style={{ backgroundImage: `url(${mapImg(bgMap)})` }} />
      <div className="rvHead">
        <div style={{ minWidth: 0 }}>
          <div className="rvEyebrow">MATCH DAY RECAP</div>
          <div className="rvTitle">{isToday ? '오늘의' : dayLabel} 내전 하이라이트</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flex: 'none', alignItems: 'center' }}>
          {series.length > 1 && series.map((s, i) => (
            <button key={i} className={`rvPart${i === (seriesIdx ?? defaultSeries) ? ' on' : ''}`} onClick={() => { setSeriesIdx(i); setScope(0); }}>{i + 1}부</button>
          ))}
          {hlDays.length > 1 && [['◀', hlIndex + 1, hlIndex >= hlDays.length - 1, '이전 내전 날'], ['▶', hlIndex - 1, hlIndex <= 0, '다음 내전 날']].map(([t, to, off, title]) => (
            <button key={t} className="hlNav" title={title} disabled={off} onClick={() => setHlIndex(to)}>{t}</button>
          ))}
        </div>
      </div>

      {/* 두 팀 · 세트 스코어 */}
      <div className="rvVersus" key={`vs-${k}`}>
        {[0, 1].map((t) => (
          <div key={t} className={`rvTeamBox t${t}`} style={{ '--tc': TEAM[t] }}>
            <div className="nm">{sr.wins[t] > sr.wins[1 - t] && <span className="crown">👑</span>}{teamName(t)}</div>
            <div className="icons">{total[t].slice(0, 5).map((p) => p.agentIcon ? <img key={p.id} src={p.agentIcon} alt="" title={short(p.id)} /> : <span key={p.id} />)}</div>
          </div>
        ))}
        <div className="rvSetScore">
          <b style={{ color: TEAM[0] }}>{sr.wins[0]}</b><span>:</span><b style={{ color: TEAM[1] }}>{sr.wins[1]}</b>
          <em>SET SCORE</em>
        </div>
      </div>

      <div className="rvScopes" data-scrollx="1">
        <button className={`rvScope${!scope ? ' on' : ''}`} onClick={() => setScope(0)}>전체 <span>{sr.sets.length}세트</span></button>
        {sr.sets.map((s) => (
          <button key={s.no} className={`rvScope${scope === s.no ? ' on' : ''}`} onClick={() => setScope(s.no)}>
            {s.no}세트 <span>{s.mt.map}</span>
            <b><i style={{ color: TEAM[0] }}>{s.score[0]}</i>:<i style={{ color: TEAM[1] }}>{s.score[1]}</i></b>
          </button>
        ))}
      </div>

      <div className="rvTabs">
        {SLIDES.map((label, i) => (
          <button key={label} className={`rvTab${slide === i ? ' on' : ''}`} onClick={() => go(i)}><span className="n">0{i + 1}</span>{label}</button>
        ))}
        <span className="rvTabBar" style={{ transform: `translateX(${slide * 100}%)` }} />
      </div>

      <div className="rvView" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}>
        <div className="rvTrack" style={{ transform: `translateX(${-slide * 100}%)` }}>
          <div className={`rvSlide${slide === 0 ? ' on' : ''}`} key={`s0-${k}`}><AceDuel {...ctx} /></div>
          <div className={`rvSlide${slide === 1 ? ' on' : ''}`} key={`s1-${k}`}><Lineup {...ctx} /></div>
          <div className={`rvSlide${slide === 2 ? ' on' : ''}`} key={`s2-${k}`}><Flow {...ctx} active={slide === 2} ensureRounds={ensureRounds} /></div>
        </div>
      </div>

      <div className="rvFoot">
        <div className="rvDots">{SLIDES.map((label, i) => <button key={label} className={slide === i ? 'on' : ''} onClick={() => go(i)} aria-label={label} />)}</div>
        <button className="rvLink" onClick={() => openMatch((scope ? sets[0] : sr.sets[sr.sets.length - 1]).mt.date)}>경기 상세 보기 →</button>
      </div>
    </div>
  );
}

function AceCard({ p, t, label, art, realNameOf, openPlayer }) {
  if (!p) return <div className={`rvSide t${t}`} />;
  const rn = realNameOf(p.id);
  return (
    <div className={`rvSide t${t}`} style={{ '--tc': TEAM[t] }}>
      {art?.portrait
        ? <img className={`rvPortrait t${t}`} src={art.portrait} alt="" aria-hidden="true" />
        : p.agentIcon && <img className={`rvPortrait icon t${t}`} src={p.agentIcon} alt="" aria-hidden="true" />}
      <button className="rvAce" onClick={() => openPlayer(p.id)}>
        <span className="k">{label}</span>
        <span className="n">{short(p.id)}</span>
        <span className="s">{p.agent ? agentKo(p.agent) : '—'}{rn ? <em> · {rn}</em> : null}</span>
      </button>
    </div>
  );
}

// 01 에이스 대결: 고른 범위의 합계를 가운데 막대로 비교, "전체"일 때는 아래에 세트별 세부.
function AceDuel({ sr, sets, scope, rows, total, aceIds, agentArt, realNameOf, openPlayer }) {
  const ace = [0, 1].map((t) => rows[t].find((p) => p.id === aceIds[t]) || null);
  const art = [0, 1].map((t) => { const p = total[t].find((x) => x.id === aceIds[t]); return p ? agentArt(p.agent) : null; });
  const stat = [
    ['ACS', (p) => p.acs],
    ['K/D', (p) => p.kd, (v) => v.toFixed(2)],
    ['킬', (p) => p.kills],
    ['데스', (p) => p.deaths, null, true],
    ['어시스트', (p) => p.assists],
    ['HS%', (p) => p.hsPct, (v) => `${v}%`],
    ['퍼스트 킬', (p) => p.firstKills],
    ['클러치', (p) => p.clutches],
    ...(!scope ? [['경기 MVP', (p) => p.mvp]] : [])
  ].map(([label, get, fmt, low]) => ({ label, v: ace.map((p) => (p ? get(p) : null)), fmt: fmt || String, low }))
    .filter((r) => r.v.some((x) => x != null));
  const per = (s, t) => s.sides[t].find((p) => p.id === aceIds[t]);
  return (
    <div className="rvDuelWrap">
      <div className="rvDuel">
        <AceCard p={ace[0] || total[0].find((x) => x.id === aceIds[0])} t={0} label={`ACE · ${sr.wins[0] > sr.wins[1] ? 'WIN' : 'TEAM 1'}`} art={art[0]} realNameOf={realNameOf} openPlayer={openPlayer} />
        <div className="rvTape">
          <div className="rvTapeHead">{scope ? `${scope}세트 · ${sets[0].mt.map}` : `${sr.sets.length}세트 합계`}<span>평균 ACS · HS%는 라운드 수 기준</span></div>
          {stat.map((r, i) => {
            const [a, b] = r.v;
            const max = Math.max(a || 0, b || 0);
            const best = a == null || b == null || a === b ? null : (r.low ? a < b : a > b) ? 0 : 1;
            const val = (v) => (v == null ? '—' : r.label === 'ACS' ? <CountUp value={String(v)} dur={900} /> : r.fmt(v));
            return (
              <div key={r.label} className="rvRow" style={{ '--d': i }}>
                <span className={`v${best === 0 ? ' best' : ''}`}>{val(a)}</span>
                <span className="bar t0"><i style={{ width: `${max ? ((a || 0) / max) * 100 : 0}%` }} /></span>
                <span className="lab">{r.label}</span>
                <span className="bar t1"><i style={{ width: `${max ? ((b || 0) / max) * 100 : 0}%` }} /></span>
                <span className={`v r${best === 1 ? ' best' : ''}`}>{val(b)}</span>
              </div>
            );
          })}
        </div>
        <AceCard p={ace[1] || total[1].find((x) => x.id === aceIds[1])} t={1} label={`ACE · ${sr.wins[1] > sr.wins[0] ? 'WIN' : 'TEAM 2'}`} art={art[1]} realNameOf={realNameOf} openPlayer={openPlayer} />
      </div>
      {!scope && sr.sets.length > 1 && (
        <div className="rvPerSet">
          <div className="hd"><span>세트별</span><span>{short(aceIds[0] || '')}</span><span /><span>{short(aceIds[1] || '')}</span></div>
          {sr.sets.map((s, i) => {
            const a = per(s, 0), b = per(s, 1);
            const line = (p) => (p ? <><b>{p.acs ?? '—'}</b><span>{p.kills ?? '—'}/{p.deaths ?? '—'}/{p.assists ?? '—'}</span>{p.agentIcon && <img src={p.agentIcon} alt="" />}</> : <span className="na">안 뜀</span>);
            return (
              <div key={s.no} className="row" style={{ '--d': i }}>
                <span className="set"><em>{s.no}세트</em>{s.mt.map}</span>
                <span className="p t0">{line(a)}</span>
                <span className="sc"><i style={{ color: TEAM[0] }}>{s.score[0]}</i>:<i style={{ color: TEAM[1] }}>{s.score[1]}</i></span>
                <span className="p t1">{line(b)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 02 라인업: 고른 범위의 선수별 합계, 팀마다 평균 ACS 순.
function Lineup({ sr, sets, scope, rows, aceIds, teamName, realNameOf, openPlayer }) {
  const top = Math.max(1, ...rows.flat().map((p) => p.acs || 0));
  const wins = scope ? [sets[0].score[0], sets[0].score[1]] : sr.wins;
  return (
    <div className="rvLineup">
      {[0, 1].map((t) => (
        <div key={t} className={`rvTeam t${t}`} style={{ '--tc': TEAM[t] }}>
          <div className="rvTeamHead"><span className="tn">{teamName(t)} <b>{wins[t]}</b></span><span className="cols"><span>K/D/A</span><span>HS</span><span>ACS</span></span></div>
          {rows[t].map((p, i) => {
            const rn = realNameOf(p.id);
            return (
              <button key={p.id} className={`rvPl${p.id === aceIds[t] ? ' ace' : ''}`} style={{ '--i': i }} onClick={() => openPlayer(p.id)}>
                {p.agentIcon ? <img src={p.agentIcon} alt={agentKo(p.agent) || ''} /> : <span className="noimg" />}
                <span className="nm">
                  <span className="n">{short(p.id)}{p.mvp > 0 && <em className="mvp">MVP{p.mvp > 1 ? ` ×${p.mvp}` : ''}</em>}</span>
                  <span className="s">{rn || agentKo(p.agent) || '—'}{!scope && p.sets < sr.sets.length ? ` · ${p.sets}세트` : ''}</span>
                </span>
                <span className="kda">{p.kills == null ? '—' : `${p.kills}/${p.deaths}/${p.assists}`}</span>
                <span className="hs">{p.hsPct == null ? '—' : `${p.hsPct}%`}</span>
                <span className="acs">{p.acs ?? '—'}</span>
                <span className="fill" style={{ width: `${((p.acs || 0) / top) * 100}%` }} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// 03 흐름: 세트마다 라운드 칸을 이긴 팀 색으로 칠한 줄. 한 세트만 고르면 칸을 크게,
// 점수가 어떻게 쌓였는지 두 팀 점수 그래프와 요약을 같이 보여 준다.
function Flow({ sr, sets, scope, teamName, active, ensureRounds }) {
  const missing = sets.filter((s) => !roundSeq(s) && matchKeyOf(s)?.startsWith('customs:')).map(matchKeyOf);
  const [loading, setLoading] = useState(false);
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!active || !missingKey) return;
    let alive = true;
    setLoading(true);
    (async () => { for (const key of missingKey.split(',')) await ensureRounds(key); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [active, missingKey, ensureRounds]);

  return (
    <div className={`rvFlow${scope ? ' single' : ''}`}>
      <div className="rvLegend">
        <span><i style={{ background: TEAM[0] }} />{teamName(0)} 라운드</span>
        <span><i style={{ background: TEAM[1] }} />{teamName(1)} 라운드</span>
      </div>
      {sets.map((s, si) => <SetFlow key={s.no} s={s} si={si} big={!!scope} loading={loading} />)}
    </div>
  );
}

function SetFlow({ s, si, big, loading }) {
  const seq = roundSeq(s);
  const key = matchKeyOf(s);
  const head = (
    <div className="rvSetHead">
      <span className="t"><em>{s.no}세트</em>{s.mt.map}</span>
      <span className="sc"><i style={{ color: TEAM[0] }}>{s.score[0]}</i> : <i style={{ color: TEAM[1] }}>{s.score[1]}</i></span>
    </div>
  );
  if (!seq) {
    return (
      <div className="rvSet">
        {head}
        <div className="rvNoRounds">{loading && key?.startsWith('customs:') ? '라운드 기록 불러오는 중…' : key?.startsWith('customs:') ? '라운드 기록을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.' : '직접 저장한 경기라 라운드 기록이 없습니다.'}</div>
      </div>
    );
  }
  // 라운드 칸 + 전반 / 후반 / 연장 구분, 칸마다 그 라운드 뒤 점수
  const score = [0, 0];
  const cells = seq.map((w, i) => { score[w] += 1; return { w, i, after: `${score[0]}:${score[1]}` }; });
  const part = (from, to) => { const p = seq.slice(from, to); return [p.filter((x) => x === 0).length, p.filter((x) => x === 1).length]; };
  const halves = [['전반', part(0, 12)], ...(seq.length > 12 ? [['후반', part(12, 24)]] : []), ...(seq.length > 24 ? [['연장', part(24)]] : [])];
  const groups = [cells.slice(0, 12), cells.slice(12, 24), cells.slice(24)].filter((g) => g.length);
  return (
    <div className="rvSet" style={{ '--s': si }}>
      {head}
      <div className="rvStrip">
        {groups.map((g, gi) => (
          <div key={gi} className={`grp${gi === 2 ? ' ot' : ''}`} style={{ flex: g.length }}>
            {g.map((c) => (
              <span key={c.i} className={`cell t${c.w}`} title={`${c.i + 1}라운드 → ${c.after}`} style={{ '--c': si * 0.25 + c.i * 0.045 }}>{big ? c.i + 1 : ''}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="rvHalves">
        {halves.map(([label, [a, b]]) => <span key={label}>{label} <i style={{ color: TEAM[0] }}>{a}</i>:<i style={{ color: TEAM[1] }}>{b}</i></span>)}
      </div>
      {big && <Race seq={seq} />}
    </div>
  );
}

// 한 세트의 점수 그래프: 두 팀 점수가 라운드마다 계단처럼 올라간다.
function Race({ seq }) {
  const W = 600, H = 150, n = seq.length;
  const final = [seq.filter((x) => x === 0).length, seq.filter((x) => x === 1).length];
  const top = Math.max(13, ...final);
  const step = W / n;
  const y = (v) => H - (v / top) * (H - 8);
  const paths = [0, 1].map((t) => {
    let v = 0, d = `M0,${y(0)}`;
    seq.forEach((w, i) => { if (w === t) { v += 1; d += ` L${(i + 0.5) * step},${y(v - 1)} L${(i + 0.5) * step},${y(v)}`; } });
    return `${d} L${W},${y(v)}`;
  });
  // 가장 길게 이어 딴 라운드 · 최대 점수 차
  let run = { t: null, n: 0 }, best = [0, 0], lead = [0, 0], sc = [0, 0];
  seq.forEach((w) => {
    run = run.t === w ? { t: w, n: run.n + 1 } : { t: w, n: 1 };
    best[w] = Math.max(best[w], run.n);
    sc[w] += 1;
    lead[0] = Math.max(lead[0], sc[0] - sc[1]); lead[1] = Math.max(lead[1], sc[1] - sc[0]);
  });
  return (
    <div className="rvRace">
      <div className="rvRaceChart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {[...Array(Math.floor(top / 4) + 1)].map((_, i) => <line key={i} x1="0" x2={W} y1={y(i * 4)} y2={y(i * 4)} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />)}
          {n > 12 && <line x1={12 * step} x2={12 * step} y1="0" y2={H} stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          {n > 24 && <line x1={24 * step} x2={24 * step} y1="0" y2={H} stroke="rgba(255,209,102,.5)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          {paths.map((d, t) => <path key={t} className="rvRaceLine" d={d} pathLength="1" fill="none" stroke={TEAM[t]} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {n > 12 && <span className="mark" style={{ left: `${(12 / n) * 100}%` }}>후반</span>}
        {n > 24 && <span className="mark ot" style={{ left: `${(24 / n) * 100}%` }}>연장</span>}
        {[0, 1].map((t) => <span key={t} className="end" style={{ top: y(final[t]), color: TEAM[t] }}>{final[t]}</span>)}
      </div>
      <div className="rvFacts">
        <div><span>최다 연속 라운드</span><b><i style={{ color: TEAM[0] }}>{best[0]}</i> / <i style={{ color: TEAM[1] }}>{best[1]}</i></b></div>
        <div><span>최대 점수 차</span><b><i style={{ color: TEAM[0] }}>+{lead[0]}</i> / <i style={{ color: TEAM[1] }}>+{lead[1]}</i></b></div>
      </div>
    </div>
  );
}
