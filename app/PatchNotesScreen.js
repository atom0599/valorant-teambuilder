'use client';
import { PATCH_NOTES } from '../lib/patchnotes';

const KIND = {
  new: ['신규', '#C8F24C', 'rgba(200,242,76,.12)'],
  up: ['개선', '#4C9AFF', 'rgba(76,154,255,.12)'],
  fix: ['수정', '#FF4B57', 'rgba(255,75,87,.12)']
};

export default function PatchNotesScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid #262C34', borderRadius: 22, padding: '30px 28px 24px', background: 'radial-gradient(1200px 300px at 12% 0%, #1B2430 0%, #14181D 62%)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.028) 0 12px,rgba(0,0,0,0) 12px 26px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.14em', color: '#C8F24C', marginBottom: 10 }}>PATCH NOTES</div>
          <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(34px,7vw,56px)', lineHeight: 1, letterSpacing: '-.02em', animation: 'revealMask .7s cubic-bezier(.2,.7,.3,1) both' }}>패치내역</div>
          <div style={{ fontSize: 13, color: '#A8B0B9', marginTop: 10, maxWidth: 520 }}>행복방 발로란트 플랫폼의 업데이트 기록입니다. 최신 패치가 맨 위에 있습니다.</div>
        </div>
      </div>

      {PATCH_NOTES.map((p, i) => (
        <div key={p.date} style={{ background: 'rgba(20,24,29,.86)', border: `1px solid ${i === 0 ? 'rgba(200,242,76,.32)' : '#262C34'}`, borderRadius: 18, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }}>{p.date.replace(/-/g, '.')}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#F2F4F6' }}>{p.title}</span>
            {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#0B0D10', background: '#C8F24C', borderRadius: 999, padding: '2px 8px' }}>최신</span>}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.items.map(([kind, text], j) => {
              const [label, color, bg] = KIND[kind];
              return (
                <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#C8D0D8', lineHeight: 1.5 }}>
                  <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${color}55`, borderRadius: 6, padding: '1px 7px', marginTop: 2 }}>{label}</span>
                  <span style={{ minWidth: 0 }}>{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
