import { randomUUID } from 'crypto';
import { getJSON, setJSON, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

// Clip board: external clip links (YouTube etc.), each with likes and
// comments. There are no accounts —
// names are free-text nicknames — so each browser carries a random client id
// (`cid`, kept in localStorage). It decides "one like per browser" and lets
// whoever posted a clip/comment delete it again. cids are never sent back to
// clients, only derived booleans (likedByMe / mine), so one browser can't
// pick up another's cid from the API.
const KEY = 'clips:all';
const MAX_CLIPS = 300;
const MAX_COMMENTS = 200;

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const validCid = (cid) => typeof cid === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(cid);

function view(clip, cid) {
  return {
    id: clip.id, title: clip.title, author: clip.author, url: clip.url, createdAt: clip.createdAt,
    likeCount: clip.likes.length,
    likedByMe: !!cid && clip.likes.includes(cid),
    mine: !!cid && clip.ownerCid === cid,
    comments: clip.comments.map((c) => ({ id: c.id, author: c.author, text: c.text, at: c.at, mine: !!cid && c.cid === cid }))
  };
}

const respond = (all, cid, extra) => Response.json({ clips: all.map((c) => view(c, cid)), persistent: hasKV, ...extra }, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const cid = new URL(request.url).searchParams.get('cid');
  try {
    return respond((await getJSON(KEY)) || [], validCid(cid) ? cid : null);
  } catch (e) {
    return Response.json({ error: String(e), clips: [] }, { status: 502 });
  }
}

// body: { action, cid, ... }
//   create:    { title, author, url }
//   like:      { id }                       — toggles this browser's like
//   comment:   { id, author, text }
//   uncomment: { id, commentId }            — own comment, or admin
//   delete:    { id }                       — own clip, or admin
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const cid = body?.cid;
  if (!validCid(cid)) return Response.json({ error: 'cid required' }, { status: 400 });
  const admin = isAdmin(request);

  try {
    const all = (await getJSON(KEY)) || [];
    const clip = body.id ? all.find((c) => c.id === body.id) : null;
    if (body.action !== 'create' && !clip) return Response.json({ error: 'clip not found' }, { status: 404 });

    switch (body.action) {
      case 'create': {
        const title = clean(body.title, 80);
        const author = clean(body.author, 20);
        if (!title || !author) return Response.json({ error: 'title and author required' }, { status: 400 });
        const url = String(body.url || '').trim().slice(0, 500);
        if (!/^https?:\/\/\S+$/i.test(url)) return Response.json({ error: 'bad url' }, { status: 400 });
        all.unshift({ id: randomUUID(), title, author, url, ownerCid: cid, createdAt: Date.now(), likes: [], comments: [] });
        all.splice(MAX_CLIPS); // oldest clips fall off past the cap
        await setJSON(KEY, all);
        break;
      }
      case 'like': {
        const i = clip.likes.indexOf(cid);
        if (i >= 0) clip.likes.splice(i, 1); else clip.likes.push(cid);
        await setJSON(KEY, all);
        break;
      }
      case 'comment': {
        const author = clean(body.author, 20);
        const text = String(body.text ?? '').trim().slice(0, 300);
        if (!author || !text) return Response.json({ error: 'author and text required' }, { status: 400 });
        if (clip.comments.length >= MAX_COMMENTS) return Response.json({ error: 'too many comments' }, { status: 400 });
        clip.comments.push({ id: randomUUID(), author, text, at: Date.now(), cid });
        await setJSON(KEY, all);
        break;
      }
      case 'uncomment': {
        const c = clip.comments.find((x) => x.id === body.commentId);
        if (!c) return Response.json({ error: 'comment not found' }, { status: 404 });
        if (c.cid !== cid && !admin) return Response.json({ error: 'forbidden' }, { status: 403 });
        clip.comments = clip.comments.filter((x) => x !== c);
        await setJSON(KEY, all);
        break;
      }
      case 'delete': {
        if (clip.ownerCid !== cid && !admin) return Response.json({ error: 'forbidden' }, { status: 403 });
        await setJSON(KEY, all.filter((c) => c !== clip));
        return respond(all.filter((c) => c !== clip), cid);
      }
      default:
        return Response.json({ error: 'bad action' }, { status: 400 });
    }
    return respond(all, cid);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
