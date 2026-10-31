'use client';
// 홈 "내전 하이라이트": 내전 날 하나를 골라, 그날 경기 하나를 세 장으로 넘겨 본다.
//   01 에이스 대결 — 양 팀 에이스(경기 MVP · 팀 MVP)의 그 경기 스탯을 마주 놓고 비교
//   02 라인업     — 열 명 전원의 그 경기 스탯
//   03 흐름       — 라운드마다 누가 이겼는지 누적 점수 차 그래프 (라운드 기록이 없으면 불러온다)
// 기본으로 보이는 경기는 그날 최대 접전, 없으면 마지막 경기.
import { useEffect, useMemo, useRef, useState } from 'react';
import { matchAwards } from '../lib/fame';
import { MAP_IMG, agentKo } from '../lib/constants';
import { CountUp } from './FamePodium';

const WIN = '#C8F24C';
const LOSE = '#FF4B57';
const SLIDES = [['ACE DUEL', '에이스 대결'], ['LINEUP', '라인업'], ['MOMENTUM', '흐름']];
const short = (id) => String(id).split('#')[0];
const kdOf = (p) => (p.kills == null ? null : Math.round((p.deaths ? p.kills / p.deaths : p.kills) * 100) / 100);
const scoreOf = (mt) => String(mt.score || '').split(/[:\-]/).map((s) => parseInt(s, 10));
const mapImg = (map) => MAP_IMG[map] || MAP_IMG[String(map).split(',')[0]?.trim()] || '/maps/ascent.png';

// 팀 에이스: 경기 MVP · 팀 MVP 중 그 팀 사람, 없으면 그 팀 ACS 1위.
function acesOf(mt) {
  const { mvp, teamMvp } = matchAwards(mt);
  const pick = (team) => [mvp, teamMvp].find((p) => p && team.includes(p))
    || team.filter((p) => p.acs != null).sort((a, b) => b.acs - a.acs)[0] || team[0] || null;
  return { w: pick(mt.winners), l: pick(mt.losers), mvp };
}

export default function RivalryHighlight({ hl, hlDay, hlDays, hlIndex, setHlIndex, agentArt, realNameOf, openPlayer, openMatch, ensureRounds }) {
  const matches = hl.matches;
  const [gameDate, setGameDate] = useState(null);
  const [slide, setSlide] = useState(0);
  const mt = matches.find((m) => m.date === gameDate) || hl.close || matches[matches.length - 1];
  useEffect(() => { setGameDate(null); }, [hlDay.start]);

  const d0 = new Date(matches[0].date), d1 = new Date(matches[matches.length - 1].date);
  const dayLabel = `${d0.getMonth() + 1}월 ${d0.getDate()}${d1.getDate() !== d0.getDate() ? `~${d1.getMonth() !== d0.getMonth() ? `${d1.getMonth() + 1}월 ` : ''}${d1.getDate()}` : ''}일`;
  const isToday = Date.now() >= hlDay.start && Date.now() < hlDay.end;
  const mapsPlayed = [...new Set(matches.map((x) => x.map))].join(' · ');

  // 좌우로 밀어서 넘기기 (세로 스크롤은 그대로)
  const drag = useRef(null);
  const go = (i) => setSlide(Math.max(0, Math.min(SLIDES.length - 1, i)));
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    const s = drag.current; drag.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(slide + (dx < 0 ? 1 : -1));
  };

  const [sw, sl] = scoreOf(mt);
  const aces = acesOf(mt);
  const ctx = { mt, aces, agentArt, realNameOf, openPlayer, sw, sl };

  return (
    <div className="rvCard" data-lift="1">
      <div className="rvBg" key={`bg-${mt.date}`} style={{ backgroundImage: `url(${mapImg(mt.map)})` }} />
      <div className="rvHead">
        <div style={{ minWidth: 0 }}>
          <div className="rvEyebrow">MATCH DAY RECAP</div>
          <div className="rvTitle">{isToday ? '오늘의' : dayLabel} 내전 하이라이트</div>
          <div className="rvSub">{hlDay.count}경기 · {mapsPlayed}</div>
        </div>
        {hlDays.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            {[['◀', hlIndex + 1, hlIndex >= hlDays.length - 1, '이전 내전 날'], ['▶', hlIndex - 1, hlIndex <= 0, '다음 내전 날']].map(([t, to, off, title]) => (
              <button key={t} className="hlNav" title={title} disabled={off} onClick={() => setHlIndex(to)}>{t}</button>
            ))}
          </div>
        )}
      </div>

      <div className="rvGames" data-scrollx="1">
        {matches.map((m, i) => {
          const [a, b] = scoreOf(m);
          return (
            <button key={m.date} className={`rvGame${m === mt ? ' on' : ''}`} onClick={() => setGameDate(m.date)}>
              <span className="no">G{i + 1}</span>
              <span>{m.map}</span>
              <b>{Number.isFinite(a) ? `${a}:${b}` : m.score}</b>
              {m === hl.close && <span className="hot" title="그날 최대 접전">😰</span>}
            </button>
          );
        })}
      </div>

      <div className="rvTabs">
        {SLIDES.map(([en, ko], i) => (
          <button key={en} className={`rvTab${slide === i ? ' on' : ''}`} onClick={() => go(i)}>
            <span className="n">0{i + 1}</span>{ko}
          </button>
        ))}
        <span className="rvTabBar" style={{ transform: `translateX(${slide * 100}%)` }} />
      </div>

      <div className="rvView" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}>
        <div className="rvTrack" style={{ transform: `translateX(${-slide * 100}%)` }}>
          <div className={`rvSlide${slide === 0 ? ' on' : ''}`} key={`s0-${mt.date}`}><AceDuel {...ctx} /></div>
          <div className={`rvSlide${slide === 1 ? ' on' : ''}`} key={`s1-${mt.date}`}><Lineup {...ctx} /></div>
          <div className={`rvSlide${slide === 2 ? ' on' : ''}`} key={`s2-${mt.date}`}><Momentum {...ctx} active={slide === 2} ensureRounds={ensureRounds} /></div>
        </div>
      </div>

      <div className="rvFoot">
        <div className="rvDots">
          {SLIDES.map(([en], i) => <button key={en} className={slide === i ? 'on' : ''} onClick={() => go(i)} aria-label={en} />)}
        </div>
        <button className="rvLink" onClick={() => openMatch(mt.date)}>경기 상세 보기 →</button>
      </div>
    </div>
  );
}

function Portrait({ p, art, side }) {
  if (art?.portrait) return <img className={`rvPortrait ${side}`} src={art.portrait} alt="" aria-hidden="true" />;
  return p?.agentIcon ? <img className={`rvPortrait icon ${side}`} src={p.agentIcon} alt="" aria-hidden="true" /> : null;
}

function AceTag({ p, side, label, realNameOf, openPlayer }) {
  if (!p) return <div className={`rvAce ${side}`} />;
  const rn = realNameOf(p.id);
  return (
    <button className={`rvAce ${side}`} onClick={() => openPlayer(p.id)}>
      <span className="k">{label}{p.mvp === 'match' ? ' · 경기 MVP' : p.mvp === 'team' ? ' · 팀 MVP' : ''}</span>
      <span className="n">{short(p.id)}</span>
      <span className="s">{p.agent ? agentKo(p.agent) : '—'}{rn ? <em> · {rn}</em> : null}</span>
    </button>
  );
}

// 01 에이스 대결: 막대는 가운데에서 바깥으로, 두 사람 중 더 나은 쪽 숫자를 금색으로.
function AceDuel({ mt, aces, agentArt, realNameOf, openPlayer, sw, sl }) {
  const { w, l } = aces;
  const rows = [
    ['ACS', (p) => p.acs],
    ['K/D', kdOf, (v) => v.toFixed(2)],
    ['킬', (p) => p.kills],
    ['데스', (p) => p.deaths, null, true],
    ['어시스트', (p) => p.assists],
    ['HS%', (p) => p.hsPct, (v) => `${v}%`],
    ['퍼스트 킬', (p) => p.firstKills],
    ['클러치', (p) => p.clutches]
  ].map(([label, get, fmt, low]) => ({ label, a: w ? get(w) : null, b: l ? get(l) : null, fmt: fmt || String, low }))
    .filter((r) => r.a != null || r.b != null);
  return (
    <div className="rvDuel">
      <div className="rvSide w"><Portrait p={w} art={w && agentArt(w.agent)} side="w" /><AceTag p={w} side="w" label="WIN · ACE" realNameOf={realNameOf} openPlayer={openPlayer} /></div>
      <div className="rvTape">
        <div className="rvScore"><b style={{ color: WIN }}>{Number.isFinite(sw) ? sw : '—'}</b><span>:</span><b style={{ color: LOSE }}>{Number.isFinite(sl) ? sl : '—'}</b></div>
        <div className="rvMap">{mt.map}{sw + sl > 24 ? ' · 연장' : ''}</div>
        {rows.map((r, i) => {
          const max = Math.max(r.a || 0, r.b || 0);
          const better = r.a == null || r.b == null || r.a === r.b ? null : (r.low ? r.a < r.b : r.a > r.b) ? 'a' : 'b';
          return (
            <div key={r.label} className="rvRow" style={{ '--d': i }}>
              <span className={`v${better === 'a' ? ' best' : ''}`}>{r.a == null ? '—' : r.label === 'ACS' ? <CountUp value={String(r.a)} dur={1000} /> : r.fmt(r.a)}</span>
              <span className="bar w"><i style={{ width: `${max ? ((r.a || 0) / max) * 100 : 0}%` }} /></span>
              <span className="lab">{r.label}</span>
              <span className="bar l"><i style={{ width: `${max ? ((r.b || 0) / max) * 100 : 0}%` }} /></span>
              <span className={`v r${better === 'b' ? ' best' : ''}`}>{r.b == null ? '—' : r.label === 'ACS' ? <CountUp value={String(r.b)} dur={1000} /> : r.fmt(r.b)}</span>
            </div>
          );
        })}
      </div>
      <div className="rvSide l"><Portrait p={l} art={l && agentArt(l.agent)} side="l" /><AceTag p={l} side="l" label="ACE" realNameOf={realNameOf} openPlayer={openPlayer} /></div>
    </div>
  );
}

// 02 라인업: 열 명 전원, 팀마다 ACS 순. 아래 얇은 막대가 그 경기 최고 ACS 대비.
function Lineup({ mt, aces, realNameOf, openPlayer, sw, sl }) {
  const all = [...mt.winners, ...mt.losers];
  const top = Math.max(1, ...all.map((p) => p.acs || 0));
  const team = (list, side) => list.slice().sort((a, b) => (b.acs ?? -1) - (a.acs ?? -1)).map((p, i) => {
    const rn = realNameOf(p.id);
    const ace = p === aces.w || p === aces.l;
    return (
      <button key={p.id} className={`rvPl ${side}${ace ? ' ace' : ''}`} style={{ '--i': i }} onClick={() => openPlayer(p.id)}>
        {p.agentIcon ? <img src={p.agentIcon} alt={agentKo(p.agent) || ''} /> : <span className="noimg" />}
        <span className="nm">
          <span className="n">{short(p.id)}{p.mvp === 'match' && <em className="mvp">MVP</em>}</span>
          <span className="s">{rn || agentKo(p.agent) || '—'}</span>
        </span>
        <span className="kda">{p.kills == null ? '—' : `${p.kills}/${p.deaths}/${p.assists}`}</span>
        <span className="hs">{p.hsPct == null ? '—' : `${p.hsPct}%`}</span>
        <span className="acs">{p.acs ?? '—'}</span>
        <span className="fill" style={{ width: `${((p.acs || 0) / top) * 100}%` }} />
      </button>
    );
  });
  return (
    <div className="rvLineup">
      <div className="rvTeam">
        <div className="rvTeamHead w"><span>WIN</span><span className="cols"><span>K/D/A</span><span>HS</span><span>ACS</span></span></div>
        {team(mt.winners, 'w')}
      </div>
      <div className="rvMid">
        <span className="ring" /><span className="ring r2" />
        <div className="sc"><b>{Number.isFinite(sw) ? `${sw}:${sl}` : mt.score}</b><span>{mt.map}</span></div>
      </div>
      <div className="rvTeam">
        <div className="rvTeamHead l"><span>LOSE</span><span className="cols"><span>K/D/A</span><span>HS</span><span>ACS</span></span></div>
        {team(mt.losers, 'l')}
      </div>
    </div>
  );
}

// 03 흐름: rounds = 그 선수 기준 'W'/'L' 문자열 (app/api/records · app/api/rounds).
// 이긴 팀 기준으로 누적 점수 차를 그린다. 위 = 이긴 팀 앞섬, 아래 = 진 팀 앞섬.
function Momentum({ mt, aces, active, ensureRounds }) {
  const seq = mt.winners.find((p) => p.rounds)?.rounds || (() => {
    const r = mt.losers.find((p) => p.rounds)?.rounds;
    return r ? [...r].map((c) => (c === 'W' ? 'L' : 'W')).join('') : null;
  })();
  const matchKey = [...mt.winners, ...mt.losers].find((p) => p.matchKey)?.matchKey || null;
  const [status, setStatus] = useState(null); // null | 'loading' | 'failed'
  useEffect(() => {
    if (!active || seq || !matchKey?.startsWith('customs:')) return;
    let alive = true;
    setStatus('loading');
    ensureRounds(matchKey).then((ok) => { if (alive) setStatus(ok ? null : 'failed'); });
    return () => { alive = false; };
  }, [active, seq, matchKey, ensureRounds]);

  const data = useMemo(() => {
    if (!seq) return null;
    const W = 600, H = 200, mid = H / 2;
    let diff = 0, flips = 0, lastSign = 0, bestW = 0, bestL = 0;
    const streak = { W: 0, L: 0 }, cur = { c: null, n: 0 };
    const diffs = [...seq].map((c) => {
      diff += c === 'W' ? 1 : -1;
      const s = Math.sign(diff);
      if (s && lastSign && s !== lastSign) flips++;
      if (s) lastSign = s;
      bestW = Math.max(bestW, diff); bestL = Math.max(bestL, -diff);
      cur.n = cur.c === c ? cur.n + 1 : 1; cur.c = c;
      streak[c] = Math.max(streak[c], cur.n);
      return diff;
    });
    const unit = (mid - 18) / Math.max(3, ...diffs.map(Math.abs));
    const step = W / seq.length;
    const pts = [[0, mid], ...diffs.map((d, i) => [(i + 1) * step, mid - d * unit])];
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    // 말풍선: 역전한 라운드, 연장 들어간 라운드, 마지막 라운드
    const events = [];
    let sign = 0;
    diffs.forEach((d, i) => {
      const s = Math.sign(d);
      if (s && sign && s !== sign) events.push([i + 1, s > 0 ? '🔄 역전' : '🔄 재역전']);
      if (s) sign = s;
    });
    if (seq.length > 24) events.push([24, '⏱ 연장']);
    events.push([seq.length, '🏁 끝']);
    const half = (from, to) => { const part = seq.slice(from, to); return [part.split('W').length - 1, part.split('L').length - 1]; };
    return { W, H, mid, step, pts, path, events: events.slice(-5), flips, bestW, bestL, streak, h1: half(0, 12), h2: half(12, 24), ot: seq.length > 24 ? half(24) : null };
  }, [seq]);

  if (!data) {
    return (
      <div className="rvEmpty">
        {status === 'loading' ? '라운드 기록 불러오는 중…'
          : matchKey?.startsWith('customs:') ? '라운드 기록을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.'
          : '직접 저장한 경기라 라운드 기록이 없습니다. (내전 결과 불러오기로 저장한 경기만 흐름이 나옵니다)'}
      </div>
    );
  }
  const gid = `rv${mt.date}`;
  const wName = aces.w ? short(aces.w.id) : '이긴 팀';
  const lName = aces.l ? short(aces.l.id) : '진 팀';
  const len = seq.length;
  return (
    <div className="rvMomentum">
      <div className="rvChart">
        <svg viewBox={`0 0 ${data.W} ${data.H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${gid}a`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={data.H}>
              <stop offset="0" stopColor={WIN} stopOpacity=".32" /><stop offset=".5" stopColor={WIN} stopOpacity="0" />
              <stop offset=".5" stopColor={LOSE} stopOpacity="0" /><stop offset="1" stopColor={LOSE} stopOpacity=".32" />
            </linearGradient>
            <linearGradient id={`${gid}l`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={data.H}>
              <stop offset="0" stopColor={WIN} /><stop offset=".5" stopColor="#C6CDD4" /><stop offset="1" stopColor={LOSE} />
            </linearGradient>
          </defs>
          <line x1="0" y1={data.mid} x2={data.W} y2={data.mid} stroke="rgba(255,255,255,.14)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          {len > 12 && <line x1={12 * data.step} y1="0" x2={12 * data.step} y2={data.H} stroke="rgba(255,255,255,.12)" vectorEffect="non-scaling-stroke" />}
          {len > 24 && <line x1={24 * data.step} y1="0" x2={24 * data.step} y2={data.H} stroke="rgba(255,209,102,.4)" vectorEffect="non-scaling-stroke" />}
          <path className="rvArea" d={`${data.path} L${data.W},${data.mid} L0,${data.mid} Z`} fill={`url(#${gid}a)`} />
          <path className="rvLine" d={data.path} pathLength="1" fill="none" stroke={`url(#${gid}l)`} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {data.pts.slice(1).map((p, i) => (
          <i key={i} className="rvDot" style={{ left: `${(p[0] / data.W) * 100}%`, top: p[1], background: seq[i] === 'W' ? WIN : LOSE, animationDelay: `${0.2 + ((i + 1) / len) * 2.2}s` }} />
        ))}
        {data.events.map(([r, t]) => (
          <span key={`${r}${t}`} className={`rvEv${r === len ? ' end' : ''}`} style={{ left: `${(data.pts[r][0] / data.W) * 100}%`, top: data.pts[r][1] - 10, animationDelay: `${0.2 + (r / len) * 2.2}s` }}>{t}</span>
        ))}
        <span className="rvAxis t" style={{ color: WIN }}>▲ {wName} 팀</span>
        <span className="rvAxis b" style={{ color: LOSE }}>▼ {lName} 팀</span>
        {len > 12 && <span className="rvHalf" style={{ left: `${(12 / len) * 100}%` }}>HALF</span>}
      </div>
      <div className="rvFacts">
        <div><span>전반</span><b><em style={{ color: WIN }}>{data.h1[0]}</em> : <em style={{ color: LOSE }}>{data.h1[1]}</em></b></div>
        {len > 12 && <div><span>후반</span><b><em style={{ color: WIN }}>{data.h2[0]}</em> : <em style={{ color: LOSE }}>{data.h2[1]}</em></b></div>}
        {data.ot && <div><span>연장</span><b><em style={{ color: WIN }}>{data.ot[0]}</em> : <em style={{ color: LOSE }}>{data.ot[1]}</em></b></div>}
        <div><span>역전</span><b>{data.flips}번</b></div>
        <div><span>최대 점수 차</span><b><em style={{ color: WIN }}>+{data.bestW}</em> / <em style={{ color: LOSE }}>+{data.bestL}</em></b></div>
        <div><span>최다 연속 라운드</span><b><em style={{ color: WIN }}>{data.streak.W}</em> / <em style={{ color: LOSE }}>{data.streak.L}</em></b></div>
      </div>
    </div>
  );
}
