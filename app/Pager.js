'use client';

// Numbered page buttons (‹ 1 2 3 ›). `page` is 0-based; renders nothing
// when everything fits on one page.
export default function Pager({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  // First, last, and two either side of the current page; null marks a gap.
  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  const btn = (active, disabled) => ({
    minWidth: 34, height: 34, padding: '0 10px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    background: active ? '#FF4B57' : '#1B2027', color: active ? '#fff' : disabled ? '#4A525C' : '#C8D0D8',
    border: `1px solid ${active ? '#FF4B57' : '#333B45'}`, cursor: disabled || active ? 'default' : 'pointer'
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={() => onChange(page - 1)} disabled={page === 0} style={btn(false, page === 0)} aria-label="이전 페이지">‹</button>
      {pages.map((i, k) => i === null
        ? <span key={`gap${k}`} style={{ alignSelf: 'center', color: '#5F6872', fontSize: 13 }}>…</span>
        : <button key={i} onClick={() => onChange(i)} style={btn(i === page, false)} aria-current={i === page ? 'page' : undefined}>{i + 1}</button>)}
      <button onClick={() => onChange(page + 1)} disabled={page === pageCount - 1} style={btn(false, page === pageCount - 1)} aria-label="다음 페이지">›</button>
    </div>
  );
}
