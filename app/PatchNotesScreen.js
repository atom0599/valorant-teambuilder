'use client';
import { useState } from 'react';
import { PATCH_NOTES } from '../lib/patchnotes';

const KIND = {
  new: ['신규', '#C8F24C', 'rgba(200,242,76,.12)'],
  up: ['개선', '#4C9AFF', 'rgba(76,154,255,.12)'],
  fix: ['수정', '#FF4B57', 'rgba(255,75,87,.12)']
};
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

const card = { background: 'rgba(20,24,29,.86)', border: '1px solid #262C34', borderRadius: 18 };

export default function PatchNotesScreen() {
  const [openDate, setOpenDate] = useState(null);
  const open = PATCH_NOTES.find((p) => p.date === openDate);

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
          {PATCH_NOTES.map((p, i) => (
            <button
              key={p.date}
              onClick={() => setOpenDate(p.date)}
              style={{ ...card, border: `1px solid ${i === 0 ? 'rgba(200,242,76,.32)' : '#262C34'}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', width: '100%' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#F2F4F6' }}>{patchTitle(p.date)}</span>
                  {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#0B0D10', background: '#C8F24C', borderRadius: 999, padding: '2px 8px' }}>최신</span>}
                </div>
                <div style={{ fontSize: 13, color: '#8B949E', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summary}</div>
              </div>
              <span style={{ flex: 'none', fontSize: 12, color: '#8B949E' }}>{p.items.length}건</span>
              <span style={{ flex: 'none', fontSize: 18, color: '#5F6872' }}>›</span>
            </button>
          ))}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {open.items.map((it, j) => (
              <div key={j} style={{ background: 'rgba(27,32,39,.6)', border: '1px solid #262C34', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <KindTag kind={it.kind} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#F2F4F6' }}>{it.title}</span>
                </div>
                <div style={{ fontSize: 14, color: '#B8C0C8', lineHeight: 1.65, marginTop: 8 }}>{it.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
