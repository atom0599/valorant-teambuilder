'use client';
import { useState } from 'react';
import { PATCH_NOTES } from '../lib/patchnotes';
import Pager from './Pager';

const KIND = {
  new: ['신규', '#C8F24C', 'rgba(200,242,76,.12)'],
  up: ['개선', '#4C9AFF', 'rgba(76,154,255,.12)'],
  fix: ['수정', '#FF4B57', 'rgba(255,75,87,.12)']
};
// 상세 화면에서 이 순서로 묶어 보여 준다.
const KIND_ORDER = ['new', 'up', 'fix'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// '2026-10-07' → '10월 7일 (수) 패치내역'
function patchTitle(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}) 패치내역`;
}

function KindTag({ kind }) {
  const [label, color, bg] = KIND[kind];
  return <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${color}55`, borderRadius: 6, padding: '1px 7px' }}>{label}</span>;
}

// 패치내역 목록 한 페이지에 보이는 날짜 수.
const PAGE_SIZE = 5;

const card = { background: 'rgba(20,24,29,.86)', border: '1px solid #262C34', borderRadius: 18 };

export default function PatchNotesScreen() {
  const [openDate, setOpenDate] = useState(null);
  const [page, setPage] = useState(0);
  // 상세 화면에서 펼친 항목. 키는 'kind:index'.
  const [expanded, setExpanded] = useState(() => new Set());
  const open = PATCH_NOTES.find((p) => p.date === openDate);
  const pageCount = Math.ceil(PATCH_NOTES.length / PAGE_SIZE);
  const shown = PATCH_NOTES.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid #262C34', borderRadius: 22, padding: '30px 28px 24px', background: 'radial-gradient(1200px 300px at 12% 0%, #1B2430 0%, #14181D 62%)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.028) 0 12px,rgba(0,0,0,0) 12px 26px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.14em', color: '#C8F24C', marginBottom: 10 }}>PATCH NOTES</div>
          <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(34px,7vw,56px)', lineHeight: 1, letterSpacing: '-.02em', animation: 'revealMask .7s cubic-bezier(.2,.7,.3,1) both' }}>패치내역</div>
          <div style={{ fontSize: 13, color: '#A8B0B9', marginTop: 10, maxWidth: 520 }}>행복방 발로란트 플랫폼의 업데이트 기록입니다. 제목을 누르면 자세한 내용을 볼 수 있습니다.</div>
        </div>
      </div>

      {!open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((p, k) => { const i = page * PAGE_SIZE + k; return (
            <button
              key={p.date}
              onClick={() => { setOpenDate(p.date); setExpanded(new Set()); }}
              style={{ ...card, border: `1px solid ${i === 0 ? 'rgba(200,242,76,.32)' : '#262C34'}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', width: '100%' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#F2F4F6' }}>{patchTitle(p.date)}</span>
                  {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#0B0D10', background: '#C8F24C', borderRadius: 999, padding: '2px 8px' }}>최신</span>}
                </div>
                <div style={{ fontSize: 13, color: '#8B949E', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summary}</div>
              </div>
              <span style={{ flex: 'none', display: 'flex', gap: 5 }}>
                {KIND_ORDER.map((kind) => {
                  const n = p.items.filter((it) => it.kind === kind).length;
                  if (!n) return null;
                  const [label, color] = KIND[kind];
                  return <span key={kind} style={{ fontSize: 11, color }}>{label} {n}</span>;
                })}
              </span>
              <span style={{ flex: 'none', fontSize: 18, color: '#5F6872' }}>›</span>
            </button>
          ); })}
          <div style={{ marginTop: 6 }}><Pager page={page} pageCount={pageCount} onChange={setPage} /></div>
        </div>
      )}

      {open && (
        <div style={{ ...card, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp .35s cubic-bezier(.2,.7,.3,1) both' }}>
          <div>
            <button onClick={() => setOpenDate(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '6px 13px', fontSize: 12, color: '#A8B0B9', cursor: 'pointer' }}>‹ 목록으로</button>
          </div>
          <div>
            <div style={{ fontSize: 'clamp(20px,4vw,26px)', fontWeight: 800, color: '#F2F4F6' }}>{patchTitle(open.date)}</div>
            <div style={{ fontSize: 13, color: '#8B949E', marginTop: 6 }}>{open.summary}</div>
          </div>
          {(() => {
            const groups = KIND_ORDER.map((kind) => [kind, open.items.filter((it) => it.kind === kind)]).filter(([, items]) => items.length);
            const allKeys = groups.flatMap(([kind, items]) => items.map((_, j) => `${kind}:${j}`));
            const allOpen = allKeys.every((key) => expanded.has(key));
            const toggle = (key) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {groups.map(([kind, items]) => <span key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8B949E' }}><KindTag kind={kind} />{items.length}건</span>)}
                  </div>
                  <button onClick={() => setExpanded(allOpen ? new Set() : new Set(allKeys))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: '#A8B0B9', cursor: 'pointer' }}>{allOpen ? '모두 접기' : '모두 펼치기'}</button>
                </div>
                {groups.map(([kind, items]) => {
                  const [label, color] = KIND[kind];
                  return (
                    <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color, paddingBottom: 6, borderBottom: `1px solid ${color}33` }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        {label}
                        <span style={{ fontWeight: 500, color: '#6B737C' }}>{items.length}</span>
                      </div>
                      {items.map((it, j) => {
                        const key = `${kind}:${j}`;
                        const isOpen = expanded.has(key);
                        return (
                          <div key={key} style={{ background: 'rgba(27,32,39,.6)', border: `1px solid ${isOpen ? color + '44' : '#262C34'}`, borderRadius: 12 }}>
                            <button onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#F2F4F6' }}>{it.title}</span>
                              <span style={{ flex: 'none', fontSize: 14, color: '#5F6872', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
                            </button>
                            {isOpen && <div style={{ fontSize: 13.5, color: '#B8C0C8', lineHeight: 1.7, padding: '0 14px 14px' }}>{it.desc}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
