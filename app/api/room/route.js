import { getJSON, setJSON, hasKV } from '../../../lib/store';
import { isAdmin } from '../../../lib/admin';
import { mergeScores } from '../../../lib/scores';
import { ALL_MAPS, ROTATION } from '../../../lib/constants';

export const dynamic = 'force-dynamic';

// No TTL: this is one persistent shared room (DEFAULT_ROOM_CODE), not a
// one-off session, so it should stick around like roster/records/seasonstats
// rather than silently wiping itself after 12h.

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return Response.json({ error: 'code required' }, { status: 400 });
  try {
    const room = await getJSON(`room:${code}`);
    return Response.json({ room, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), room: null }, { status: 502 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.code || !body?.room) return Response.json({ error: 'code and room required' }, { status: 400 });

  const key = `room:${body.code}`;
  let prev;
  try {
    prev = await getJSON(key);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }

  // last-write-wins with a monotonic version guard so stale pollers can't clobber
  // each other — except `force` (used by "방 초기화"): that reset always starts
  // from version 0 locally, which would otherwise be rejected as stale against
  // whatever the room's real version has climbed to.
  if (!body.force && prev && typeof prev.version === 'number' && typeof body.room.version === 'number' && body.room.version < prev.version) {
    return Response.json({ room: prev, rejected: true });
  }

  // A push from before a "방 초기화" (older createdAt) must not land: its
  // captains/bp would be merged against the freshly-cleared room below and
  // resurrect the seats that were just reset. Bounce it; the client adopts
  // the new session from the response.
  if (!body.force && prev?.createdAt && body.room.createdAt !== prev.createdAt) {
    return Response.json({ room: prev, rejected: true });
  }

  // Whole-blob last-write-wins is fine for most fields (one clear owner at a
  // time), but `captains` breaks that assumption: both captains routinely
  // claim their seat within the same few seconds, each pushing their OWN
  // stale copy of the other team's (still-empty) slot. Without this, whichever
  // write happens to land second would silently null the first captain's
  // just-claimed seat back out — the "주장 참가 눌렀는데 다시 눌러야 함"
  // flicker. Merging per-slot against `prev` means a write that doesn't yet
  // know about the other side's claim can't erase it. `force` (방 초기화)
  // bypasses this since it's a deliberate, authoritative clear of both.
  //
  // That protection would just as happily protect a *deliberate* "참가 취소"
  // from ever landing, though — a released seat is a null that looks
  // identical to "I don't know about this slot yet". `releaseCaptain` names
  // the one slot this specific push means to null out on purpose, so that
  // slot skips the merge instead of getting protected back to its old value.
  const captains = (!body.force && prev?.captains && body.room.captains)
    ? {
        A: body.releaseCaptain === 'A' ? null : (body.room.captains.A || prev.captains.A || null),
        B: body.releaseCaptain === 'B' ? null : (body.room.captains.B || prev.captains.B || null)
      }
    : body.room.captains;

  // Same class of problem for `bp`: the captain who just clicked "밴픽 시작"
  // isn't the only one pushing — the *other* captain's browser keeps pushing
  // its own still-null `bp` on its own 3s interval until it happens to learn
  // banpick started. If that stale push's version check ever slips through
  // (or simply races the accepting write), it would silently null out the
  // in-progress banpick the other captain already sees — the "밴픽 시작
  // 눌러도 한쪽만 넘어간다" bug: the clicking side stays (its own local
  // state never reverted), the other side's `bp` keeps getting reset back
  // to null server-side before it ever gets a chance to sync forward.
  // Only protects the null-vs-real-object transition, not deeper merging of
  // an actual in-progress bp — normal turn-by-turn banpick pushes always
  // carry a real object once started, so this never gets in the way of play.
  // Also never let a push that's *behind* the stored bp (same session, fewer
  // steps done — e.g. another client that hasn't seen the latest ban yet)
  // roll the banpick back.
  const prog = (x) => x.index * 2 + (x.pending ? 0 : 1);
  const bpBehind = !body.force && prev?.bp && body.room.bp && prev.bp.seed === body.room.bp.seed && prog(body.room.bp) < prog(prev.bp);
  const bp = (!body.force && prev?.bp && (body.room.bp == null || bpBehind)) ? prev.bp : body.room.bp;

  // Fine-grained pool editing (adding/removing individual maps) is
  // admin-only — anyone else's push that tries a custom change just keeps
  // the stored one. But swapping the whole match's map source between the
  // two presets ("전체 맵" / "맵풀") is allowed for everyone, since that's
  // choosing *which set to play from*, not editing what's in either set.
  const samePool = (x, y) => JSON.stringify([...(x || [])].sort()) === JSON.stringify([...(y || [])].sort());
  const isPreset = (arr) => samePool(arr, ALL_MAPS) || samePool(arr, ROTATION);
  const pool = (prev?.pool && body.room.pool && !samePool(prev.pool, body.room.pool) && !isAdmin(request) && !isPreset(body.room.pool))
    ? prev.pool
    : body.room.pool;

  // Scores merge per map (newest edit wins) instead of blob-level last-write-wins.
  const scores = (!body.force && prev?.scores && body.room.scores) ? mergeScores(prev.scores, body.room.scores) : body.room.scores;

  const room = { ...body.room, captains, bp, pool, scores, version: (prev?.version ?? 0) + 1, updatedAt: Date.now() };
  try {
    await setJSON(key, room);
    return Response.json({ room, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
