'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../lib/constants';

// 클립 게시판: paste a clip link (YouTube etc.), then like/comment. No
// accounts — a nickname pinned to a random per-browser id (see /api/clips
// for what it's used for).

function getLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
function setLocal(key, v) { try { localStorage.setItem(key, v); } catch {} }

function clientId() {
  let cid = getLocal('clipCid');
  if (!cid || !/^[A-Za-z0-9-]{16,64}$/.test(cid)) {
    cid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setLocal('clipCid', cid);
  }
  return cid;
}

function youtubeId(u) {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host === 'youtube.com') return u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1] || null;
  return null;
}

// How to show a pasted link: an embeddable player where the site allows it,
// a <video> for direct files, otherwise just an outbound link. `thumb` is a
// preview image for the grid, when the site has a predictable one.
function embedFor(url, autoplay) {
  let u;
  try { u = new URL(url); } catch { return { type: 'link' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const yt = youtubeId(u);
  if (yt) return { type: 'iframe', src: `https://www.youtube.com/embed/${yt}${autoplay ? '?autoplay=1' : ''}`, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  if (host === 'streamable.com') {
    const id = u.pathname.replace(/^\/(e\/)?/, '').split('/')[0];
    if (id) return { type: 'iframe', src: `https://streamable.com/e/${id}${autoplay ? '?autoplay=1' : ''}` };
  }
  if (host === 'clips.twitch.tv' || (host === 'twitch.tv' && u.pathname.includes('/clip/'))) {
    const slug = host === 'clips.twitch.tv' ? u.pathname.slice(1).split('/')[0] : u.pathname.split('/clip/')[1]?.split('/')[0];
    if (slug) return { type: 'iframe', src: `https://clips.twitch.tv/embed?clip=${slug}&parent=${window.location.hostname}&autoplay=${autoplay ? 'true' : 'false'}` };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'video', src: url };
  return { type: 'link' };
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\.|^m\./, ''); } catch { return ''; } };

function Player({ clip }) {
  const frame = { width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 12, background: '#0B0D10', display: 'block' };
  const e = embedFor(clip.url, true);
  if (e.type === 'video') return <video src={e.src} controls autoPlay playsInline style={frame} />;
  if (e.type === 'iframe') return <iframe src={e.src} title={clip.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen style={frame} />;
  return (
    <a href={clip.url} target="_blank" rel="noopener noreferrer" style={{ ...frame, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#C8D0D8', textDecoration: 'none', border: '1px dashed #2C333C' }}>
      <span style={{ fontSize: 30 }}>▶</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{hostOf(clip.url) || '링크'}에서 보기 ↗</span>
    </a>
  );
}

// Grid tile: a static preview only (no iframe), so a long list stays light.
function Thumb({ clip }) {
  const e = embedFor(clip.url, false);
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#2A1B22,#14181D)' }}>
      {e.thumb
        ? <img src={e.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: 8, fontFamily: "'IBM Plex Mono'", fontSize: 10, color: '#8B949E' }}>{hostOf(clip.url)}</div>}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(11,13,16,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>▶</span>
      </div>
    </div>
  );
}

const PAGE = 12;

export default function ClipsScreen({ isAdmin, adminHeaders, input, pill }) {
  const [clips, setClips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // myName: this browser's nickname as pinned by the server (null until its
  // first post/comment). Before that, `nick` is what's typed in the box.
  const [myName, setMyName] = useState(null);
  const [nick, setNick] = useState('');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState('');
  const [sort, setSort] = useState('new');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState('');
  const cidRef = useRef(null);

  function applyData(d) {
    if (Array.isArray(d.clips)) setClips(d.clips);
    if (d.myName) setMyName(d.myName);
  }

  useEffect(() => {
    cidRef.current = clientId();
    setNick(getLocal('clipNick') || '');
    let alive = true;
    const pull = () => fetch(`/api/clips?cid=${encodeURIComponent(cidRef.current)}`).then((r) => r.json())
      .then((d) => { if (alive) { applyData(d); if (Array.isArray(d.clips)) setLoaded(true); } }).catch(() => {});
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const author = myName || nick.trim();

  function changeNick(v) { setNick(v); setLocal('clipNick', v); }

  async function act(payload) {
    const res = await fetch('/api/clips', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ cid: cidRef.current, ...payload })
    });
    const d = await res.json().catch(() => ({}));
    applyData(d);
    return { ok: res.ok, ...d };
  }

  function confirmFirstName() {
    return !!myName || window.confirm(`닉네임을 "${author}"(으)로 정할까요?\n한 번 정하면 이 브라우저에서는 바꿀 수 없어요.`);
  }

  async function submit() {
    if (posting) return;
    const t = title.trim(), url = link.trim();
    if (!author) return setMsg('닉네임을 먼저 적어주세요.');
    if (!t) return setMsg('제목을 적어주세요.');
    if (!/^https?:\/\/\S+$/i.test(url)) return setMsg('http(s)로 시작하는 링크를 넣어주세요.');
    if (!confirmFirstName()) return;
    setMsg('');
    setPosting(true);
    try {
      const d = await act({ action: 'create', title: t, author, url });
      if (!d.ok) throw new Error(d.error);
      setTitle(''); setLink('');
      setMsg('올렸어요!');
    } catch (e) {
      setMsg(`올리지 못했어요 (${e.message || e}). 다시 시도해주세요.`);
    } finally {
      setPosting(false);
    }
  }

  async function sendComment(id) {
    const text = draft.trim();
    if (!text) return;
    if (!author) return window.alert('위쪽 닉네임 칸에 닉네임을 먼저 적어주세요.');
    if (!confirmFirstName()) return;
    const d = await act({ action: 'comment', id, author, text });
    if (d.ok) setDraft('');
  }

  function removeClip(c) {
    if (!window.confirm(`"${c.title}" 클립을 삭제할까요?`)) return;
    act({ action: 'delete', id: c.id });
    setOpenId(null);
  }

  // Server keeps clips newest-first.
  const list = sort === 'top' ? [...clips].sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt)
    : sort === 'old' ? [...clips].reverse()
    : clips;
  const open = openId ? clips.find((c) => c.id === openId) : null;
  const card = { background: '#14181D', border: '1px solid #2C333C', borderRadius: 18, padding: 16 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid #262C34', borderRadius: 22, padding: '30px 28px 24px', background: 'radial-gradient(1200px 300px at 12% 0%, #2A1B22 0%, #14181D 62%)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.028) 0 12px,rgba(0,0,0,0) 12px 26px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.14em', color: '#FF4B57', marginBottom: 10 }}>HIGHLIGHTS</div>
          <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(34px,7vw,56px)', lineHeight: 1, letterSpacing: '-.02em' }}>클립</div>
          <div style={{ fontSize: 13, color: '#A8B0B9', marginTop: 10, maxWidth: 520 }}>내전 하이라이트를 올리고 좋아요와 댓글을 남겨보세요. 유튜브·스트리머블·트위치 링크는 여기서 바로 재생되고, 다른 링크(메달 등)는 해당 사이트로 연결돼요.</div>
        </div>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {myName
            ? <div title="이 브라우저의 닉네임은 고정돼 있어요" style={{ ...input, flex: '0 1 160px', width: 'auto', color: '#C8F24C', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🔒 {myName}</div>
            : <input value={nick} onChange={(e) => changeNick(e.target.value.slice(0, 20))} placeholder="닉네임 (처음 한 번만)" style={{ ...input, flex: '0 1 160px', width: 'auto' }} />}
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="제목 (예: 바인드 1대4 클러치)" style={{ ...input, flex: '1 1 240px', width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} placeholder="클립 링크 (https://youtu.be/...)" style={{ ...input, flex: '1 1 260px', width: 'auto' }} />
          <button onClick={submit} disabled={posting} style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: posting ? 'default' : 'pointer', opacity: posting ? .6 : 1, flex: 'none' }}>
            {posting ? '올리는 중…' : '올리기'}
          </button>
        </div>
        {!!msg && <div style={{ fontSize: 12, color: '#E5C04C' }}>{msg}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#8B949E' }}>클립 {clips.length}개</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['new', '최신순'], ['old', '오래된순'], ['top', '좋아요순']].map(([k, label]) => (
            <button key={k} onClick={() => { setSort(k); setShown(PAGE); }} style={pill(sort === k)}>{label}</button>
          ))}
        </div>
      </div>

      {loaded && !clips.length && <div style={{ ...card, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>아직 올라온 클립이 없어요. 첫 클립을 올려보세요!</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {list.slice(0, shown).map((c) => (
          <div key={c.id} data-lift="1" onClick={() => { setOpenId(c.id); setDraft(''); }} style={{ background: '#14181D', border: '1px solid #2C333C', borderRadius: 14, padding: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <Thumb clip={c} />
            <div style={{ padding: '0 4px 4px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{c.author} · {fmtDate(c.createdAt)}</span>
                <span style={{ flex: 'none' }}><span style={{ color: c.likedByMe ? '#FF4B57' : undefined }}>♥ {c.likeCount}</span> · 💬 {c.comments.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {list.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} style={{ alignSelf: 'center', background: '#1B2027', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 12, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          더 보기 ({list.length - shown}개 남음)
        </button>
      )}

      {open && (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(5,7,9,.78)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <Player key={open.id} clip={open} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, wordBreak: 'break-word' }}>{open.title}</div>
                <div style={{ fontSize: 12, color: '#8B949E', marginTop: 3 }}>{open.author} · {fmtDate(open.createdAt)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                {(open.mine || isAdmin) && <button onClick={() => removeClip(open)} style={{ background: 'transparent', border: '1px solid #333B45', color: '#8B949E', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>삭제</button>}
                <button onClick={() => setOpenId(null)} title="닫기 (Esc)" style={{ background: 'transparent', border: '1px solid #333B45', color: '#C8D0D8', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div>
              <button onClick={() => act({ action: 'like', id: open.id })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: open.likedByMe ? 'rgba(255,75,87,.14)' : 'transparent', border: `1px solid ${open.likedByMe ? 'rgba(255,75,87,.5)' : '#333B45'}`, color: open.likedByMe ? '#FF4B57' : '#C8D0D8', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {open.likedByMe ? '♥' : '♡'} {open.likeCount}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #262C34', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: '#8B949E' }}>댓글 {open.comments.length}</div>
              {open.comments.map((cm) => (
                <div key={cm.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}>
                    <span style={{ fontWeight: 700, marginRight: 6 }}>{cm.author}</span>
                    <span style={{ color: '#C8D0D8' }}>{cm.text}</span>
                    <span style={{ fontSize: 11, color: '#5F6872', marginLeft: 6 }}>{fmtDate(cm.at)}</span>
                  </div>
                  {(cm.mine || isAdmin) && <button onClick={() => act({ action: 'uncomment', id: open.id, commentId: cm.id })} title="댓글 삭제" style={{ background: 'transparent', border: 'none', color: '#5F6872', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</button>}
                </div>
              ))}
              {!open.comments.length && <div style={{ fontSize: 12, color: '#5F6872' }}>첫 댓글을 남겨보세요.</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 300))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendComment(open.id); }}
                  placeholder={author ? `${author}(으)로 댓글 달기` : '닉네임을 먼저 적어주세요'} style={{ ...input, flex: 1, width: 'auto' }} />
                <button onClick={() => sendComment(open.id)} style={{ background: '#252C34', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 9, padding: '8px 14px', fontSize: 12, cursor: 'pointer', flex: 'none' }}>등록</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
