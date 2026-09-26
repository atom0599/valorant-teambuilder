'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../lib/constants';

// 클립 게시판: paste a clip link (YouTube etc.), then like/comment. No
// accounts — a free-text nickname plus a random per-browser id (see
// /api/clips for what it's used for).

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

// How to show a pasted link: an embeddable player where the site allows it,
// a <video> for direct files, otherwise just an outbound link.
function embedFor(url) {
  let u;
  try { u = new URL(url); } catch { return { type: 'link' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return { type: 'iframe', src: `https://www.youtube.com/embed/${u.pathname.slice(1).split('/')[0]}` };
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1];
    if (id) return { type: 'iframe', src: `https://www.youtube.com/embed/${id}` };
  }
  if (host === 'streamable.com') {
    const id = u.pathname.replace(/^\/(e\/)?/, '').split('/')[0];
    if (id) return { type: 'iframe', src: `https://streamable.com/e/${id}` };
  }
  if (host === 'clips.twitch.tv' || (host === 'twitch.tv' && u.pathname.includes('/clip/'))) {
    const slug = host === 'clips.twitch.tv' ? u.pathname.slice(1).split('/')[0] : u.pathname.split('/clip/')[1]?.split('/')[0];
    if (slug) return { type: 'iframe', src: `https://clips.twitch.tv/embed?clip=${slug}&parent=${window.location.hostname}` };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'video', src: url };
  return { type: 'link' };
}

function Player({ clip }) {
  const frame = { width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 12, background: '#0B0D10', display: 'block' };
  const e = embedFor(clip.url);
  if (e.type === 'video') return <video src={e.src} controls preload="metadata" playsInline style={frame} />;
  if (e.type === 'iframe') return <iframe src={e.src} title={clip.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" style={frame} />;
  let host = '';
  try { host = new URL(clip.url).hostname.replace(/^www\./, ''); } catch {}
  return (
    <a href={clip.url} target="_blank" rel="noopener noreferrer" style={{ ...frame, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#C8D0D8', textDecoration: 'none', border: '1px dashed #2C333C' }}>
      <span style={{ fontSize: 30 }}>▶</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{host || '링크'}에서 보기 ↗</span>
    </a>
  );
}

export default function ClipsScreen({ isAdmin, adminHeaders, input, pill }) {
  const [clips, setClips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [nick, setNick] = useState('');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState('');
  const [sort, setSort] = useState('new');
  const [openComments, setOpenComments] = useState({});
  const [drafts, setDrafts] = useState({});
  const cidRef = useRef(null);

  useEffect(() => {
    cidRef.current = clientId();
    setNick(getLocal('clipNick') || '');
    let alive = true;
    const pull = () => fetch(`/api/clips?cid=${encodeURIComponent(cidRef.current)}`).then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d.clips)) { setClips(d.clips); setLoaded(true); } }).catch(() => {});
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  function changeNick(v) { setNick(v); setLocal('clipNick', v); }

  async function act(payload) {
    const res = await fetch('/api/clips', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ cid: cidRef.current, ...payload })
    });
    const d = await res.json().catch(() => ({}));
    if (Array.isArray(d.clips)) setClips(d.clips);
    return { ok: res.ok, ...d };
  }

  async function submit() {
    if (posting) return;
    const author = nick.trim(), t = title.trim(), url = link.trim();
    if (!author) return setMsg('닉네임을 먼저 적어주세요.');
    if (!t) return setMsg('제목을 적어주세요.');
    if (!/^https?:\/\/\S+$/i.test(url)) return setMsg('http(s)로 시작하는 링크를 넣어주세요.');
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
    const text = (drafts[id] || '').trim();
    if (!text) return;
    if (!nick.trim()) return setMsg('닉네임을 먼저 적어주세요.');
    const d = await act({ action: 'comment', id, author: nick.trim(), text });
    if (d.ok) setDrafts((s) => ({ ...s, [id]: '' }));
  }

  function removeClip(c) {
    if (!window.confirm(`"${c.title}" 클립을 삭제할까요?`)) return;
    act({ action: 'delete', id: c.id });
  }

  // Server keeps clips newest-first.
  const list = sort === 'top' ? [...clips].sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt)
    : sort === 'old' ? [...clips].reverse()
    : clips;
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
          <input value={nick} onChange={(e) => changeNick(e.target.value.slice(0, 20))} placeholder="닉네임" style={{ ...input, flex: '0 1 160px', width: 'auto' }} />
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#8B949E' }}>클립 {clips.length}개</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setSort('new')} style={pill(sort === 'new')}>최신순</button>
          <button onClick={() => setSort('old')} style={pill(sort === 'old')}>오래된순</button>
          <button onClick={() => setSort('top')} style={pill(sort === 'top')}>좋아요순</button>
        </div>
      </div>

      {loaded && !clips.length && <div style={{ ...card, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>아직 올라온 클립이 없어요. 첫 클립을 올려보세요!</div>}

      {list.map((c) => {
        const open = !!openComments[c.id];
        return (
          <div key={c.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Player clip={c} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, wordBreak: 'break-word' }}>{c.title}</div>
                <div style={{ fontSize: 12, color: '#8B949E', marginTop: 3 }}>{c.author} · {fmtDate(c.createdAt)}</div>
              </div>
              {(c.mine || isAdmin) && <button onClick={() => removeClip(c)} style={{ background: 'transparent', border: '1px solid #333B45', color: '#8B949E', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', flex: 'none' }}>삭제</button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => act({ action: 'like', id: c.id })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: c.likedByMe ? 'rgba(255,75,87,.14)' : 'transparent', border: `1px solid ${c.likedByMe ? 'rgba(255,75,87,.5)' : '#333B45'}`, color: c.likedByMe ? '#FF4B57' : '#C8D0D8', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {c.likedByMe ? '♥' : '♡'} {c.likeCount}
              </button>
              <button onClick={() => setOpenComments((s) => ({ ...s, [c.id]: !open }))} style={{ background: open ? '#1B2027' : 'transparent', border: '1px solid #333B45', color: '#C8D0D8', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                💬 {c.comments.length}
              </button>
            </div>
            {open && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #262C34', paddingTop: 12 }}>
                {c.comments.map((cm) => (
                  <div key={cm.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}>
                      <span style={{ fontWeight: 700, marginRight: 6 }}>{cm.author}</span>
                      <span style={{ color: '#C8D0D8' }}>{cm.text}</span>
                      <span style={{ fontSize: 11, color: '#5F6872', marginLeft: 6 }}>{fmtDate(cm.at)}</span>
                    </div>
                    {(cm.mine || isAdmin) && <button onClick={() => act({ action: 'uncomment', id: c.id, commentId: cm.id })} title="댓글 삭제" style={{ background: 'transparent', border: 'none', color: '#5F6872', fontSize: 12, cursor: 'pointer', flex: 'none' }}>✕</button>}
                  </div>
                ))}
                {!c.comments.length && <div style={{ fontSize: 12, color: '#5F6872' }}>첫 댓글을 남겨보세요.</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={drafts[c.id] || ''} onChange={(e) => setDrafts((s) => ({ ...s, [c.id]: e.target.value.slice(0, 300) }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendComment(c.id); }}
                    placeholder={nick.trim() ? `${nick.trim()}(으)로 댓글 달기` : '닉네임을 먼저 적어주세요'} style={{ ...input, flex: 1, width: 'auto' }} />
                  <button onClick={() => sendComment(c.id)} style={{ background: '#252C34', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 9, padding: '8px 14px', fontSize: 12, cursor: 'pointer', flex: 'none' }}>등록</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
