'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeScores } from '../lib/scores';
import ClipsScreen from './ClipsScreen';
import {
  POSITIONS, TIERS, ALL_MAPS, ROTATION, MAP_IMG, BG_SEQ,
  hashStr, fmtDate, tierPill, seqFor
} from '../lib/constants';

const NAV = [
  ['home', '홈'], ['players', '인원'], ['balance', '밸런싱'],
  ['setup', '매치 설정'], ['banpick', '밴픽'], ['stats', '전체 전적'], ['clips', '클립']
];
// Everyone who opens the app without a `?room=` override lands in this same
// shared room — no link-sharing or random-code mismatch between friends.
const DEFAULT_ROOM_CODE = 'MAIN';
const emptyPlayers = () => Array.from({ length: 10 }, () => ({ name: '', pos: '미정', tier: null, source: null, loading: false, realName: '', groupId: null }));
const GROUP_COLORS = ['#FF4B57', '#4C9AFF', '#C8F24C', '#E0A64C', '#B478FF'];
// This season's tier index for a looked-up player slot, or null if they
// haven't placed this season. `tier` on a slot is the peak index (kept for
// "lookup done" checks); this is what the UI shows.
function seasonTierIdx(p) {
  const idx = p.currentTier ? TIERS.findIndex((t) => t.label === p.currentTier) : -1;
  return idx >= 0 ? idx : null;
}

// Groups only make sense with 2+ members — dropping to 1 (someone left, or a
// re-group moved them elsewhere) leaves a lone tag with nothing to keep them
// together with, so clear it automatically instead of leaving dead state around.
function cleanupGroups(arr) {
  const counts = {};
  arr.forEach((p) => { if (p.groupId) counts[p.groupId] = (counts[p.groupId] || 0) + 1; });
  return arr.map((p) => (p.groupId && counts[p.groupId] < 2 ? { ...p, groupId: null } : p));
}
const teamName = (k) => (k === 'A' ? '팀 A' : '팀 B');

export default function Page() {
  const [screen, setScreen] = useState('home');
  const [playersTab, setPlayersTab] = useState('register');
  const [groupPick, setGroupPick] = useState([]);
  const [splash, setSplash] = useState(true);
  const [roomCode, setRoomCode] = useState('');
  const [createdAt, setCreatedAt] = useState(() => Date.now());

  const [players, setPlayers] = useState(emptyPlayers);
  const [usePosition, setUsePosition] = useState(true);
  const [teams, setTeams] = useState(null);
  const [sel, setSel] = useState(null);

  const [series, setSeries] = useState('BO3');
  const [pool, setPool] = useState(ROTATION);
  const [poolPickerOpen, setPoolPickerOpen] = useState(false);
  const [captains, setCaptains] = useState({ A: null, B: null });
  const [myRole, setMyRole] = useState(null);
  // Which captain tokens THIS browser actually issued (persisted to
  // localStorage per room) — the only thing that lets us tell "I'm the one
  // who claimed team A" apart from "someone else claimed it and I'm just
  // looking at the shared room state", so a captain seat can't be stolen by
  // another tab/person once it's taken.
  const [myCaptainTokens, setMyCaptainTokens] = useState({ A: null, B: null });
  const [bp, setBp] = useState(null);
  // Map a captain has tapped but not yet confirmed — clicking a tile only
  // stages it; the actual ban/pick only commits once they hit 확인. Without
  // this, a single tap both selected AND committed, so a misclick (or a
  // click landing right as sync caught the tile up to date) instantly locked
  // in the wrong map with no way to back out.
  const [selectedMap, setSelectedMap] = useState(null);
  const [deciderAnimating, setDeciderAnimating] = useState(false);
  const [deciderDisplay, setDeciderDisplay] = useState('');
  const seenDeciderRef = useRef(null);
  const [scores, setScores] = useState({});

  const [roster, setRoster] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRealName, setNewMemberRealName] = useState('');
  const [altPick, setAltPick] = useState({}); // roster name -> which of their accounts to register with next

  const [records, setRecords] = useState({});
  // Riot IDs an admin hid from the 선수별 leaderboard (see /api/records PUT).
  const [excludedIds, setExcludedIds] = useState([]);
  const [statQuery, setStatQuery] = useState('');
  const [statId, setStatId] = useState(null);
  const [statSort, setStatSort] = useState('rate');
  const [statView, setStatView] = useState('player');
  const [matchSort, setMatchSort] = useState('newest');
  const [expandedMatch, setExpandedMatch] = useState(null);

  const [apiSource, setApiSource] = useState(null);
  const [remoteOk, setRemoteOk] = useState(null);
  const [confirmNewRoom, setConfirmNewRoom] = useState(false);
  const confirmNewRoomTimer = useRef(null);
  const [resetNotice, setResetNotice] = useState(false);
  const resetNoticeTimer = useRef(null);
  const resetGuardTimer = useRef(null);
  const version = useRef(0);
  const pushChainRef = useRef(Promise.resolve());
  // True while a local teams change (balance / swap / clear) hasn't been
  // accepted by the server yet. Every client pushes every ~1s and each push
  // bumps the server version, so a pull or rejected push landing right after
  // balancing would otherwise overwrite the fresh teams with the server's old
  // (null) ones — the "teams appear then vanish" bug.
  const teamsDirtyRef = useRef(false);
  // Same race for "밴픽 시작": the clicker's fresh bp lives only locally until
  // a push lands, and a pull / rejected push carrying the server's still-null
  // bp would revert it — leaving the clicker on the banpick screen with no bp
  // and the other captain never receiving one.
  const bpStartDirtyRef = useRef(false);
  // Scores and map pool get the same treatment: typing a round score (or an
  // admin editing the pool) exists only locally until a push lands, and a
  // pull/rejected push carrying the server's old copy would wipe it — the
  // "typed digits disappear" bug.
  const poolDirtyRef = useRef(false);
  function setPoolLocal(f) { poolDirtyRef.current = true; setPool(f); }

  // Admin session. The token is verified server-side on every protected
  // request (map pool changes, record deletion); this state only drives UI.
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const adminTokenRef = useRef(null);
  const adminHeaders = () => (adminTokenRef.current ? { 'x-admin-token': adminTokenRef.current } : {});
  function setTeamsLocal(t) { teamsDirtyRef.current = true; setTeams(t); }
  // Set right before a deliberate "참가 취소" so the *next* outgoing push
  // tells the server this null is intentional — otherwise the server's
  // per-slot captains merge (protecting a join from a concurrent stale
  // overwrite, see app/api/room/route.js) would just as happily protect a
  // cancel from ever taking effect, since a null looks the same either way.
  const releaseCaptainRef = useRef(null);
  // Same trick for teams: the server's null-vs-real protection (see
  // app/api/room/route.js) would just as happily protect "참가자 입력란
  // 비우기" from ever landing, since a deliberate clear is a null that
  // looks identical to "I don't know about the balance yet". This flag
  // names that one push as the intentional exception.
  const clearTeamsRef = useRef(false);

  const [seasonStats, setSeasonStats] = useState({});
  const [seasonStatsLoading, setSeasonStatsLoading] = useState(false);
  // Riot ID -> { tier (TIERS index | null), tierIcon, at } — this season's
  // tier, shared via /api/seasonstats. 전체전적 shows this instead of the tier
  // snapshot stored on match records.
  const [currentTiers, setCurrentTiers] = useState({});
  const tierRefreshTriedRef = useRef(new Set());
  const lookupQueueRef = useRef(Promise.resolve());
  const rebalanceRankRef = useRef(0);
  // Snapshot of `players` as of the last time this client's copy actually
  // matched the server's (a just-applied remote fetch, or a push it just got
  // accepted) — lets mergePlayers tell "I made a real local edit here that
  // hasn't landed yet" apart from "I simply haven't heard about someone
  // else's change to this slot yet". Starts null so, before the very first
  // sync, every slot is (safely) treated as an unconfirmed local edit.
  const lastSyncedPlayersRef = useRef(null);

  const bgA = useRef(null);
  const bgB = useRef(null);
  const bgIdx = useRef(0);
  const swapping = useRef(false);

  /* ---------- boot ---------- */
  // Fetches the real current state from the server on load instead of
  // trusting a cached localStorage copy. The cache used to be applied first
  // (for instant paint) and reconciled afterward, but if that local copy was
  // ever bad — a stale merge, a leftover duplicate — every refresh just
  // reloaded and re-pushed the same bad snapshot, so a refresh could never
  // actually fix anything. A fresh GET has no such memory.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('room') || DEFAULT_ROOM_CODE;
    setRoomCode(code);
    if (!url.searchParams.get('room')) {
      url.searchParams.set('room', code);
      window.history.replaceState({}, '', url);
    }
    fetch(`/api/room?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => { if (d?.room) applyRoom(d.room); })
      .catch(() => {});
    const t = setTimeout(() => setSplash(false), 1750);
    return () => clearTimeout(t);
  }, []);

  // Restore which captain seat(s) this browser owns for this room, so a
  // refresh doesn't make it look like a stranger trying to steal an
  // already-claimed seat.
  useEffect(() => {
    if (!roomCode) return;
    try {
      const raw = localStorage.getItem(`captainTokens:${roomCode}`);
      if (raw) setMyCaptainTokens(JSON.parse(raw));
    } catch {}
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    try { localStorage.setItem(`captainTokens:${roomCode}`, JSON.stringify(myCaptainTokens)); } catch {}
  }, [roomCode, myCaptainTokens]);

  // applyRoom (below) is called from long-lived effect closures (the push
  // loop, the periodic pull) that were only set up once per roomCode, so a
  // plain reference to `myCaptainTokens` inside it would be frozen at
  // whatever that state was when the effect first ran — always the initial
  // {A:null,B:null}. Routing through a ref keeps it current.
  const myCaptainTokensRef = useRef(myCaptainTokens);
  useEffect(() => { myCaptainTokensRef.current = myCaptainTokens; }, [myCaptainTokens]);
  const lastSeenCreatedAtRef = useRef(null);
  // Set by resetRoom() to the fresh createdAt it just reset to, locking out
  // applyRoom (see below) until either that exact reset is confirmed back
  // from the server or the fallback timeout clears it.
  const pendingResetRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      fetch('/api/roster').then((r) => r.json()).then((d) => { if (alive && Array.isArray(d.roster)) setRoster(d.roster); }).catch(() => {});
      fetch('/api/records').then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d.records) setRecords(d.records);
        if (Array.isArray(d.excluded)) setExcludedIds(d.excluded);
      }).catch(() => {});
      fetch('/api/seasonstats').then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d.stats) setSeasonStats(d.stats);
        if (d.tiers) setCurrentTiers((cur) => {
          // Keep a locally-fetched entry if it's newer than what the server has
          // (its POST may still be in flight).
          const next = { ...d.tiers };
          Object.entries(cur).forEach(([id, v]) => { if (!next[id] || (v.at || 0) > (next[id].at || 0)) next[id] = v; });
          return next;
        });
      }).catch(() => {});
    };
    pull();
    const t = setInterval(pull, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  /* ---------- background crossfade ---------- */
  function nextBg(forced) {
    const raw = forced ? BG_SEQ.indexOf(forced) : (bgIdx.current + 1) % BG_SEQ.length;
    const i = raw < 0 ? 0 : raw;
    const src = MAP_IMG[BG_SEQ[i]] || '/maps/ascent.png';
    const A = bgA.current, B = bgB.current;
    if (!A || !B || swapping.current) return;
    if (A.getAttribute('src') === src) { bgIdx.current = i; return; }
    bgIdx.current = i;
    swapping.current = true;
    B.src = src;
    const go = () => requestAnimationFrame(() => { B.style.opacity = '1'; });
    if (B.complete) go(); else B.onload = go;
    setTimeout(() => {
      A.src = src;
      B.style.transition = 'none';
      B.style.opacity = '0';
      requestAnimationFrame(() => { B.style.transition = 'opacity 1.6s ease'; });
      swapping.current = false;
    }, 1900);
  }

  useEffect(() => {
    const t = setInterval(() => nextBg(), 8000);
    return () => clearInterval(t);
  }, []);

  /* ---------- room sync (polling) ---------- */
  const roomState = useMemo(() => ({
    code: roomCode, createdAt, players, usePosition, teams, series, pool, captains, bp, scores
  }), [roomCode, createdAt, players, usePosition, teams, series, pool, captains, bp, scores]);

  // Room sync is last-write-wins on the whole blob: every client pushes its
  // full local state every ~1s, and a stale push just gets overwritten by
  // whoever's version is newest. That's fine for teams/bp/captains (low
  // churn, one clear owner at a time), but tier lookups can now take several
  // seconds (HenrikDev throttling + retries), so another client's routine
  // 3s push can slip in and win the race — a blind overwrite would silently
  // erase the tier/role/stats you just fetched. Merge `players` by slot
  // instead: whichever side actually has that slot's data (tier != null)
  // wins, so neither your own in-progress lookup nor someone else's gets
  // thrown away just because of push timing.
  function mergePlayers(localPlayers, remotePlayers) {
    if (!Array.isArray(remotePlayers)) return localPlayers;
    if (!Array.isArray(localPlayers)) return remotePlayers;
    // A length mismatch means the two arrays aren't even index-aligned (e.g.
    // one side picked up or dropped an entry some other way) — per-slot
    // merging would compare the wrong people against each other and scramble
    // everyone's data. Safer to trust the server's array wholesale here.
    if (localPlayers.length !== remotePlayers.length) return remotePlayers;
    const baseline = lastSyncedPlayersRef.current;
    return localPlayers.map((lp, i) => {
      const rp = remotePlayers[i];
      if (!rp) return lp;
      // If this slot hasn't actually changed locally since the last time we
      // were confirmed in sync with the server, there's nothing of ours to
      // protect — adopt the remote value outright. This is what lets someone
      // else's registration/tier lookup on another computer actually show up
      // here on the next ~1s poll, instead of a slot we never touched being
      // mistaken for "a deliberate local edit" just because it differs from
      // whatever the server now has.
      const base = Array.isArray(baseline) ? baseline[i] : null;
      if (base && JSON.stringify(base) === JSON.stringify(lp)) return rp;
      const localName = lp?.name?.trim() || '';
      const remoteName = rp?.name?.trim() || '';
      // This slot DOES have an unconfirmed local edit — pickMember,
      // unpickMember, or the × remove button (인원 관리 registers/unregisters
      // from the roster; there's no free-typing this name) — so a local name
      // that differs from remote's is the newer truth, whether that's a
      // fresh pick still awaiting its tier lookup or a deliberate clear back
      // to empty. Otherwise a slower remote push still holding the old
      // occupant would win the merge and silently undo the swap/removal.
      if (localName !== remoteName) return lp;
      // Same occupant on both sides: whichever side actually finished that
      // person's tier lookup wins, so neither your own in-progress lookup nor
      // another client's already-finished one gets thrown away by push timing.
      const localDone = lp.tier != null;
      const remoteDone = rp.tier != null;
      if (localDone || !remoteDone) return lp;
      return rp;
    });
  }

  // Is the remote banpick strictly further along than ours? (same session:
  // more steps done; a newer session started elsewhere: bigger seed.)
  // Version numbers can't tell us this — our own accepted push already bumps
  // version.current to the server's latest without carrying its bp over, so a
  // client can sit one step behind while every version check says "in sync".
  function bpIsAhead(remote, local) {
    if (!remote) return false;
    if (!local) return true;
    if (remote.seed !== local.seed) return (remote.seed || 0) > (local.seed || 0);
    const prog = (x) => x.index * 2 + (x.pending ? 0 : 1);
    return prog(remote) > prog(local);
  }

  // resetRoom() zeroes version.current locally the instant it's clicked,
  // before its own force-push has actually landed on the server. Any GET
  // poll (or push response) that resolves in that window still sees the
  // server's *old* (pre-reset) room, whose real version number is now —
  // purely because we just zeroed ours — bigger than version.current, so a
  // plain version/progress check would treat genuinely stale data as
  // "newer" and reapply the very bp/teams/captains resetRoom just cleared
  // (the "방 초기화 눌렀는데 밴픽 현황이 그대로" bug). Shared by applyRoom
  // AND the two bp-only fast paths below (the accepted-push reconciliation,
  // and pullRoom's "not strictly newer but bp looks ahead" branch) — those
  // read room data straight off the network too and bypass applyRoom
  // entirely, so they need the same guard, not just applyRoom's callers.
  // Ignores anything whose createdAt doesn't match the reset we're waiting
  // to see confirmed; once one does match, the reset has landed and this
  // clears itself so normal processing resumes. resetRoom also clears it
  // once its own push resolves, with a timeout fallback either way.
  function isStaleBeforePendingReset(createdAt) {
    if (pendingResetRef.current == null) return false;
    if (createdAt === pendingResetRef.current) { pendingResetRef.current = null; return false; }
    return true;
  }

  function applyRoom(d) {
    if (isStaleBeforePendingReset(d.createdAt)) return;
    // Whatever players array we're about to render IS what we're adopting as
    // truth (freshly fetched, or already merged against our own pending
    // edits) — record it as the new "last known in sync" baseline so the
    // next mergePlayers call only protects edits made after this point.
    if (d.players) { setPlayers(d.players); lastSyncedPlayersRef.current = d.players; }
    if (typeof d.usePosition === 'boolean') setUsePosition(d.usePosition);
    if (!teamsDirtyRef.current) setTeams(d.teams ?? null);
    if (d.series) setSeries(d.series);
    if (d.pool && !poolDirtyRef.current) setPool(d.pool);

    // `createdAt` changes only on "방 초기화" — use it to tell "the room I
    // already know about just got a new update" apart from "a different
    // match session started", since a locally-remembered captain claim
    // should survive the former but not outlive the latter.
    const roomReset = d.createdAt != null && lastSeenCreatedAtRef.current != null && d.createdAt !== lastSeenCreatedAtRef.current;
    if (d.createdAt != null) lastSeenCreatedAtRef.current = d.createdAt;
    if (roomReset) {
      setMyCaptainTokens({ A: null, B: null });
      setMyRole(null);
      try { localStorage.removeItem(`captainTokens:${roomCode}`); } catch {}
    }

    if (d.captains) {
      // A push we made claiming a captain seat can get rejected by a
      // same-instant push from the other captain (whole-room last-write-wins
      // — see app/api/room/route.js). If the truth we just received still
      // shows OUR already-claimed seat as empty, reassert it instead of
      // silently dropping it: this state change re-enters the room-state
      // push effect below and retries on its own, so "주장 참가" doesn't
      // need a second click. Never overrides a seat the truth shows as
      // genuinely held (by us or someone else).
      const mine = myCaptainTokensRef.current;
      setCaptains(roomReset ? d.captains : {
        A: d.captains.A || mine.A || null,
        B: d.captains.B || mine.B || null
      });
    }
    if (d.bp) bpStartDirtyRef.current = false;
    // A click (ban/pick/side) only exists locally until its push lands, so a
    // pull or rejected push carrying the server's one-step-older bp would
    // revert it — the "banned, but it asks me to ban again" bug. Progress only
    // moves forward within a session (same seed), so never adopt a remote bp
    // that's behind ours; our next push re-sends ours with the fresh version.
    const bpProgress = (x) => x.index * 2 + (x.pending ? 0 : 1);
    const localBp = roomStateRef.current?.bp;
    const remoteBehind = d.bp && localBp && d.bp.seed === localBp.seed && bpProgress(d.bp) < bpProgress(localBp);
    if (!remoteBehind && (d.bp || !bpStartDirtyRef.current)) setBp(d.bp ?? null);
    if (d.scores) setScores((cur) => (roomReset ? d.scores : mergeScores(cur, d.scores)));
    // Used to be gated on `local` (only the initial boot fetch) so a react
    // state React re-render wouldn't flash the old date if a stale response
    // landed right after a fresh reset. But createdAt also feeds every
    // outgoing push (via roomState) — leaving the *state* stale while
    // lastSeenCreatedAtRef (above) tracked the real value meant a client
    // that hadn't resynced its createdAt state kept re-pushing the old one
    // every ~1s, which the version guard doesn't reject (equal version
    // passes), silently reverting the server's createdAt back and forth and
    // making every client re-detect a "reset" over and over. Always syncing
    // it is the only way the pushed value can't drift from the truth.
    if (d.createdAt) setCreatedAt(d.createdAt);
    if (typeof d.version === 'number') version.current = d.version;
  }

  // Keep the latest roomState in a ref so a queued push can always send the
  // freshest snapshot at the moment it actually runs, not whatever was
  // current when it was queued.
  const roomStateRef = useRef(roomState);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);

  // `alive` used to be a local `let` inside this effect, torn down and
  // recreated every time `roomState` changed (i.e. on every banpick click).
  // If a push was still in flight — awaiting the server's response — right
  // when that happened, the OLD `alive` flipped false out from under it, so
  // its response got silently discarded (including the version bump the
  // server had already committed). The NEXT push then went out holding a
  // now-stale `version.current`, got rejected by the server as behind, and
  // that rejection's `applyRoom` reverted the just-made click back to the
  // pre-click state — the "pick it, it flickers, do it again" bug. Keeping
  // `alive` in a ref that only dies on unmount (not on every state change)
  // means an in-flight push's response always gets applied.
  const pushAliveRef = useRef(true);
  const pushFnRef = useRef(() => {});
  useEffect(() => {
    if (!roomCode) return;
    pushAliveRef.current = true;
    const push = () => {
      // Grab-and-clear so this one-shot hint rides only the very next push,
      // not every push afterward.
      const releaseCaptain = releaseCaptainRef.current;
      releaseCaptainRef.current = null;
      const clearTeams = clearTeamsRef.current;
      clearTeamsRef.current = false;
      pushChainRef.current = pushChainRef.current.then(async () => {
        if (!pushAliveRef.current) return;
        const sentTeams = roomStateRef.current.teams;
        const sentBp = roomStateRef.current.bp;
        const sentPool = roomStateRef.current.pool;
        try {
          // `loading` is a purely local, in-flight UI flag — never persist it.
          // If a client's tab dies or hits an uncaught error mid-lookup, a
          // stuck `loading: true` pushed to the server would otherwise haunt
          // every other client (and the same client on reload) forever,
          // since nothing would ever be left to flip it back off.
          const roomToSend = { ...roomStateRef.current, version: version.current };
          if (Array.isArray(roomToSend.players)) roomToSend.players = roomToSend.players.map((p) => ({ ...p, loading: false }));
          const res = await fetch('/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify({ code: roomCode, room: roomToSend, releaseCaptain, clearTeams })
          });
          const d = await res.json();
          if (!pushAliveRef.current) return;
          setRemoteOk(!!d.persistent);
          if (d.room) {
            version.current = d.room.version;
            if (d.rejected) {
              applyRoom({ ...d.room, players: mergePlayers(roomStateRef.current.players, d.room.players) });
            } else {
              // Accepted as sent: the server now holds exactly `roomToSend.players`
              // (loading stripped), so that's the new baseline mergePlayers should
              // treat as "in sync" — same choke point applyRoom uses, just without
              // a setPlayers call since nothing here actually changed locally.
              if (Array.isArray(roomToSend.players)) lastSyncedPlayersRef.current = roomToSend.players;
              if (roomStateRef.current.teams === sentTeams) teamsDirtyRef.current = false;
              if (sentBp) bpStartDirtyRef.current = false;
              if (d.room.scores) setScores((cur) => mergeScores(cur, d.room.scores));
              if (roomStateRef.current.pool === sentPool) {
                poolDirtyRef.current = false;
                // The server may have refused a non-admin pool change; adopt its truth.
                if (d.room.pool && JSON.stringify(d.room.pool) !== JSON.stringify(sentPool)) setPool(d.room.pool);
              }
              // Even an *accepted* push's stored result can differ from what
              // we sent — the server protects an in-progress `bp` and a
              // claimed captain seat from a stale/uninformed overwrite (see
              // app/api/room/route.js). Reconcile just those two fields so
              // our own local view can't silently drift from what actually
              // got saved. Guarded by "only fill in what's currently null
              // locally" (`??`) so this can't stomp a newer local click made
              // while this request was in flight — it only ever fills a gap
              // we already know is empty, never overrides one that isn't.
              const mine = myCaptainTokensRef.current;
              const localNow = roomStateRef.current;
              const stale = isStaleBeforePendingReset(d.room.createdAt);
              if (!stale && d.room.captains) {
                setCaptains((c) => ({
                  A: localNow.captains?.A ?? (d.room.captains.A || mine.A || null),
                  B: localNow.captains?.B ?? (d.room.captains.B || mine.B || null)
                }));
              }
              if (!stale && bpIsAhead(d.room.bp, localNow.bp)) setBp(d.room.bp);
            }
          }
        } catch { if (pushAliveRef.current) setRemoteOk(false); }
      });
    };
    pushFnRef.current = push;
    const t = setInterval(push, 1000);
    push();
    return () => { pushAliveRef.current = false; clearInterval(t); };
  }, [roomCode]);

  // Fire an out-of-band push the moment local state actually changes (e.g. a
  // banpick click), on top of the regular 1s interval above — without
  // recreating that interval/alive machinery, since pushFnRef always calls
  // through to the current, still-alive push().
  // Debounced rather than immediate: typing a round score is several
  // keystrokes in a row, and each one changes roomState — without this,
  // every single keystroke fired its own full /api/room POST. 300ms is
  // short enough that a banpick click (a single, deliberate state change)
  // still reaches the server almost immediately, but a burst of keystrokes
  // collapses into one push after the user pauses.
  const pushDebounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(pushDebounceRef.current);
    pushDebounceRef.current = setTimeout(() => pushFnRef.current(), 300);
    return () => clearTimeout(pushDebounceRef.current);
  }, [roomState]);

  // Besides pushing, also periodically GET the room so a client that hasn't
  // changed anything locally (so has no reason to push) still notices
  // someone *else's* change — e.g. the other captain starting banpick, or
  // choosing a decider side — within one polling tick instead of waiting on
  // this client's own next push to get rejected. Only ever adopts a version
  // strictly newer than what we already have, so it can never stomp a local
  // change that hasn't been pushed/accepted yet.
  useEffect(() => {
    if (!roomCode) return;
    let alive = true;
    const pullRoom = () => {
      fetch(`/api/room?code=${encodeURIComponent(roomCode)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d?.room) return;
          if (typeof d.room.version === 'number' && d.room.version > version.current) {
            applyRoom({ ...d.room, players: mergePlayers(roomStateRef.current.players, d.room.players) });
          } else if (!isStaleBeforePendingReset(d.room.createdAt) && bpIsAhead(d.room.bp, roomStateRef.current.bp)) {
            setBp(d.room.bp);
          }
        })
        .catch(() => {});
    };
    const t2 = setInterval(pullRoom, 1000);
    return () => { alive = false; clearInterval(t2); };
  }, [roomCode]);

  // "방 초기화" — everyone shares the same fixed room code (DEFAULT_ROOM_CODE),
  // so there's no separate room to move to: this just wipes the shared match
  // state (wrong map pool, botched setup, etc.) and force-pushes the clean
  // slate. Everyone else on the same code picks it up on their next ~1s poll
  // automatically — no redirect needed since nobody's room code changes.
  // Roster and season-stats cache are untouched (stored independently of any
  // room, not "this room's" mistake to undo).
  // Only resets match-setup state (series/map pool/captains/banpick progress/
  // scores) — participants stay registered, since re-entering them is the
  // annoying part and "참가자 입력란 비우기" in 인원 관리 already covers wiping
  // the roster if that's ever actually wanted.
  function resetRoom() {
    const fresh = {
      code: roomCode, createdAt: Date.now(), players, usePosition,
      teams: null, series: 'BO3', pool: isAdmin ? ROTATION : pool,
      captains: { A: null, B: null }, bp: null, scores: {}
    };
    version.current = 0;
    // Locks out applyRoom (mount fetch / pullRoom / rejected-push) from
    // reapplying stale pre-reset data until the force-push below actually
    // lands — see the guard at the top of applyRoom for why that's needed.
    pendingResetRef.current = fresh.createdAt;
    clearTimeout(resetGuardTimer.current);
    resetGuardTimer.current = setTimeout(() => { pendingResetRef.current = null; }, 5000);
    setTeamsLocal(fresh.teams);
    setSel(null);
    setSeries(fresh.series);
    setPoolLocal(fresh.pool);
    setCaptains(fresh.captains);
    setMyRole(null);
    setMyCaptainTokens({ A: null, B: null });
    try { localStorage.removeItem(`captainTokens:${roomCode}`); } catch {}
    bpStartDirtyRef.current = false;
    setBp(fresh.bp);
    setDeciderAnimating(false);
    setDeciderDisplay('');
    seenDeciderRef.current = null;
    setScores(fresh.scores);
    setCreatedAt(fresh.createdAt);
    setScreen('home');
    setResetNotice(true);
    clearTimeout(resetNoticeTimer.current);
    resetNoticeTimer.current = setTimeout(() => setResetNotice(false), 3500);
    // Jump the queue instead of appending to pushChainRef: during an active
    // banpick, that chain can easily have several regular/debounced pushes
    // already backed up (each awaiting its own round trip), and appending
    // would make the force-push wait behind all of them — "방 초기화 눌러도
    // 한참 그대로" while it sits in line. Starting a fresh chain from here
    // fires it essentially immediately. The old chain's stragglers still run
    // and resolve on their own; whatever stale (pre-reset) data they bring
    // back is exactly what pendingResetRef (set above) exists to ignore, so
    // abandoning them here doesn't reopen the race the queue was originally
    // there to prevent — it's just no longer this push's problem to wait on.
    pushChainRef.current = Promise.resolve().then(async () => {
      try {
        const res = await fetch('/api/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({ code: roomCode, room: { ...fresh, version: 0 }, force: true })
        });
        const d = await res.json().catch(() => null);
        if (d?.room) version.current = d.room.version;
        clearTimeout(resetGuardTimer.current);
        pendingResetRef.current = null;
      } catch {}
    }).catch(() => {});
  }

  // Slot-machine-style reveal for the decider map: bp.deciderRoll (synced —
  // every client computes the same final map deterministically, see
  // advance()) carries the candidate list and the already-known answer. Each
  // client independently cycles through the candidates and lands on that
  // same answer, purely as a local animation — nobody needs to "own" the
  // roll or race to broadcast it first.
  // Depending on `bp?.deciderRoll` directly is wrong: that's a fresh object
  // every time bp is replaced (every ~1s poll tick, or any other unrelated
  // bp update), so React's dependency check treats it as "changed" on every
  // re-render even when the actual roll is identical. That reruns the effect
  // — tearing down the in-flight timer chain via cleanup — before all the
  // ticks finish, so `setDeciderAnimating(false)` (which only runs at the last tick)
  // never fires and the "데사이더 맵 추첨 중" state gets stuck forever on
  // whichever client's animation happened to lose that race. Depending on a
  // derived string instead means the effect only re-runs when the roll's
  // actual content changes, not merely its object identity.
  const deciderRollKey = bp?.deciderRoll ? `${bp.deciderRoll.chosen}:${bp.deciderRoll.candidates.join(',')}` : null;
  useEffect(() => {
    if (!deciderRollKey || seenDeciderRef.current === deciderRollKey) return;
    seenDeciderRef.current = deciderRollKey;

    setDeciderAnimating(true);
    const { candidates, chosen } = bp.deciderRoll;
    // Slot-machine deceleration instead of a flat tick rate: fast flicker at
    // the start, easing (cubic ease-out) into longer and longer pauses right
    // before landing, so it reads as "spinning down" rather than just
    // stopping abruptly. ~20 ticks between 60ms and 250ms apart averages out
    // to roughly twice the old flat-18-ticks-at-110ms (~2s) total spin time.
    const totalTicks = 20;
    const minDelay = 60;
    const maxDelay = 250;
    let tick = 0;
    let timer;
    const scheduleNext = () => {
      tick++;
      setDeciderDisplay(candidates[Math.floor(Math.random() * candidates.length)]);
      if (tick >= totalTicks) {
        setDeciderDisplay(chosen);
        timer = setTimeout(() => setDeciderAnimating(false), 700);
        return;
      }
      const eased = 1 - Math.pow(1 - tick / totalTicks, 3);
      timer = setTimeout(scheduleNext, minDelay + (maxDelay - minDelay) * eased);
    };
    timer = setTimeout(scheduleNext, minDelay);
    return () => clearTimeout(timer);
  }, [deciderRollKey]);

  // Auto-navigate both captains to the banpick screen the moment banpick
  // starts, instead of only the client that clicked "밴픽 시작하기" — the
  // other captain's `screen` is purely local state, so without this they'd
  // stay on whatever tab they were on until they noticed and clicked over
  // manually. Guarded by a ref (not just `bp`) so it fires once per banpick
  // session rather than on every ban/pick update, and resets when bp clears
  // (방 초기화) so the next banpick can trigger it again.
  const bpAutoNavRef = useRef(false);
  useEffect(() => {
    if (bp && !bpAutoNavRef.current && (myRole === 'A' || myRole === 'B')) {
      bpAutoNavRef.current = true;
      setScreen('banpick');
    } else if (!bp) {
      bpAutoNavRef.current = false;
    }
  }, [bp, myRole]);

  // Drop any staged-but-unconfirmed map selection the moment the shared
  // banpick state moves on for any other reason (opponent acted, a remote
  // sync caught this client up, the round advanced) — otherwise the confirm
  // bar could linger over a step that no longer applies.
  useEffect(() => { setSelectedMap(null); }, [bp?.index, bp?.pending]);

  /* ---------- tier + role lookup ---------- */
  // `nameOverride` lets callers that just wrote a name into state (pickMember,
  // fillFromRoster) pass it directly instead of reading players[i] from a
  // closure that may still reflect the pre-write render (setTimeout(…, 0)
  // does not guarantee the state update has flushed and been re-captured).
  //
  // All lookups funnel through lookupQueueRef so they run one player at a
  // time (rank+role+auto-stats can be a dozen HenrikDev requests by itself).
  // Without this, registering several people at once (fillFromRoster,
  // lookupAll) fires that many requests concurrently and blows past
  // HenrikDev's per-minute rate limit almost immediately.
  function lookup(i, nameOverride, skipStats) {
    const fullName = nameOverride ?? players[i]?.name;
    if (!fullName?.trim()) return Promise.resolve();
    if (players[i]?.loading) return Promise.resolve();
    setPlayers((arr) => arr.map((x, k) => (k === i ? { ...x, loading: true } : x)));
    const task = lookupQueueRef.current
      .then(() => runLookup(i, fullName, skipStats))
      .catch(() => {
        // If runLookup throws (network blip, bad response shape, etc.) this
        // slot's `loading: true` set above would otherwise never get cleared
        // — and since lookup() now refuses to re-queue a slot that's already
        // loading, a single failure here would permanently wedge that player
        // at "조회중…" with no way to retry.
        setPlayers((arr) => arr.map((x, k) => (k === i ? { ...x, loading: false, source: 'error', rankError: 'network' } : x)));
      })
      .then(() => new Promise((r) => setTimeout(r, 200)));
    lookupQueueRef.current = task.catch(() => {});
    return task;
  }

  async function runLookup(i, fullNameArg, skipStats) {
    setPlayers((arr) => arr.map((x, k) => (k === i ? { ...x, loading: true } : x)));
    let fullName = fullNameArg;
    const [name, tag] = fullName.split('#');

    // Parse the body even on non-2xx — our API routes always return a JSON
    // {error} payload, and that's the only way to show *why* it failed
    // instead of silently making up a tier (see rankError below).
    let [rankData, roleData] = await Promise.all([
      fetch(`/api/rank?name=${encodeURIComponent(name || '')}&tag=${encodeURIComponent(tag || '')}`)
        .then((r) => r.json()).catch(() => null),
      fetch(`/api/role?name=${encodeURIComponent(name || '')}&tag=${encodeURIComponent(tag || '')}`)
        .then((r) => r.json()).catch(() => null)
    ]);

    // Riot ID rename recovery: the by-name lookup 404s the instant someone
    // renames (the old string just stops resolving to anyone), but their
    // puuid — cached on the roster entry from the last time this succeeded,
    // see rememberPuuid below — still resolves under HenrikDev's by-puuid
    // endpoint. A hit there with a *different* current name means they
    // renamed; auto-relink the roster (old name kept as a 부계정 so past
    // records stay attached) instead of just failing "계정을 찾을 수 없음"
    // forever.
    let renamedFrom = null;
    if (!rankData?.account) {
      const entry = roster.find((r) => r.name === fullName || (r.alts || []).includes(fullName));
      if (entry?.puuid) {
        const byPuuid = await fetch(`/api/rank?puuid=${encodeURIComponent(entry.puuid)}`).then((r) => r.json()).catch(() => null);
        if (byPuuid?.account && byPuuid.account.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
          rankData = byPuuid;
          renamedFrom = entry.name;
          fullName = byPuuid.account;
          const [n2, t2] = fullName.split('#');
          roleData = await fetch(`/api/role?name=${encodeURIComponent(n2 || '')}&tag=${encodeURIComponent(t2 || '')}`).then((r) => r.json()).catch(() => null);
        }
      }
    }
    if (renamedFrom) {
      relinkRosterName(renamedFrom, fullName);
      setPlayers((arr) => arr.map((x, k) => (k === i ? { ...x, name: fullName } : x)));
      window.alert(`"${renamedFrom}"의 Riot ID가 "${fullName}"로 바뀐 것을 감지해서 자동으로 연결했습니다.`);
    }

    let tier = null, source = null, rankError = null;
    const idx = rankData ? TIERS.findIndex((t) => t.label === (rankData.peakTier || rankData.currentTier)) : -1;
    if (idx >= 0) { tier = idx; source = 'api'; }
    else {
      source = 'error';
      rankError = rankData?.error === 'HENRIKDEV_API_KEY not set' ? 'key_missing'
        : rankData?.error?.includes('429') ? 'rate_limited'
        : rankData?.error?.includes('404') ? 'not_found'
        : rankData?.error ? 'api_error' : 'network';
    }
    setApiSource(source);
    if (rankData?.puuid) rememberPuuid(canonicalName(fullName), rankData.puuid);
    rememberCurrentTier(canonicalName(fullName), rankData);

    const currentTier = rankData?.currentTier || null;
    const currentTierIcon = rankData?.currentTierIcon || null;
    const peakTierIcon = rankData?.peakTierIcon || null;
    const inferredPos = roleData?.role || null;
    const agents = roleData?.topAgents || [];
    setPlayers((arr) => arr.map((x, k) => {
      if (k !== i) return x;
      const pos = inferredPos && x.pos === '미정' ? inferredPos : x.pos;
      return { ...x, tier, source, rankError, pos, agents, currentTier, currentTierIcon, peakTierIcon, loading: false };
    }));

    // Registering someone (fresh lookup, no cached stats yet) auto-loads their
    // season stats too — no need to separately hit "새로고침". A manual
    // re-lookup on an already-cached player won't re-fetch; use the refresh
    // button for that. Awaited so it stays inside this player's turn in the
    // lookup queue instead of racing the next player's requests.
    //
    // Skipped for bulk calls (전체 티어 조회/lookupAll): season stats alone can
    // be ~10 HenrikDev requests per player (see /api/stats pagination), so
    // bundling it into every player of a 10-person batch blew past the
    // per-minute rate limit even with the queue pacing everyone above.
    // Tier+role is only 2 requests/player — safe to batch. Use the "새로고침"
    // button in 인원 관리 to pull stats separately.
    if (!skipStats && !seasonStats[fullName]) await fetchOneSeasonStats(fullName);
  }

  function lookupAll() { players.forEach((p, i) => { if (p.name.trim()) lookup(i, undefined, true); }); }

  // Caches this season's tier from an /api/rank response. Only a successful
  // lookup counts — a failed one says nothing about their tier. No current
  // tier (unplaced this season) is stored as null → "언랭", deliberately NOT
  // falling back to the peak tier.
  function rememberCurrentTier(id, rankData) {
    if (!id || rankData?.source !== 'api') return;
    const idx = rankData.currentTier ? TIERS.findIndex((t) => t.label === rankData.currentTier) : -1;
    const entry = { tier: idx >= 0 ? idx : null, tierIcon: idx >= 0 ? rankData.currentTierIcon || null : null, at: Date.now() };
    setCurrentTiers((c) => ({ ...c, [id]: entry }));
    fetch('/api/seasonstats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tier: entry })
    }).catch(() => {});
    return entry;
  }

  /* ---------- season competitive stats (vlr.gg-style table) ---------- */
  async function fetchOneSeasonStats(full) {
    const [name, tag] = full.split('#');
    if (!name || !tag) return;
    try {
      const res = await fetch(`/api/stats?name=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
      const data = res.ok ? await res.json() : { matches: 0, error: `http_${res.status}` };
      setSeasonStats((s) => ({ ...s, [full]: data }));
      // Only persist real successes — a transient rate-limit/error blip
      // shouldn't overwrite good cached data that other clients rely on.
      if (data.matches) {
        fetch('/api/seasonstats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: full, data })
        }).catch(() => {});
      }
    } catch (e) {
      setSeasonStats((s) => ({ ...s, [full]: { matches: 0, error: String(e) } }));
    }
  }

  function fetchSeasonStats() {
    const names = roster.map((r) => r.name.trim()).filter(Boolean);
    if (!names.length || seasonStatsLoading) return;
    setSeasonStatsLoading(true);
    // Goes through the same lookupQueueRef as registration lookups so a
    // manual refresh never runs concurrently with an in-flight auto-fetch.
    const task = lookupQueueRef.current.then(async () => {
      for (const full of names) {
        await fetchOneSeasonStats(full);
        await new Promise((r) => setTimeout(r, 250)); // spread requests out, avoid HenrikDev rate limit
      }
    });
    lookupQueueRef.current = task.catch(() => {});
    task.finally(() => setSeasonStatsLoading(false));
  }

  /* ---------- balancing ---------- */
  // Skill score used purely for team assignment: current-season tier (falls
  // back to peak tier if they haven't placed this season) plus a K:D nudge,
  // judged *relative to their own tier* rather than a flat correction for
  // everyone. The same K:D deviation from 1.0 means more at a higher tier —
  // a tougher lobby, so out-fragging it is a stronger signal — than the
  // exact same K:D would at a lower one, so the nudge scales with tier
  // index (~1x at Iron up to ~2.7x at Radiant). Only `skill` feeds the
  // split; the balance screen's badges show this season's tier as-is.
  function skillScore(p, i) {
    // No real tier data (never looked up, or lookup failed) gets a fixed
    // lowest-tier baseline for scoring purposes only — never a fabricated,
    // convincing-looking per-player tier. The UI still shows them as "언랭".
    const peakIdx = p.tier == null ? 0 : p.tier;
    const curIdx = p.currentTier ? TIERS.findIndex((t) => t.label === p.currentTier) : -1;
    const base = curIdx >= 0 ? curIdx : peakIdx;
    const st = seasonStats[p.name.trim()];
    const kd = st?.matches ? st.kd : 1;
    const tierWeight = 1 + base * 0.07;
    return base + (kd - 1) * 2 * tierWeight;
  }

  // `rank` picks which candidate split to use: 0 is the best (lowest skill
  // gap), 1 the next-best, etc. — wrapping if asked for more than exist.
  // "5:5 자동 밸런싱" always starts at rank 0; "다시 배분" walks forward
  // through the runner-up splits instead of recomputing the same optimum
  // over and over, so re-rolling actually offers a different (if slightly
  // less perfectly balanced) matchup.
  function runBalance(rank) {
    const list = players
      .map((p, i) => ({
        i, name: p.name.trim(), pos: p.pos,
        // This season's tier for display — null (unplaced / no data) is shown
        // as "언랭", never a fabricated tier or a peak-tier stand-in.
        tier: seasonTierIdx(p),
        tierIcon: seasonTierIdx(p) != null ? p.currentTierIcon || null : null,
        skill: skillScore(p, i),
        groupId: p.groupId || null
      }))
      .filter((p) => p.name);
    if (list.length < 2) { setScreen('players'); return; }
    const n = list.length;
    const capA = Math.ceil(n / 2);

    // "같은 팀으로 묶기" groups are bundled into one indivisible unit so a
    // group's members always land on the same side.
    const groupUnits = new Map();
    const units = [];
    list.forEach((p) => {
      if (p.groupId) {
        let u = groupUnits.get(p.groupId);
        if (!u) { u = { members: [] }; groupUnits.set(p.groupId, u); units.push(u); }
        u.members.push(p);
      } else {
        units.push({ members: [p] });
      }
    });
    units.forEach((u) => { u.skill = u.members.reduce((s, p) => s + p.skill, 0); u.size = u.members.length; });
    const m = units.length;
    const membersOf = (mask) => {
      const out = [];
      for (let k = 0; k < m; k++) if (mask & (1 << k)) out.push(...units[k].members);
      return out;
    };
    const posPenalty = (members) => {
      if (!usePosition) return 0;
      const counts = {};
      members.forEach((p) => { if (p.pos !== '미정' && p.pos !== '플렉스') counts[p.pos] = (counts[p.pos] || 0) + 1; });
      return Object.values(counts).reduce((s, c) => s + (c * (c - 1)) * 1.1, 0);
    };
    const totalSkill = units.reduce((s, u) => s + u.skill, 0);

    // A prior version greedily assigned each unit (sorted by skill) to
    // whichever side currently had a lower running total. That can strand an
    // entire premade group's combined skill on one side with only whatever
    // scraps are left to balance it — a small "keep 3 friends together" ask
    // producing a full-tier gap between teams. With at most 10 units this is
    // cheap to solve exactly instead: try every way of splitting the units
    // into two sides (as long as no group is split) and rank every valid
    // split by score. Skill diff and the position-duplicate penalty are kept
    // on the same tier-point scale (not diff-dominant) so a split that
    // stacks 3 duelists on one side can lose out to one that's a couple of
    // tier-points less balanced but spreads roles properly — a real
    // trade-off, not just a tie-breaker between otherwise-identical splits.
    // Mask and its complement are the same partition with A/B swapped, so
    // only the lower of the two is kept — otherwise every split would show
    // up twice and "다시 배분" would alternate between two identical-looking
    // team lists (just mirrored) instead of a genuinely different one.
    const candidates = [];
    const half = (1 << m) - 1;
    for (let mask = 0; mask < (1 << m); mask++) {
      const complement = half ^ mask;
      if (mask > complement) continue;
      let size = 0, skillA = 0;
      for (let k = 0; k < m; k++) if (mask & (1 << k)) { size += units[k].size; skillA += units[k].skill; }
      if (size !== capA) continue;
      const diff = Math.abs(skillA - (totalSkill - skillA));
      let score = diff;
      if (usePosition) {
        const membersA = membersOf(mask);
        const membersB = membersOf(complement);
        score = diff + posPenalty(membersA) + posPenalty(membersB);
      }
      candidates.push({ mask, score });
    }
    candidates.sort((a, b) => a.score - b.score);

    let A, B;
    if (candidates.length) {
      const chosen = candidates[rank % candidates.length];
      A = membersOf(chosen.mask);
      B = membersOf(half ^ chosen.mask);
    } else {
      // No way to hit an exact capA/capB split without breaking a group
      // (only possible with unlucky group sizes and no ungrouped players
      // left to pad with) — fall back to a greedy pass that at least
      // guarantees a full, valid split instead of erroring out. No ranked
      // alternatives in this fallback path — it's a rare edge case, not
      // worth a second search just to feed "다시 배분".
      units.sort((a, b) => b.skill - a.skill);
      A = []; B = [];
      units.forEach((u) => {
        const fitsA = A.length + u.size <= capA;
        const fitsB = B.length + u.size <= n - capA;
        if (!fitsA && !fitsB) return void u.members.forEach((p) => { (A.length < capA ? A : B).push(p); });
        if (!fitsB) return void A.push(...u.members);
        if (!fitsA) return void B.push(...u.members);
        const sumA = A.reduce((s, x) => s + x.skill, 0), sumB = B.reduce((s, x) => s + x.skill, 0);
        (sumA <= sumB ? A : B).push(...u.members);
      });
    }
    setTeamsLocal({ A, B });
    setSel(null);
    setScreen('balance');
  }
  function balance() { rebalanceRankRef.current = 0; runBalance(0); }
  function rebalance() { rebalanceRankRef.current += 1; runBalance(rebalanceRankRef.current); }

  /* ---------- "같은 팀으로 묶기" grouping ---------- */
  function groupSelected(indices) {
    if (indices.length < 2) return;
    const gid = `g${Date.now()}`;
    setPlayers((arr) => cleanupGroups(arr.map((x, k) => (indices.includes(k) ? { ...x, groupId: gid } : x))));
  }
  function ungroup(groupId) {
    setPlayers((arr) => arr.map((x) => (x.groupId === groupId ? { ...x, groupId: null } : x)));
  }

  function clickPlayer(team, idx) {
    if (!sel) return setSel({ team, idx });
    if (sel.team === team && sel.idx === idx) return setSel(null);
    const t = { A: teams.A.slice(), B: teams.B.slice() };
    const a = t[sel.team][sel.idx], b = t[team][idx];
    t[sel.team][sel.idx] = b; t[team][idx] = a;
    setTeamsLocal(t); setSel(null);
  }

  /* ---------- roster ---------- */
  async function persistRoster(list) {
    setRoster(list);
    try {
      await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roster: list }) });
    } catch {}
  }
  function addMember() {
    const name = newMemberName.trim();
    if (!name) return;
    if (roster.some((r) => r.name === name)) return setNewMemberName('');
    persistRoster([...roster, { name, pos: '미정', realName: newMemberRealName.trim(), alts: [] }]);
    setNewMemberName(''); setNewMemberRealName('');
  }
  function storeCurrentAsRoster() {
    const map = new Map(roster.map((r) => [r.name, r]));
    players.forEach((p) => { const n = p.name.trim(); if (n) map.set(n, { name: n, pos: p.pos, realName: map.get(n)?.realName || p.realName || '', alts: map.get(n)?.alts || [] }); });
    persistRoster([...map.values()]);
  }
  // 부캐(스머프/서브 계정) 관리: 같은 사람이 본계정/부계정을 오가며 참가해도
  // 전적은 한 사람으로 합산되도록, 로스터 한 명당 여러 Riot ID를 매다는 방식
  // — 계정마다 별도 로스터 항목을 만드는 대신, "이 사람" 아래 대체 계정
  // 목록을 붙인다. rosterAlias(아래)가 이 목록을 읽어서 부계정으로 기록된
  // 경기도 본계정 이름으로 합산해준다.
  function addAlt(name, alt) {
    const a = alt.trim();
    if (!a) return;
    persistRoster(roster.map((r) => (r.name === name && !r.alts?.includes(a) ? { ...r, alts: [...(r.alts || []), a] } : r)));
  }
  function removeAlt(name, alt) {
    persistRoster(roster.map((r) => (r.name === name ? { ...r, alts: (r.alts || []).filter((a) => a !== alt) } : r)));
  }
  // Lowercased Riot ID (main or alt) -> that person's canonical (main)
  // roster name. Used wherever a match result gets attributed to a player,
  // so a game played on a 부계정 still counts toward the same person's 전적.
  const rosterAlias = useMemo(() => {
    const m = new Map();
    roster.forEach((r) => {
      m.set(r.name.trim().toLowerCase(), r.name);
      (r.alts || []).forEach((a) => { const k = a.trim().toLowerCase(); if (k) m.set(k, r.name); });
    });
    return m;
  }, [roster]);
  function canonicalName(name) {
    return rosterAlias.get(String(name).trim().toLowerCase()) || name;
  }
  // Called when runLookup's by-puuid fallback detects someone's Riot ID
  // changed. Renames the roster entry outright (no 부계정 kept for the old
  // name — that's reserved for someone who genuinely plays multiple
  // accounts, not a one-time rename) and migrates their saved 전적 onto the
  // new name server-side so history keeps counting toward the same person.
  function relinkRosterName(oldName, newName) {
    if (!roster.some((r) => r.name === oldName)) return;
    persistRoster(roster.map((r) => (r.name === oldName ? { ...r, name: newName } : r)));
    fetch('/api/records', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: oldName, to: newName })
    }).then((r) => r.json()).then((d) => { if (d.records) setRecords(d.records); }).catch(() => {});
  }
  // Caches the Riot puuid behind whichever name currently resolves to it —
  // the one thing that keeps working after a rename — so a future lookup
  // that 404s under the (by-then-stale) name can recover via relinkRosterName.
  function rememberPuuid(name, puuid) {
    const entry = roster.find((r) => r.name === name);
    if (!entry || entry.puuid === puuid) return;
    persistRoster(roster.map((r) => (r.name === name ? { ...r, puuid } : r)));
  }
  function pickMember(name, pos, realName) {
    // Block registering the same person twice under two different accounts
    // (e.g. their main is already in while someone fat-fingers their alt in
    // too) — compare by canonical identity, not just the exact string.
    const canon = canonicalName(name);
    if (players.some((p) => p.name.trim() && canonicalName(p.name.trim()) === canon)) return;
    const i = players.findIndex((p) => !p.name.trim());
    if (i < 0) return;
    setPlayers((arr) => arr.map((x, k) => (k === i ? { name, pos: pos || '미정', tier: null, source: null, loading: false, realName: realName || '', groupId: null } : x)));
    lookup(i, name);
  }
  function unpickMember(name) {
    setPlayers((arr) => cleanupGroups(arr.map((x) => (x.name.trim() === name ? { name: '', pos: '미정', tier: null, source: null, loading: false, realName: '', groupId: null } : x))));
  }
  function fillFromRoster() {
    const taken = players.map((p) => p.name.trim()).filter(Boolean);
    const avail = roster.filter((r) => !taken.includes(r.name));
    let k = 0;
    const next = players.map((p) => {
      if (p.name.trim() || k >= avail.length) return p;
      const m = avail[k++];
      return { name: m.name, pos: m.pos || '미정', tier: null, source: null, loading: false, realName: m.realName || '', groupId: null };
    });
    setPlayers(next);
    next.forEach((p, i) => { if (p.name.trim() && p.tier == null) lookup(i, p.name); });
  }
  function clearSlots() { setPlayers(emptyPlayers()); setTeamsLocal(null); setSel(null); clearTeamsRef.current = true; }

  /* ---------- ban/pick ---------- */
  const steps = seqFor(series, pool.length);
  const step = bp ? steps[bp.index] : null;
  // BO3's ban/pick sequence is fixed at 4 maps (ban,ban,pick,pick) regardless
  // of pool size, so anything smaller than 5 would leave nothing for the
  // decider to draw from. BO5 already scales its ban count to leave exactly
  // one map, but still needs its 4 picks + 1 decider map to exist.
  const minPoolSize = 5;

  function joinCaptain(team) {
    if (captains[team]) {
      // Seat's taken — only the browser that actually claimed it (holds the
      // matching token) may act on it at all; everyone else's click is a
      // no-op, so a captain seat can't be pulled out from under someone.
      if (!(myCaptainTokens[team] && myCaptainTokens[team] === captains[team])) return;
      // First press (after a reload, myRole starts back at null even though
      // the seat is still ours) just re-selects it. Pressing the button
      // again while already selected — i.e. it's already showing "내 차례
      // 대기" — cancels the seat instead, freeing it up. Blocked once
      // banpick has actually started so leaving mid-match can't strand it.
      if (myRole !== team) { setMyRole(team); return; }
      if (bp) return;
      releaseCaptainRef.current = team;
      setCaptains((c) => ({ ...c, [team]: null }));
      setMyCaptainTokens((m) => ({ ...m, [team]: null }));
      setMyRole(null);
      return;
    }
    const token = `CPT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setCaptains((c) => ({ ...c, [team]: token }));
    setMyCaptainTokens((m) => ({ ...m, [team]: token }));
    setMyRole(team);
  }
  useEffect(() => {
    let tok = null;
    try { tok = localStorage.getItem('adminToken'); } catch {}
    if (!tok) return;
    adminTokenRef.current = tok;
    fetch('/api/admin', { headers: adminHeaders() }).then((r) => r.json()).then((d) => {
      if (d?.admin) setIsAdmin(true);
      else { adminTokenRef.current = null; try { localStorage.removeItem('adminToken'); } catch {} }
    }).catch(() => {});
  }, []);

  async function adminLogin() {
    setAdminErr('');
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: adminPw }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.token) {
        adminTokenRef.current = d.token;
        try { localStorage.setItem('adminToken', d.token); } catch {}
        setIsAdmin(true); setAdminOpen(false); setAdminPw('');
      } else setAdminErr(d.error || '로그인에 실패했습니다.');
    } catch { setAdminErr('서버에 연결할 수 없습니다.'); }
  }
  function adminLogout() {
    adminTokenRef.current = null;
    try { localStorage.removeItem('adminToken'); } catch {}
    setIsAdmin(false); setPoolPickerOpen(false);
  }
  async function deleteRecord(payload, message) {
    if (!isAdmin || !window.confirm(message)) return;
    try {
      const res = await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.records) setRecords(d.records);
      else if (res.status === 403) { adminLogout(); window.alert('관리자 인증이 만료되었습니다. 다시 로그인하세요.'); }
    } catch {}
  }

  async function setExcluded(id, excluded) {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/records', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ id, excluded }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.excluded)) setExcludedIds(d.excluded);
      else if (res.status === 403) { adminLogout(); window.alert('관리자 인증이 만료되었습니다. 다시 로그인하세요.'); }
    } catch {}
  }

  function startBanpick() {
    if (pool.length < minPoolSize || !captains.A || !captains.B || !teams || bp) return;
    // Fresh per-session seed so the decider's deterministic "roll" (below)
    // actually varies between banpick attempts — without it, the same
    // ban/pick order always hashed to the same leftover map (looked rigged).
    bpStartDirtyRef.current = true;
    setBp({ index: 0, maps: {}, pending: null, order: 0, seed: Date.now() });
    setScreen('banpick');
  }
  function advance(next) {
    if (!next.pending && steps[next.index]?.[0] === 'decider') {
      const left = pool.filter((m) => !next.maps[m]);
      if (left.length >= 1) {
        // Deterministic "random" pick (seeded from room+session+order+
        // candidates) so every client lands on the identical map
        // independently, with no need to coordinate who "rolled" it.
        const chosen = left.length === 1
          ? left[0]
          : left[hashStr(`${roomCode}-${next.seed}-${next.order}-${left.join(',')}`) % left.length];
        const maps = { ...next.maps, [chosen]: { status: 'decider', by: null, order: next.order + 1 } };
        next = {
          index: next.index + 1, maps, order: next.order + 1, seed: next.seed,
          pending: { map: chosen, chooser: 'A' },
          deciderRoll: left.length > 1 ? { candidates: left, chosen } : null
        };
      }
    }
    setBp(next);
  }
  function clickMap(name) {
    if (!bp || bp.pending || !step || step[0] === 'decider') return;
    if (myRole !== step[1] || bp.maps[name]) return;
    const order = bp.order + 1;
    const maps = { ...bp.maps, [name]: { status: step[0], by: step[1], order } };
    if (step[0] === 'pick') {
      nextBg(name);
      advance({ index: bp.index + 1, maps, order, seed: bp.seed, pending: { map: name, chooser: step[1] === 'A' ? 'B' : 'A' } });
    } else advance({ index: bp.index + 1, maps, order, seed: bp.seed, pending: null });
  }
  function chooseSide(side) {
    if (!bp?.pending || myRole !== bp.pending.chooser) return;
    const maps = { ...bp.maps, [bp.pending.map]: { ...bp.maps[bp.pending.map], side, sideBy: bp.pending.chooser } };
    advance({ index: bp.index, maps, order: bp.order, seed: bp.seed, pending: null });
  }

  // Full veto/pick timeline, bans included, in the order they actually
  // happened — for the post-banpick recap strip (esports-style veto graphic).
  const banpickSummary = useMemo(() => {
    if (!bp) return [];
    return pool
      .filter((m) => bp.maps[m])
      .sort((a, b) => bp.maps[a].order - bp.maps[b].order)
      .map((m, idx) => ({ name: m, info: bp.maps[m], step: steps[idx] }));
  }, [bp, pool, steps]);

  // ---- 과거 내전 불러오기 (전체 전적 탭): the only way results get saved now
  // that "결과"/결과 입력 is gone — scans one Riot ID's real custom-game
  // history from HenrikDev directly and matches each match's Red/Blue
  // rosters against 인원 관리's saved roster, so results (past or just
  // finished) can be reviewed and saved into /api/records.
  const [pastAnchor, setPastAnchor] = useState('');
  const [pastScanning, setPastScanning] = useState(false);
  const [pastCandidates, setPastCandidates] = useState(null); // null = not scanned yet
  const [pastMsg, setPastMsg] = useState('');
  const [pastSaving, setPastSaving] = useState(false);

  async function scanPastCustoms() {
    if (pastScanning) return;
    const id = pastAnchor.trim();
    const hashIdx = id.indexOf('#');
    if (hashIdx < 1) { setPastMsg('명단에서 Riot ID(이름#태그)가 있는 사람을 선택하세요.'); return; }
    setPastScanning(true); setPastMsg(''); setPastCandidates(null);
    try {
      const { list, error } = await fetchCustomCandidates(id, 0);
      if (error) { setPastMsg(`불러오기에 실패했습니다. (${error})`); return; }
      setPastCandidates(list.map((m) => ({ ...m, checked: true })));
      if (!list.length) setPastMsg('명단과 겹치는 예전 내전 매치를 찾지 못했습니다. (최근 50경기까지만 조회됩니다)');
    } catch {
      setPastMsg('서버에 연결할 수 없습니다.');
    } finally {
      setPastScanning(false);
    }
  }

  // Fetches one Riot ID's custom games from HenrikDev and keeps only the
  // ones that are actually "ours" — shared by 과거 내전 불러오기 and the
  // one-click 내전 결과 불러오기 below.
  async function fetchCustomCandidates(id, since) {
    const hashIdx = id.indexOf('#');
    const res = await fetch(`/api/customs?name=${encodeURIComponent(id.slice(0, hashIdx))}&tag=${encodeURIComponent(id.slice(hashIdx + 1))}&since=${since || 0}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { list: [], error: d.error || res.status };

      const engToKo = {};
      ALL_MAPS.forEach((ko) => { engToKo[(MAP_IMG[ko] || '').split('/').pop().replace('.png', '')] = ko; });

      const list = (d.matches || [])
        .map((mt) => {
          // Show and save EVERYONE who was actually in the match, not just
          // whoever happens to already be in the saved roster — otherwise a
          // real 5-stack shows up as "2 people" just because 3 of them were
          // never added to 인원 관리. Roster names get the roster's own
          // display casing (and a 부계정 gets folded onto its main account
          // via rosterAlias); everyone else keeps HenrikDev's Riot ID as-is.
          // Each player also carries their real K/D/A·ACS·HS% for this
          // match straight from HenrikDev (see app/api/customs/route.js).
          const redPlayers = mt.red.players.map((p) => ({ ...p, name: canonicalName(p.name) }));
          const bluePlayers = mt.blue.players.map((p) => ({ ...p, name: canonicalName(p.name) }));
          const redRosterHits = mt.red.players.filter((p) => rosterAlias.has(p.name.trim().toLowerCase())).length;
          const blueRosterHits = mt.blue.players.filter((p) => rosterAlias.has(p.name.trim().toLowerCase())).length;
          const koMap = engToKo[String(mt.map).toLowerCase()];
          return { id: mt.id, startedAt: mt.startedAt, koMap, redRounds: mt.red.rounds, blueRounds: mt.blue.rounds, redPlayers, bluePlayers, redRosterHits, blueRosterHits };
        })
        // Need a real winner, and at least one roster member per side just
        // to decide this match is actually "ours" (not some unrelated
        // public custom the anchor player happened to join) — but that's
        // only a relevance filter, not a filter on who gets included above.
        .filter((m) => m.koMap && m.redRounds !== m.blueRounds && m.redRosterHits && m.blueRosterHits);
    return { list };
  }

  function togglePastCandidate(id) {
    setPastCandidates((list) => list.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  }

  // Custom-game history has no rank attached to it (customs aren't ranked),
  // so there's no real "tier at match time" to show. Current tier is shown
  // instead as a best-effort stand-in — clearly not historically accurate,
  // but better than blank "언랭" for everyone. One /api/rank lookup per
  // unique person across the whole selected batch, not per match.
  async function fetchCurrentTiers(names) {
    const out = {};
    for (const full of names) {
      const i = full.indexOf('#');
      if (i < 1) continue;
      try {
        const res = await fetch(`/api/rank?name=${encodeURIComponent(full.slice(0, i))}&tag=${encodeURIComponent(full.slice(i + 1))}`);
        const d = await res.json().catch(() => null);
        if (!d) continue;
        // Current-season tier only — no peak fallback.
        const entry = rememberCurrentTier(full, d);
        if (entry?.tier != null) out[full] = { tier: entry.tier, tierIcon: entry.tierIcon };
      } catch {}
    }
    return out;
  }

  async function importSelectedPast() {
    const selected = (pastCandidates || []).filter((m) => m.checked);
    if (!selected.length || pastSaving) return;
    setPastSaving(true);
    setPastMsg('현재 티어 조회 중…');
    const { saved, duplicate, failed } = await saveCustomMatches(selected);
    setPastCandidates((list) => list.filter((m) => !selected.some((s) => s.id === m.id)));
    setPastMsg(`${saved}경기 저장됨${duplicate ? ` · 이미 저장된 경기 ${duplicate}개` : ''}${failed ? ` · 실패 ${failed}개` : ''}`);
    setPastSaving(false);
  }

  async function saveCustomMatches(selected) {
    const allNames = new Set();
    selected.forEach((m) => { m.redPlayers.forEach((p) => allNames.add(p.name)); m.bluePlayers.forEach((p) => allNames.add(p.name)); });
    const tierByName = await fetchCurrentTiers(allNames);

    let saved = 0, duplicate = 0, failed = 0;
    for (const m of selected) {
      const redIsA = m.redRounds > m.blueRounds;
      try {
        const res = await fetch('/api/records', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            winner: redIsA ? 'A' : 'B',
            score: `${Math.max(m.redRounds, m.blueRounds)} : ${Math.min(m.redRounds, m.blueRounds)}`,
            maps: [m.koMap],
            date: Date.parse(m.startedAt) || undefined,
            matchKey: `customs:${m.id}`,
            teams: {
              A: m.redPlayers.map((p) => ({ name: p.name, tier: tierByName[p.name]?.tier ?? null, tierIcon: tierByName[p.name]?.tierIcon ?? null, agent: p.agent, agentIcon: p.agentIcon, kills: p.kills, deaths: p.deaths, assists: p.assists, acs: p.acs, hsPct: p.hsPct })),
              B: m.bluePlayers.map((p) => ({ name: p.name, tier: tierByName[p.name]?.tier ?? null, tierIcon: tierByName[p.name]?.tierIcon ?? null, agent: p.agent, agentIcon: p.agentIcon, kills: p.kills, deaths: p.deaths, assists: p.assists, acs: p.acs, hsPct: p.hsPct }))
            }
          })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { failed++; continue; }
        if (d.duplicate) duplicate++; else { saved++; if (d.records) setRecords(d.records); }
      } catch { failed++; }
    }
    return { saved, duplicate, failed };
  }

  // ---- 내전 결과 불러오기: one click after a match ends. Picks an anchor
  // automatically (today's teams first, then the roster), looks back 12h,
  // skips anything already saved, and saves the rest straight away — no
  // anchor dropdown or checkbox review like 과거 내전 불러오기.
  const [quickImporting, setQuickImporting] = useState(false);
  const [quickMsg, setQuickMsg] = useState('');

  async function quickImportLatest() {
    if (quickImporting) return;
    setQuickImporting(true); setQuickMsg('최근 내전 찾는 중…');
    try {
      const teamNames = teams ? [...teams.A, ...teams.B].map((p) => p?.name?.trim()) : [];
      const anchors = [...new Set([...teamNames, ...roster.map((r) => r.name)])]
        .filter((n) => typeof n === 'string' && n.indexOf('#') > 0)
        .slice(0, 3);
      if (!anchors.length) { setQuickMsg('Riot ID(이름#태그)가 등록된 선수가 없습니다.'); return; }

      const savedKeys = new Set();
      Object.values(records).forEach((r) => (r.matches || []).forEach((m) => m.matchKey && savedKeys.add(m.matchKey)));
      const since = Date.now() - 12 * 60 * 60 * 1000;

      // Try a few anchors in case one account's history fails (rate limit,
      // private profile) — the first successful scan wins.
      let list = null, lastError = null;
      for (const a of anchors) {
        const r = await fetchCustomCandidates(a, since);
        if (!r.error) { list = r.list; break; }
        lastError = r.error;
      }
      if (!list) { setQuickMsg(`불러오기에 실패했습니다. (${lastError})`); return; }

      const fresh = list.filter((m) => !savedKeys.has(`customs:${m.id}`));
      if (!fresh.length) { setQuickMsg(list.length ? '최근 12시간 내전은 이미 모두 저장되어 있습니다.' : '최근 12시간 안에 끝난 내전을 찾지 못했습니다. 경기 직후라면 1~2분 뒤 다시 시도해 보세요.'); return; }

      setQuickMsg(`${fresh.length}경기 저장 중…`);
      const { saved, duplicate, failed } = await saveCustomMatches(fresh);
      const latest = fresh.reduce((a, b) => (Date.parse(b.startedAt) > Date.parse(a.startedAt) ? b : a));
      setQuickMsg(`${saved}경기 저장됨 (최근: ${latest.koMap} ${Math.max(latest.redRounds, latest.blueRounds)}:${Math.min(latest.redRounds, latest.blueRounds)})${duplicate ? ` · 이미 저장된 경기 ${duplicate}개` : ''}${failed ? ` · 실패 ${failed}개` : ''}`);
      if (saved) { setStatView('match'); setMatchSort('newest'); }
    } catch {
      setQuickMsg('서버에 연결할 수 없습니다.');
    } finally {
      setQuickImporting(false);
    }
  }

  const winrate = (id) => {
    const r = records[id];
    if (!r || r.wins + r.losses === 0) return null;
    return Math.round((r.wins / (r.wins + r.losses)) * 100);
  };

  /* ---------- derived ---------- */
  const filled = players.filter((p) => p.name.trim());
  const poolReady = pool.length >= minPoolSize;
  // Blocked once a banpick session already exists (in progress or finished)
  // — starting fresh here used to just overwrite `bp` with a brand-new
  // index-0 session, silently wiping whatever banpick was already underway.
  // Restarting on purpose still works via "방 초기화". Also requires teams
  // to already be balanced — captains joining doesn't imply anyone ever
  // clicked "5:5 자동 밸런싱", and starting banpick without teams set would
  // leave the whole match unattributed (no roster for either side).
  const canStart = poolReady && captains.A && captains.B && !!teams && !bp;
  const pendingShow = !!bp?.pending;
  const myTurn = !!bp && ((pendingShow && myRole === bp.pending.chooser) || (!pendingShow && step && step[0] !== 'decider' && myRole === step[1]));
  const finished = !!bp && bp.index >= steps.length && !bp.pending;
  const bpInProgress = !!bp && !finished;

  const board = useMemo(() => Object.entries(records).map(([id, r]) => {
    const g = r.wins + r.losses;
    // Not necessarily matches[0] — a 과거 내전 불러오기 import can add an
    // older match after newer ones already exist, so array order alone
    // doesn't mean date order.
    const last = (r.matches || []).reduce((a, b) => (!a || b.date > a.date ? b : a), null);
    // K/D and HS% only exist on matches with real per-player stats (과거
    // 내전 불러오기 imports) — regular in-app saves have none. K/D is total
    // kills over total deaths across those matches (not an average of
    // per-match ratios, which would over-weight low-death games); HS% is
    // averaged since only the per-match percentage is stored, not raw
    // headshot counts. Players with no stat-bearing matches get null, so
    // they sort to the bottom instead of tying everyone at 0.
    const statMatches = (r.matches || []).filter((m) => m.kills != null);
    let kills = 0, deaths = 0, hsSum = 0;
    statMatches.forEach((m) => { kills += m.kills; deaths += m.deaths; hsSum += m.hsPct || 0; });
    const kd = statMatches.length ? (deaths ? Math.round((kills / deaths) * 100) / 100 : kills) : null;
    const hsPct = statMatches.length ? Math.round(hsSum / statMatches.length) : null;
    // 어시스트순 ranks by assists per game (not total), so someone with more
    // imported matches doesn't win just by volume.
    const assists = statMatches.length ? Math.round((statMatches.reduce((n, m) => n + (m.assists || 0), 0) / statMatches.length) * 10) / 10 : null;
    const realName = roster.find((r) => r.name === id)?.realName || '';
    // This season's tier (see currentTiers) — the per-match snapshot is only
    // a fallback until that's been fetched.
    const cur = currentTiers[id];
    const tier = cur ? cur.tier : last?.tier ?? null;
    const tierIcon = cur ? cur.tierIcon : last?.tierIcon ?? null;
    return { id, realName, excluded: excludedIds.includes(id), wins: r.wins, losses: r.losses, games: g, rate: g ? Math.round((r.wins / g) * 100) : 0, tier, tierIcon, lastDate: last?.date || 0, kd, hsPct, assists };
  }), [records, roster, excludedIds, currentTiers]);
  // Everyone the leaderboard actually ranks — excluded players never take a
  // rank or count toward the summary tiles.
  const rankedBoard = useMemo(() => board.filter((x) => !x.excluded), [board]);

  // Opening 전체전적 fills in this season's tier for anyone not cached yet (or
  // cached over 12h ago). Runs through lookupQueueRef, one player at a time,
  // and tries each id at most once per page load so a failing lookup can't
  // loop.
  useEffect(() => {
    if (screen !== 'stats') return;
    const stale = Date.now() - 12 * 60 * 60 * 1000;
    const ids = Object.keys(records).filter((id) => id.includes('#') && !tierRefreshTriedRef.current.has(id) && !((currentTiers[id]?.at || 0) > stale));
    if (!ids.length) return;
    ids.forEach((id) => tierRefreshTriedRef.current.add(id));
    const task = lookupQueueRef.current.then(async () => {
      for (const full of ids) {
        const i = full.indexOf('#');
        const d = await fetch(`/api/rank?name=${encodeURIComponent(full.slice(0, i))}&tag=${encodeURIComponent(full.slice(i + 1))}`).then((r) => r.json()).catch(() => null);
        rememberCurrentTier(full, d);
        await new Promise((r) => setTimeout(r, 250)); // spread requests out, avoid HenrikDev rate limit
      }
    });
    lookupQueueRef.current = task.catch(() => {});
  }, [screen, records, currentTiers]);

  const boardList = useMemo(() => {
    const q = statQuery.trim().toLowerCase();
    const sorters = {
      rate: (a, b) => b.rate - a.rate || b.games - a.games,
      tier: (a, b) => (b.tier ?? -1) - (a.tier ?? -1) || b.rate - a.rate,
      kd: (a, b) => (b.kd ?? -1) - (a.kd ?? -1) || b.rate - a.rate,
      hsPct: (a, b) => (b.hsPct ?? -1) - (a.hsPct ?? -1) || b.rate - a.rate,
      assists: (a, b) => (b.assists ?? -1) - (a.assists ?? -1) || b.rate - a.rate
    };
    const cmp = sorters[statSort];
    const sorted = rankedBoard.filter((x) => !q || x.id.toLowerCase().includes(q)).sort(cmp);
    // A tie is decided by the sort's own value only — the tiebreaker
    // (usually 승률) still orders people *within* a tie for display, but
    // shouldn't split them into separate ranks.
    const primaryVal = {
      rate: (x) => x.rate,
      tier: (x) => x.tier ?? -1,
      kd: (x) => x.kd ?? -1,
      hsPct: (x) => x.hsPct ?? -1,
      assists: (x) => x.assists ?? -1
    }[statSort];
    // Dense ranking ("1, 1, 2, 3…"): a tie shares one rank, and the next
    // distinct entry just continues from there — a 2-way tie for 1st is
    // followed by 2nd, not 3rd.
    let rank = 0;
    const ranked = sorted.map((x, i) => {
      if (i === 0 || primaryVal(sorted[i - 1]) !== primaryVal(x)) rank += 1;
      return { ...x, rank };
    });
    const rankCounts = ranked.reduce((m, x) => (m[x.rank] = (m[x.rank] || 0) + 1, m), {});
    const out = ranked.map((x) => ({ ...x, tied: rankCounts[x.rank] > 1 }));
    // Admins still see excluded players (unranked, at the bottom) so they can
    // be restored; everyone else doesn't see them at all.
    if (!isAdmin) return out;
    const hidden = board.filter((x) => x.excluded && (!q || x.id.toLowerCase().includes(q))).sort(cmp).map((x) => ({ ...x, rank: null, tied: false }));
    return [...out, ...hidden];
  }, [board, rankedBoard, statQuery, statSort, isAdmin]);

  const statRec = statId ? records[statId] : null;
  const statTotal = statRec ? statRec.wins + statRec.losses : 0;
  const statRate = statTotal ? Math.round((statRec.wins / statTotal) * 100) : 0;
  // Matches aren't always stored newest-first — a 과거 내전 불러오기 import
  // can add an old match after newer ones already exist — so "most recent"
  // has to be found by actual date, not just array index 0.
  const statLast = (statRec?.matches || []).reduce((a, b) => (!a || b.date > a.date ? b : a), null);
  const statTier = (statId && currentTiers[statId]) || statLast;

  // True count of distinct matches — each match writes one entry per
  // *participant* (up to 10 for a 5v5), so summing everyone's `games` and
  // halving it (as if every match only had 2 players) overcounts by ~5x.
  // Counting distinct dates instead is exact regardless of how many people
  // were actually in any given match.
  const totalMatchCount = useMemo(() => {
    const dates = new Set();
    Object.values(records).forEach((r) => (r.matches || []).forEach((m) => dates.add(m.date)));
    return dates.size;
  }, [records]);

  // 경기별 보기: every player who played a given match has their own record
  // entry sharing that exact `date` (see /api/records POST — one `date =
  // Date.now()` per save, written into every participant's list), and each
  // entry's own `result` (승/패) says which side of *that* match they were
  // on. Grouping by date reconstructs the full match — both rosters, one
  // score, one map — from data that's already there, no schema change.
  const matchLog = useMemo(() => {
    const byDate = new Map();
    Object.entries(records).forEach(([id, r]) => {
      (r.matches || []).forEach((m) => {
        let entry = byDate.get(m.date);
        if (!entry) { entry = { date: m.date, map: m.map, score: m.score, winners: [], losers: [] }; byDate.set(m.date, entry); }
        (m.result === '승' ? entry.winners : entry.losers).push({ id, tier: m.tier, tierIcon: m.tierIcon, agent: m.agent, agentIcon: m.agentIcon, kills: m.kills, deaths: m.deaths, assists: m.assists, acs: m.acs, hsPct: m.hsPct });
      });
    });
    const byName = (a, b) => a.id.localeCompare(b.id);
    byDate.forEach((e) => { e.winners.sort(byName); e.losers.sort(byName); });
    const q = statQuery.trim().toLowerCase();
    return [...byDate.values()]
      .filter((e) => !q || e.winners.some((p) => p.id.toLowerCase().includes(q)) || e.losers.some((p) => p.id.toLowerCase().includes(q)))
      .sort((a, b) => (matchSort === 'oldest' ? a.date - b.date : b.date - a.date));
  }, [records, statQuery, matchSort]);

  const recent = useMemo(() => {
    const flat = [];
    Object.values(records).forEach((r) => (r.matches || []).forEach((m) => flat.push(m)));
    flat.sort((a, b) => b.date - a.date);
    const seen = new Set();
    return flat.filter((m) => { const k = `${m.date}${m.score}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
  }, [records]);

  /* ---------- style helpers ---------- */
  const pill = (active, accent = '#FF4B57') => ({
    borderRadius: 999, padding: '9px 15px', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    whiteSpace: 'nowrap', border: `1px solid ${active ? accent : '#262C34'}`,
    background: active ? accent : 'transparent', color: active ? '#0B0D10' : '#A8B0B9'
  });
  const boxBtn = (active) => ({
    borderRadius: 12, padding: '11px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? '#FF4B57' : '#333B45'}`, background: active ? '#FF4B5720' : '#1B2027',
    color: active ? '#FF4B57' : '#C8D0D8'
  });
  const card = { background: '#14181D', border: '1px solid #262C34', borderRadius: 18, padding: 18 };
  const glass = { background: 'rgba(16,20,25,.72)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 22, padding: 18, boxShadow: '0 20px 50px rgba(0,0,0,.4)' };
  const h1 = { fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(26px,5vw,34px)' };
  const sub = { fontSize: 13, color: '#8B949E', marginTop: 4 };
  const playerGrid = '44px minmax(0,1.3fr) minmax(0,0.9fr) 108px minmax(0,0.9fr) minmax(0,0.9fr) 92px 100px';
  const rosterGrid = 'minmax(0,1.1fr) 60px minmax(0,1.1fr) 48px 48px 44px 40px 52px 100px 24px';
  const boardGrid = 'minmax(210px,2.4fr) minmax(96px,auto) minmax(96px,1.1fr) 68px 52px 60px 68px';
  const input = { background: '#0F1318', border: '1px solid #2C333C', borderRadius: 9, padding: '9px 11px', color: '#E8EAEC', fontSize: 13, width: '100%' };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0D10', color: '#E8EAEC', overflow: 'hidden' }}>
      {/* splash */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0B0D10', opacity: splash ? 1 : 0, pointerEvents: splash ? 'auto' : 'none',
        transition: 'opacity .7s ease', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 500px at 50% 38%, #1A2027 0%, #0B0D10 70%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 66, height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'popIn .6s cubic-bezier(.2,.7,.3,1) both, glowPulse 2.4s ease-in-out infinite .6s' }}>
            <img src="/logo.png" alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(24px,7vw,38px)', textAlign: 'center', letterSpacing: '-.01em', animation: 'revealMask .9s cubic-bezier(.2,.7,.3,1) both .15s' }}>SCRIM MANAGER</div>
          <div style={{ width: 220, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', transformOrigin: 'left', background: 'linear-gradient(90deg,#FF4B57,#C8F24C)', animation: 'growBar 1.5s cubic-bezier(.4,0,.2,1) both' }} />
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.2em', color: '#8B949E', animation: 'fadeUp .6s ease both .5s' }}>LOADING MAP POOL</div>
        </div>
        <div style={{ position: 'absolute', bottom: 28, fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.16em', color: '#5A626C' }}>MADE BY 이현</div>
      </div>

      {/* admin login */}
      {adminOpen && (
        <div onClick={() => setAdminOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(5,7,9,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); adminLogin(); }} style={{ width: 'min(340px,100%)', background: '#14181D', border: '1px solid #2C333C', borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>관리자 로그인</div>
            <input autoFocus type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} placeholder="비밀번호" style={{ background: '#0F1318', border: '1px solid #2C333C', borderRadius: 10, padding: '11px 14px', color: '#E8EAEC', fontSize: 13 }} />
            {adminErr && <div style={{ fontSize: 12, color: '#E1424F' }}>{adminErr}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAdminOpen(false)} style={{ background: 'transparent', color: '#8B949E', border: '1px solid #2C333C', borderRadius: 10, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>취소</button>
              <button type="submit" style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>로그인</button>
            </div>
          </form>
        </div>
      )}

      {/* reset toast */}
      <div style={{
        position: 'fixed', top: 18, left: '50%', zIndex: 95,
        transform: `translateX(-50%) translateY(${resetNotice ? '0' : '-16px'})`,
        opacity: resetNotice ? 1 : 0, pointerEvents: 'none', transition: 'opacity .35s ease, transform .35s ease'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: '#1B2027', border: '1px solid rgba(200,242,76,.4)',
          borderRadius: 999, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: '#C8F24C', boxShadow: '0 10px 30px rgba(0,0,0,.45)'
        }}>
          방이 초기화되었습니다.
        </div>
      </div>

      {/* background */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0E1319' }}>
        <div style={{ position: 'absolute', inset: 0, animation: 'kenburns 26s ease-in-out infinite alternate' }}>
          <img ref={bgA} src="/maps/ascent.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 26%' }} />
          <img ref={bgB} src="/maps/ascent.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 26%', opacity: 0, transition: 'opacity 1.6s ease' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(11,13,16,.62) 0%,rgba(11,13,16,.34) 16%,rgba(11,13,16,.82) 46%,rgba(11,13,16,.94) 70%,rgba(11,13,16,.97) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg,rgba(11,13,16,.6) 0%,rgba(11,13,16,.05) 42%,rgba(11,13,16,.55) 100%)' }} />
      </div>

      <div style={{ position: 'relative', maxWidth: 1460, margin: '0 auto', padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* top bar */}
        <div className="topBar" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'rgba(16,20,25,.58)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 22, padding: '10px 16px', boxShadow: '0 18px 44px rgba(0,0,0,.35)', animation: 'dropIn .55s cubic-bezier(.2,.7,.3,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 6, flex: 'none' }}>
            <div style={{ width: 26, height: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/logo.png" alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div className="brandWord" style={{ fontFamily: "'Archivo'", fontWeight: 700, fontSize: 15, letterSpacing: '.02em', whiteSpace: 'nowrap' }}>SCRIM MANAGER</div>
          </div>
          <div data-scrollx="1" className="navRow" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 380px', minWidth: 0, paddingBottom: 2 }}>
            {NAV.map(([k, label]) => (
              <button key={k} onClick={() => setScreen(k)} style={pill(screen === k)}>
                {label}{k === 'banpick' && bpInProgress ? ' ●' : ''}
              </button>
            ))}
          </div>
          <div className="topControls" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', flex: '0 1 auto' }}>
            {bpInProgress && (
              <button onClick={() => setScreen('banpick')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,75,87,.14)', border: '1px solid rgba(255,75,87,.4)', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#FF4B57', cursor: 'pointer' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF4B57', animation: 'pulseDot 1.2s infinite' }} />
                <span>밴픽중</span>
              </button>
            )}
            <div className={remoteOk === false ? 'syncPill syncPill--error' : 'syncPill'} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(27,32,39,.7)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, padding: '6px 12px', fontSize: 12, color: '#A8B0B9' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: remoteOk === false ? '#E1424F' : '#C8F24C', animation: 'pulseDot 1.6s infinite' }} />
              <span>{remoteOk === false ? '동기화 오류' : remoteOk ? '서버 동기화 · 1초' : '폴링 동기화 · 1초'}</span>
            </div>
            <div className="roomTag" style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#A8B0B9' }}>ROOM {roomCode}</div>
            <button className="adminBtn" onClick={() => (isAdmin ? adminLogout() : setAdminOpen(true))} style={{ background: isAdmin ? 'rgba(200,242,76,.14)' : 'transparent', color: isAdmin ? '#C8F24C' : '#8B949E', border: `1px solid ${isAdmin ? 'rgba(200,242,76,.4)' : 'rgba(255,255,255,.14)'}`, borderRadius: 999, padding: '7px 13px', fontSize: 12, fontWeight: isAdmin ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span className="btnIcon">⚙{isAdmin ? '✓' : ''}</span>
              <span className="btnLabel">{isAdmin ? '관리자 ✓ 로그아웃' : '관리자'}</span>
            </button>
            <button
              className="resetBtn"
              onClick={() => {
                if (confirmNewRoom) {
                  clearTimeout(confirmNewRoomTimer.current);
                  setConfirmNewRoom(false);
                  resetRoom();
                } else {
                  setConfirmNewRoom(true);
                  confirmNewRoomTimer.current = setTimeout(() => setConfirmNewRoom(false), 3000);
                }
              }}
              style={{
                background: confirmNewRoom ? '#FF4B57' : 'transparent', color: confirmNewRoom ? '#0B0D10' : '#8B949E',
                border: `1px solid ${confirmNewRoom ? '#FF4B57' : 'rgba(255,255,255,.14)'}`, borderRadius: 999,
                padding: '7px 13px', fontSize: 12, fontWeight: confirmNewRoom ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {confirmNewRoom
                ? '정말요? 다시 누르면 초기화'
                : <><span className="btnIcon">↻</span><span className="btnLabel">방 초기화</span></>}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* HOME */}
            {screen === 'home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ position: 'relative', minHeight: 340, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '40px 4px 12px' }}>
                  <div style={{ position: 'absolute', top: 6, right: 2, display: 'flex', gap: 8 }}>
                    <div style={{ background: 'rgba(27,32,39,.66)', backdropFilter: 'blur(10px)', border: '1px solid rgba(200,242,76,.32)', borderRadius: 999, padding: '8px 15px', fontSize: 12, color: '#C8F24C' }}>● LIVE 내전</div>
                  </div>
                  <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(38px,8vw,76px)', lineHeight: .94, letterSpacing: '-.03em', marginBottom: 12, textShadow: '0 10px 40px rgba(0,0,0,.65)', animation: 'revealMask .8s cubic-bezier(.2,.7,.3,1) both' }}>발로란트 내전</div>
                  <div style={{ fontSize: 15, color: '#C6CDD4', maxWidth: 520, marginBottom: 22, textWrap: 'pretty', textShadow: '0 2px 14px rgba(0,0,0,.6)' }}>
                    Riot ID 10명 입력 → 최고 티어 조회 → 5:5 자동 밸런싱 → e스포츠 방식 맵 밴픽까지. 방은 폴링으로 동기화되고 "방 초기화"를 누르기 전까지는 계속 유지됩니다.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setScreen('players')} style={{ background: '#FF4B57', color: '#0B0D10', border: 'none', borderRadius: 12, padding: '14px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>내전 시작하기</button>
                    <button onClick={() => setScreen('stats')} style={{ background: 'rgba(27,32,39,.72)', backdropFilter: 'blur(10px)', color: '#E8EAEC', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '14px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>전체 전적 보기</button>
                  </div>
                </div>

                <div data-lift="1" style={{ background: 'rgba(15,19,24,.84)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 20, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#8B949E', letterSpacing: '.04em' }}>최근 경기</div>
                    <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E' }}>{recent.length ? `${recent.length}건` : ''}</div>
                  </div>
                  {recent.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {recent.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1B2027', borderRadius: 12, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map || '내전'}</div>
                            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E' }}>{fmtDate(m.date)}</div>
                          </div>
                          <div style={{ fontFamily: "'Archivo'", fontWeight: 700, fontSize: 15, color: '#C8F24C' }}>{m.score}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#8B949E', padding: '18px 0' }}>아직 기록된 경기가 없습니다. 밴픽을 끝내고 결과를 입력하면 여기에 누적됩니다.</div>
                  )}
                </div>
              </div>
            )}

            {/* PLAYERS (인원: 참가자 등록 + 인원 관리 서브탭) */}
            {screen === 'players' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setPlayersTab('register')} style={pill(playersTab === 'register')}>참가자 등록</button>
                  <button onClick={() => setPlayersTab('roster')} style={pill(playersTab === 'roster')}>인원 관리</button>
                </div>

            {playersTab === 'roster' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div>
                  <div style={h1}>인원 관리</div>
                  <div style={sub}>자주 하는 사람의 Riot ID를 미리 등록해두고, 칩을 누르거나 아래 버튼으로 바로 참가자로 등록하세요. 등록된 참가자의 이번 시즌 경쟁전 통계도 여기서 바로 확인할 수 있습니다.</div>
                </div>
                <div style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>등록 멤버 명단 · 이번 시즌 경쟁전 통계</div>
                      <div style={{ fontSize: 12, color: '#8B949E', marginTop: 3 }}>{roster.length ? `${roster.length}명 저장됨` : '아직 등록된 사람이 없습니다'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={storeCurrentAsRoster} style={{ background: '#252C34', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>현재 참가자 입력값 명단에 저장</button>
                      <button onClick={clearSlots} style={{ background: 'transparent', color: '#8B949E', border: '1px solid #333B45', borderRadius: 10, padding: '10px 14px', fontSize: 12, cursor: 'pointer' }}>참가자 입력란 비우기</button>
                      <button onClick={fetchSeasonStats} disabled={seasonStatsLoading} style={{ background: '#252C34', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 10, padding: '10px 14px', fontSize: 12, cursor: seasonStatsLoading ? 'default' : 'pointer', opacity: seasonStatsLoading ? .6 : 1 }}>
                        {seasonStatsLoading ? '새로고침 중…' : '↻ 새로고침'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMember()} placeholder="닉네임#KR1" style={{ ...input, borderRadius: 10, padding: '11px 13px', flex: '1 1 200px', minWidth: 160, width: 'auto' }} />
                    <input value={newMemberRealName} onChange={(e) => setNewMemberRealName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMember()} placeholder="실명 (선택)" style={{ ...input, borderRadius: 10, padding: '11px 13px', flex: '1 1 140px', minWidth: 120, width: 'auto' }} />
                    <button onClick={addMember} style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>명단에 추가</button>
                  </div>

                  <div data-scrollx="1">
                    <div style={{ minWidth: 880 }}>
                      {!!roster.length && (
                        <div style={{ display: 'grid', gridTemplateColumns: rosterGrid, gap: 10, padding: '0 4px 8px', fontSize: 11, color: '#8B949E', letterSpacing: '.06em' }}>
                          <div>이름</div><div>TIER</div><div>AGENTS</div><div>ACS</div><div>HS%</div><div>K:D</div><div>K</div><div>승률</div><div></div><div></div>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {roster.map((r) => {
                          const accounts = [r.name, ...(r.alts || [])];
                          const activeAccount = accounts.find((acc) => players.some((p) => p.name.trim() === acc));
                          const used = !!activeAccount;
                          const active = used ? players.find((p) => p.name.trim() === activeAccount) : null;
                          const wr = winrate(r.name);
                          const st = seasonStats[r.name];
                          const chosenAccount = altPick[r.name] || r.name;
                          return (
                            <div key={r.name} data-row="1" style={{ display: 'grid', gridTemplateColumns: rosterGrid, gap: 10, alignItems: 'center', background: used ? 'rgba(200,242,76,.08)' : '#1B2027', border: `1px solid ${used ? 'rgba(200,242,76,.3)' : '#262C34'}`, borderRadius: 12, padding: '9px 12px' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}{used && activeAccount !== r.name ? ` (${activeAccount} 로 참가중)` : ''}</div>
                                {!!r.realName && <div style={{ fontSize: 11, color: '#8B949E' }}>{r.realName}</div>}
                                {!st?.matches && st?.error && (
                                  <div style={{ fontSize: 10, color: '#E5C04C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {st.error === 'rate_limited' ? 'API 요청 제한' : st.error === 'self_not_found_in_matches' ? '본인 미발견' : '조회 실패'}
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {(r.alts || []).map((a) => (
                                    <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8B949E', background: '#20262E', border: '1px solid #333B45', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                      {a}
                                      {isAdmin && <button onClick={() => removeAlt(r.name, a)} title="부계정 삭제" style={{ background: 'transparent', border: 'none', color: '#6B737C', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}>×</button>}
                                    </span>
                                  ))}
                                  {isAdmin && (
                                    <button onClick={() => { const a = window.prompt(`${r.name}의 부계정 Riot ID (예: 닉네임#KR1)`); if (a) addAlt(r.name, a); }} title="같은 사람이 쓰는 다른 계정을 등록해두면, 그 계정으로 참가해도 전적이 합산됩니다." style={{ fontSize: 10, color: '#8B949E', background: 'transparent', border: '1px dashed #333B45', borderRadius: 999, padding: '2px 8px', cursor: 'pointer' }}>+ 부계정</button>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                {active?.currentTierIcon
                                  ? <img src={active.currentTierIcon} alt={active.currentTier || ''} title={active.currentTier || ''} style={{ width: 28, height: 28 }} />
                                  : <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }}>—</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {(st?.topAgents || []).map((a) => (
                                  <div key={a.agent} title={`${a.agent} ${a.pct}%`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none' }}>
                                    {a.icon ? <img src={a.icon} alt={a.agent} style={{ width: 26, height: 26, borderRadius: 6 }} /> : <div style={{ width: 26, height: 26, borderRadius: 6, background: '#252C34' }} />}
                                    <span style={{ fontSize: 9, color: '#8B949E' }}>{a.pct}%</span>
                                  </div>
                                ))}
                                {!st?.topAgents?.length && <span style={{ fontSize: 11, color: '#6B737C' }}>—</span>}
                              </div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13 }}>{st?.matches ? st.acs : '—'}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13 }}>{st?.matches ? `${st.hsPct}%` : '—'}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13 }}>{st?.matches ? st.kd : '—'}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13 }}>{st?.matches ? st.kills : '—'}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }}>{wr == null ? '—' : `${wr}%`}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {!!r.alts?.length && !used && (
                                  <select value={chosenAccount} onChange={(e) => setAltPick((m) => ({ ...m, [r.name]: e.target.value }))} title="이번엔 어느 계정으로 참가시킬지 선택" style={{ fontSize: 10, background: '#1B2027', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 6, padding: '2px 4px' }}>
                                    <option value={r.name}>본계정</option>
                                    {r.alts.map((a, i) => <option key={a} value={a}>부계정{r.alts.length > 1 ? i + 1 : ''}</option>)}
                                  </select>
                                )}
                                <button onClick={() => (used ? unpickMember(activeAccount) : pickMember(chosenAccount, r.pos, r.realName))} style={{ background: used ? 'rgba(255,75,87,.12)' : '#252C34', color: used ? '#FF4B57' : '#C8D0D8', border: `1px solid ${used ? 'rgba(255,75,87,.4)' : '#333B45'}`, borderRadius: 8, padding: '7px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{used ? '등록됨' : '참가자로 등록'}</button>
                              </div>
                              <button onClick={() => persistRoster(roster.filter((x) => x.name !== r.name))} style={{ background: 'transparent', border: 'none', color: '#6B737C', fontSize: 15, cursor: 'pointer', padding: '2px 6px', justifySelf: 'end' }}>×</button>
                            </div>
                          );
                        })}
                        {!roster.length && <div style={{ fontSize: 12, color: '#8B949E', padding: '8px 2px' }}>명단이 비어 있습니다. 자주 하는 사람을 등록해두면 다음 내전부터 한 번에 불러올 수 있습니다.</div>}
                      </div>
                    </div>
                  </div>

                  {!!roster.length && (
                    <button onClick={fillFromRoster} style={{ marginTop: 14, width: '100%', background: '#FF4B57', color: '#0B0D10', border: 'none', borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>명단에서 참가자 빈 칸 자동 채우기</button>
                  )}
                </div>
              </div>
            )}

            {playersTab === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={h1}>참가자 등록</div>
                    <div style={sub}>"인원 관리" 탭에서 등록한 사람만 여기 들어옵니다 (직접 입력 불가). 등록되면 최근 30경기 사용 요원 통계로 포지션이 자동으로 채워지고, 가장 많이 쓴 요원 3개도 함께 표시됩니다 (포지션은 직접 바꿔도 됩니다).</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={lookupAll} disabled={players.some((p) => p.loading)} style={{ background: '#1B2027', color: '#E8EAEC', border: '1px solid #333B45', borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600, cursor: players.some((p) => p.loading) ? 'default' : 'pointer', opacity: players.some((p) => p.loading) ? .6 : 1 }}>전체 티어 조회</button>
                    <button onClick={balance} style={{ background: '#FF4B57', color: '#0B0D10', border: 'none', borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>5:5 자동 밸런싱</button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: '#14181D', border: '1px solid #262C34', borderRadius: 14, padding: '12px 14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={usePosition} onChange={(e) => setUsePosition(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#FF4B57', cursor: 'pointer' }} />
                    <span>포지션도 고려해서 밸런싱</span>
                  </label>
                  <div style={{ fontSize: 12, color: '#8B949E' }}>{usePosition ? '티어 차이 + 포지션 중복 페널티를 함께 계산합니다.' : '티어만 기준으로 그리디 배분합니다.'}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E' }}>
                    {apiSource === 'api' ? 'HenrikDev API 연결됨' : apiSource === 'error' ? 'HenrikDev API 조회 실패' : '/api/rank 대기'}
                  </div>
                </div>

                {(() => {
                  const groupColorOf = {};
                  let colorN = 0;
                  players.forEach((p) => { if (p.groupId && !(p.groupId in groupColorOf)) { groupColorOf[p.groupId] = GROUP_COLORS[colorN % GROUP_COLORS.length]; colorN++; } });
                  return (
                <>
                {groupPick.length >= 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#14181D', border: '1px solid #262C34', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: '#C6CDD4' }}>{groupPick.length}명 선택됨 — 같은 팀에 묶어서 배분합니다.</div>
                    <button onClick={() => { groupSelected(groupPick); setGroupPick([]); }} style={{ background: '#FF4B57', color: '#0B0D10', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>같은 팀으로 묶기</button>
                    <button onClick={() => setGroupPick([])} style={{ background: 'transparent', border: '1px solid #333B45', color: '#8B949E', borderRadius: 9, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>선택 취소</button>
                  </div>
                )}
                {!!Object.keys(groupColorOf).length && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(groupColorOf).map(([gid, color]) => (
                      <div key={gid} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#14181D', border: `1px solid ${color}55`, borderRadius: 999, padding: '6px 10px', fontSize: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: 'none' }} />
                        <span style={{ color: '#C6CDD4' }}>{players.filter((p) => p.groupId === gid).map((p) => p.name).join(', ')}</span>
                        <button onClick={() => ungroup(gid)} title="묶음 해제" style={{ background: 'transparent', border: 'none', color: '#6B737C', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div data-scrollx="1" style={{ ...card, padding: 8 }}>
                  <div style={{ minWidth: 720, display: 'grid', gridTemplateColumns: playerGrid, gap: 10, padding: '10px 14px', fontSize: 11, color: '#8B949E', letterSpacing: '.06em' }}>
                    <div>#</div><div>RIOT ID</div><div>주 사용 요원</div><div>포지션</div><div>최고 티어</div><div>현재 티어</div><div>승률</div><div>조회</div>
                  </div>
                  <div style={{ minWidth: 720, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {players.map((p, i) => {
                      const seasonIdx = seasonTierIdx(p);
                      const t = tierPill(seasonIdx);
                      const seasonIcon = seasonIdx != null ? p.currentTierIcon : null;
                      // Records are stored under the canonical (main) account
                      // — if today's registration used a 부계정, p.name here
                      // is the alt, which never has its own record entry.
                      const wr = winrate(canonicalName(p.name.trim()));
                      const groupColor = p.groupId ? groupColorOf[p.groupId] : null;
                      return (
                        <div key={i} data-row="1" style={{ display: 'grid', gridTemplateColumns: playerGrid, gap: 10, alignItems: 'center', background: '#1B2027', border: `1px solid ${groupColor || (p.tier == null ? '#262C34' : 'rgba(200,242,76,.22)')}`, borderRadius: 12, padding: '8px 14px', animation: 'fadeUp .4s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${i * 35}ms` }}>
                          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#8B949E' }}>{String(i + 1).padStart(2, '0')}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            {!!p.name && (
                              <input type="checkbox" checked={groupPick.includes(i)} onChange={() => setGroupPick((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]))} title="같은 팀으로 묶을 사람 선택" style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#FF4B57', flex: 'none' }} />
                            )}
                            {!!groupColor && <span title="같은 팀으로 묶임" style={{ width: 8, height: 8, borderRadius: 999, background: groupColor, flex: 'none' }} />}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: p.name ? '#E8EAEC' : '#6B737C' }}>{p.name || '빈 칸 — 인원 관리에서 등록'}</div>
                              {!!p.realName && <div style={{ fontSize: 10, color: '#6B737C' }}>{p.realName}</div>}
                            </div>
                            {!!p.name && (
                              <button onClick={() => { setPlayers((arr) => cleanupGroups(arr.map((x, k) => (k === i ? { name: '', pos: '미정', tier: null, source: null, loading: false, realName: '', groupId: null } : x)))); setGroupPick((g) => g.filter((x) => x !== i)); }} title="참가자에서 제거" style={{ background: 'transparent', border: 'none', color: '#6B737C', fontSize: 14, cursor: 'pointer', padding: '2px 4px', flex: 'none' }}>×</button>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                            {(p.agents || []).map((a) => (
                              <div key={a.agent} title={`${a.agent} ${a.pct}%`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none' }}>
                                {a.icon
                                  ? <img src={a.icon} alt={a.agent} style={{ width: 30, height: 30, borderRadius: 7 }} />
                                  : <div style={{ width: 30, height: 30, borderRadius: 7, background: '#252C34' }} />}
                                <span style={{ fontSize: 11, color: '#8B949E' }}>{a.pct}%</span>
                              </div>
                            ))}
                            {!(p.agents && p.agents.length) && <span style={{ fontSize: 12, color: '#6B737C' }}>—</span>}
                          </div>
                          <select value={p.pos} onChange={(e) => setPlayers((arr) => arr.map((x, k) => (k === i ? { ...x, pos: e.target.value } : x)))} style={{ ...input, padding: '9px 10px', cursor: 'pointer' }}>
                            {POSITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.loading ? (
                              <span style={{ fontSize: 12, color: '#8B949E' }}>조회중…</span>
                            ) : seasonIcon ? (
                              <><img src={seasonIcon} alt={t.label} title={t.label} style={{ width: 28, height: 28 }} /><span style={{ fontSize: 12, color: '#C6CDD4' }}>{t.label}</span></>
                            ) : p.source === 'error' ? (
                              <span style={{ fontSize: 11, color: '#E1424F' }} title={p.rankError || ''}>
                                {p.rankError === 'rate_limited' ? 'API 요청 제한' : p.rankError === 'key_missing' ? 'API 키 미설정' : p.rankError === 'not_found' ? '계정을 찾을 수 없음' : 'API 조회 실패'}
                              </span>
                            ) : (
                              <span style={t.style}>{t.label}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.loading ? (
                              <span style={{ fontSize: 12, color: '#8B949E' }}>조회중…</span>
                            ) : p.currentTierIcon && p.currentTier ? (
                              <><img src={p.currentTierIcon} alt={p.currentTier} title={p.currentTier} style={{ width: 28, height: 28 }} /><span style={{ fontSize: 12, color: '#C6CDD4' }}>{p.currentTier}</span></>
                            ) : (
                              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }}>언랭</span>
                            )}
                          </div>
                          <div style={wr == null
                            ? { fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }
                            : { display: 'inline-block', textAlign: 'center', fontFamily: "'IBM Plex Mono'", fontSize: 12, fontWeight: 600, color: '#0B0D10', background: wr >= 50 ? '#C8F24C' : '#E1424F', borderRadius: 999, padding: '4px 9px' }}>
                            {wr == null ? '—' : `${wr}%`}
                          </div>
                          {!!p.name && (
                            <button onClick={() => lookup(i)} disabled={p.loading} style={{ background: '#252C34', color: p.loading ? '#8B949E' : '#C8D0D8', border: '1px solid #333B45', borderRadius: 9, padding: '8px 0', fontSize: 12, cursor: p.loading ? 'default' : 'pointer', opacity: p.loading ? .6 : 1 }}>{p.tier == null ? '티어 조회' : '다시 조회'}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                </>
                  );
                })()}
              </div>
            )}
              </div>
            )}

            {/* BALANCE */}
            {screen === 'balance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={h1}>팀 밸런싱</div>
                    <div style={sub}>{teams ? `이번 시즌 티어(없으면 최고 티어) + K:D 반영 그리디 배분${usePosition ? ' + 포지션 분산' : ''} 결과입니다.` : '먼저 참가자를 등록하세요.'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={rebalance} style={{ background: '#1B2027', color: '#E8EAEC', border: '1px solid #333B45', borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>다시 배분</button>
                    <button onClick={() => setScreen('setup')} style={{ background: '#FF4B57', color: '#0B0D10', border: 'none', borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>매치 설정으로</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#8B949E' }}>선수 카드를 두 번 클릭해 수동 스왑할 수 있습니다. {sel ? '선택됨 — 교체할 선수를 클릭하세요.' : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
                  {[['A', '팀 A', '#FF4B57'], ['B', '팀 B', '#2FD3B7']].map(([k, label, color]) => {
                    const list = teams?.[k] || [];
                    const avg = list.length ? list.reduce((a, p) => a + (p.tier ?? 0), 0) / list.length : 0;
                    const counts = {};
                    list.forEach((p) => { if (p.pos !== '미정') counts[p.pos] = (counts[p.pos] || 0) + 1; });
                    const dupes = Object.keys(counts).filter((x) => counts[x] >= 3 && x !== '플렉스');
                    return (
                      <div key={k} style={{ ...card, border: `1px solid ${color}35` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                            <span style={{ fontFamily: "'Archivo'", fontWeight: 700, fontSize: 20 }}>{label}</span>
                          </div>
                          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: '#8B949E' }}>평균 {list.length ? TIERS[Math.round(avg)]?.label : '—'}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {list.map((p, idx) => {
                            const active = sel?.team === k && sel?.idx === idx;
                            const t = tierPill(p.tier, true);
                            return (
                              <div key={idx} data-row="1" onClick={() => clickPlayer(k, idx)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: active ? '#2A313A' : '#1B2027', border: `1px solid ${active ? color : '#262C34'}`, borderRadius: 12, padding: '11px 14px', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                  <div style={{ fontSize: 11, color: '#8B949E' }}>{p.pos}</div>
                                </div>
                                {/* peakTierIcon: teams balanced before tiers switched to this season */}
                                {(p.tierIcon || p.peakTierIcon) ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                                    <img src={p.tierIcon || p.peakTierIcon} alt={t.label} title={t.label} style={{ width: 26, height: 26 }} />
                                    <span style={{ fontSize: 12, color: '#C6CDD4', whiteSpace: 'nowrap' }}>{t.label}</span>
                                  </div>
                                ) : (
                                  <div style={t.style}>{t.label}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {!!dupes.length && (
                          <div style={{ marginTop: 14, fontSize: 12, color: '#E5C04C', background: '#E5C04C14', border: '1px solid #E5C04C33', borderRadius: 10, padding: '10px 12px' }}>
                            {dupes.join('/')} 포지션이 {counts[dupes[0]]}명입니다. 역할 조정을 참고하세요.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SETUP */}
            {screen === 'setup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div>
                  <div style={h1}>매치 설정</div>
                  <div style={sub}>경기 방식과 맵 풀을 정하고, 양 팀 주장이 토큰을 발급받으면 밴픽이 시작됩니다.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
                  <div style={card}>
                    {!!bp && (
                      <div style={{ fontSize: 12, color: '#E5C04C', background: '#E5C04C14', border: '1px solid #E5C04C33', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
                        {finished
                          ? '밴픽이 이미 끝났어요 — 경기 방식/맵 풀을 바꾸면 이 결과가 지워집니다. 다음 매치를 준비하려면 먼저 방을 초기화하세요.'
                          : '밴픽이 진행 중이라 경기 방식/맵 풀을 바꿀 수 없습니다 — 바꾸면 진행 중인 밴픽이 초기화됩니다. 먼저 밴픽을 끝내거나 방을 초기화하세요.'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#8B949E', letterSpacing: '.05em', marginBottom: 12 }}>경기 방식</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                      {['BO3', 'BO5'].map((v) => (
                        <button key={v} disabled={!!bp} onClick={() => { if (bp) return; setSeries(v); setBp(null); }} style={{ ...boxBtn(series === v), opacity: bp ? .5 : 1, cursor: bp ? 'not-allowed' : 'pointer' }}>{v}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#8B949E', letterSpacing: '.05em', marginBottom: 12 }}>맵 풀</div>
                    <button disabled={!!bp} onClick={() => { if (!bp) setPoolPickerOpen((v) => !v); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: '#1B2027', border: '1px solid #333B45', borderRadius: 12, padding: '12px 14px', color: '#E8EAEC', fontSize: 13, fontWeight: 600, cursor: bp ? 'not-allowed' : 'pointer', opacity: bp ? .5 : 1 }}>
                      <span>{pool.length}개 선택됨</span>
                      <span style={{ color: '#8B949E', fontSize: 11, transition: 'transform .2s', transform: poolPickerOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                    </button>
                    {!poolPickerOpen && !!pool.length && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {pool.map((m) => (
                          <span key={m} style={{ fontSize: 11, color: '#8B949E', background: '#1B2027', border: '1px solid #262C34', borderRadius: 999, padding: '4px 10px' }}>{m}</span>
                        ))}
                      </div>
                    )}
                    {poolPickerOpen && !bp && (
                      <div style={{ border: '1px solid #262C34', borderRadius: 12, padding: 12, marginTop: 10, background: '#14181D' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <button onClick={() => { setPoolLocal(ROTATION); setBp(null); }} style={boxBtn(false)}>맵풀로 설정</button>
                          <button onClick={() => { setPoolLocal(ALL_MAPS); setBp(null); }} style={boxBtn(false)}>전체 맵으로 설정</button>
                        </div>
                        {isAdmin ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {ALL_MAPS.map((m) => {
                              const active = pool.includes(m);
                              return (
                                <button key={m} onClick={() => { setPoolLocal((p) => active ? p.filter((x) => x !== m) : [...p, m]); setBp(null); }} style={boxBtn(active)}>{m}</button>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#6B737C' }}>맵풀에 어떤 맵을 넣을지는 관리자만 세부적으로 바꿀 수 있어요. 위 두 버튼으로 이번 매치에 전체 맵을 쓸지 맵풀을 쓸지는 누구나 고를 수 있습니다.</div>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#8B949E', marginTop: 14 }}>전체 맵 / 맵풀 중 어느 걸 쓸지는 누구나 고를 수 있고, 맵풀 세부 구성은 관리자만 바꿀 수 있습니다. 데사이더까지 진행하려면 최소 {minPoolSize}개가 필요합니다.</div>
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: 12, color: '#8B949E', letterSpacing: '.05em', marginBottom: 12 }}>주장 참가</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[['A', '팀 A 주장', '#FF4B57'], ['B', '팀 B 주장', '#2FD3B7']].map(([k, label, color]) => {
                        const taken = !!captains[k];
                        const mine = taken && myCaptainTokens[k] === captains[k];
                        const canCancel = mine && myRole === k;
                        return (
                          <div key={k} style={{ background: '#1B2027', border: '1px solid #262C34', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E' }}>{taken ? `토큰 ${captains[k]}${mine ? ' (나)' : ''}` : '미참가 — 관전 모드'}</div>
                            </div>
                            <button onClick={() => joinCaptain(k)} disabled={taken && !mine} title={canCancel ? '다시 누르면 참가를 취소합니다' : ''} style={{
                              borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                              cursor: taken && !mine ? 'default' : 'pointer',
                              border: canCancel ? '1px solid #E1424F' : 'none',
                              opacity: taken && !mine ? .6 : 1,
                              background: canCancel ? 'transparent' : taken ? (mine ? color : '#252C34') : color,
                              color: canCancel ? '#E1424F' : taken ? (mine ? '#0B0D10' : '#6B737C') : '#0B0D10'
                            }}>
                              {taken ? (mine ? (canCancel ? '참가 취소' : '내 차례 대기') : '다른 사람이 참가함') : '이 팀 주장으로 참가'}
                            </button>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 12, color: '#8B949E', textWrap: 'pretty' }}>토큰을 발급받은 주장만 자기 차례에 밴픽할 수 있고, 나머지 참가자는 관전 모드로 진행 상황만 봅니다.</div>
                      <button onClick={startBanpick} disabled={!canStart} style={{ marginTop: 4, borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, border: 'none', cursor: canStart ? 'pointer' : 'not-allowed', background: canStart ? '#C8F24C' : '#252C34', color: canStart ? '#0B0D10' : '#6B737C' }}>
                        {canStart ? '밴픽 시작'
                          : bp ? '이미 밴픽이 시작됨 — 방 초기화 후 다시 시작하세요'
                          : !poolReady ? `맵 ${minPoolSize}개 이상이 필요합니다`
                          : (!captains.A || !captains.B) ? '주장 2명이 필요합니다'
                          : '먼저 "5:5 자동 밸런싱"을 진행하세요'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BANPICK — not ready yet (no session started, and match setup
                isn't done: captains haven't both joined, or balancing hasn't
                been run) — nudge back to 매치 설정 instead of showing an
                empty/half-set-up banpick screen. Once bp exists, keep showing
                it here regardless of captains/teams so mid-banpick state
                never disappears just because something else changed. */}
            {screen === 'banpick' && !bp && !(captains.A && captains.B && teams) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ ...card, textAlign: 'center', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 22 }}>밴픽 준비가 안 됐어요</div>
                  <div style={{ fontSize: 13, color: '#8B949E', maxWidth: 420, textWrap: 'pretty' }}>
                    먼저 "매치 설정"에서 5:5 자동 밸런싱을 마치고, 양 팀 주장이 참가해야 밴픽을 시작할 수 있어요.
                  </div>
                  <button onClick={() => setScreen('setup')} style={{ marginTop: 6, borderRadius: 12, padding: '12px 22px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#FF4B57', color: '#0B0D10' }}>매치 설정으로</button>
                </div>
              </div>
            )}
            {screen === 'banpick' && (bp || (captains.A && captains.B && teams)) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(20px,4.5vw,26px)' }}>
                      {finished ? '밴픽 완료' : pendingShow ? '진영 선택' : step ? `${step[0] === 'decider' ? '데사이더' : `${teamName(step[1])} ${step[0] === 'ban' ? '밴' : '픽'}`} 차례` : '밴픽 대기'}
                    </div>
                    <div style={{ fontSize: 13, color: '#8B949E' }}>
                      {finished ? (quickMsg || '경기가 끝나면 오른쪽 버튼으로 결과를 바로 저장하세요.') : myTurn ? '내 차례입니다. 맵 또는 진영을 선택하세요.' : '상대 주장의 선택을 기다리는 중 — 관전 모드'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {finished && <button onClick={quickImportLatest} disabled={quickImporting} style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: quickImporting ? 'default' : 'pointer', opacity: quickImporting ? .6 : 1, flex: 'none' }}>{quickImporting ? '불러오는 중…' : '내전 결과 불러오기'}</button>}
                    <div style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '8px 14px', background: myRole ? (myRole === 'A' ? '#FF4B5720' : '#2FD3B720') : '#1B2027', color: myRole ? (myRole === 'A' ? '#FF4B57' : '#2FD3B7') : '#8B949E', border: `1px solid ${myRole ? (myRole === 'A' ? '#FF4B5755' : '#2FD3B755') : '#262C34'}` }}>
                      {myRole ? teamName(myRole) + ' 주장' : '관전자'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {steps.map((st, i) => {
                    const done = bp ? i < bp.index : false;
                    const active = bp ? i === bp.index : false;
                    return (
                      <div key={i} style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '8px 14px', border: `1px solid ${active ? '#FF4B57' : '#262C34'}`, background: active ? '#FF4B5720' : done ? '#1B2027' : 'transparent', color: active ? '#FF4B57' : done ? '#8B949E' : '#4E565F' }}>
                        {i + 1}. {st[0] === 'decider' ? '데사이더' : `${teamName(st[1])} ${st[0] === 'ban' ? '밴' : '픽'}`}
                      </div>
                    );
                  })}
                </div>

                {finished && !!banpickSummary.length && (
                  <div data-scrollx="1" style={{ background: '#0F1318', border: '1px solid #262C34', borderRadius: 16, padding: 10 }}>
                    <div style={{ display: 'flex', minWidth: banpickSummary.length * 150, gap: 2 }}>
                      {banpickSummary.map((entry, i) => {
                        const { name, info } = entry;
                        const banned = info.status === 'ban';
                        const stepLabel = info.status === 'decider' ? 'DECIDER MAP' : `${teamName(info.by)} ${banned ? 'VETO' : 'SELECT'} MAP`;
                        const sideLabel = info.side ? `${teamName(info.sideBy)} PICKS ${info.side === 'attack' ? 'ATTACK' : 'DEFENSE'}` : '';
                        return (
                          <div key={name} style={{ flex: '1 1 0', minWidth: 140, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, letterSpacing: '.08em', textAlign: 'center', color: '#8B949E', padding: '8px 4px', background: '#161B21' }}>
                              {stepLabel}
                            </div>
                            <div style={{
                              position: 'relative', overflow: 'hidden', minHeight: 110, display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 6px',
                              backgroundImage: `linear-gradient(180deg,rgba(11,13,16,${banned ? .72 : .45}),rgba(11,13,16,${banned ? .82 : .78})), url(${MAP_IMG[name] || '/maps/ascent.png'})`,
                              backgroundSize: 'cover', backgroundPosition: 'center 30%',
                              filter: banned ? 'grayscale(1)' : 'none',
                              borderLeft: i === 0 ? 'none' : '1px solid #0B0D10'
                            }}>
                              {banned ? (
                                <>
                                  <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #2FD3B7', position: 'relative', flex: 'none' }}>
                                    <div style={{ position: 'absolute', top: '50%', left: -3, right: -3, height: 3, background: '#2FD3B7', transform: 'rotate(45deg)' }} />
                                  </div>
                                  <div style={{ fontFamily: "'Archivo'", fontWeight: 700, fontSize: 13, color: '#8B949E', textDecoration: 'line-through' }}>{name}</div>
                                </>
                              ) : (
                                <>
                                  <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 17, textAlign: 'center' }}>{name}</div>
                                  {!!sideLabel && (
                                    <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, letterSpacing: '.05em', color: '#C8F24C', textAlign: 'center' }}>{sideLabel}</div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {deciderAnimating && bp?.deciderRoll && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(9,11,13,.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: 24 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 15, letterSpacing: '.2em', color: '#E5C04C', animation: 'pulseDot 1s ease-in-out infinite' }}>🎲 데사이더 맵 추첨 중</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(bp.deciderRoll.candidates.length, 4)},1fr)`, gap: 20, width: '100%', maxWidth: 980 }}>
                      {bp.deciderRoll.candidates.map((m) => {
                        const hit = deciderDisplay === m;
                        return (
                          <div key={m} style={{
                            position: 'relative', overflow: 'hidden', minHeight: 220, borderRadius: 20,
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 18,
                            border: `3px solid ${hit ? '#E5C04C' : '#262C34'}`,
                            boxShadow: hit ? '0 0 0 6px #E5C04C33, 0 0 50px #E5C04C77' : 'none',
                            // Same darkness on every tile at all times — only the
                            // glow/border/scale moves between candidates, instead
                            // of each tile also flatly darkening/lightening as the
                            // highlight lands on or leaves it. A touch slower
                            // transition than the fastest ticks so consecutive
                            // highlights blend into a moving glow rather than
                            // snapping between two states.
                            backgroundImage: `linear-gradient(180deg,rgba(11,13,16,.55),rgba(11,13,16,.8)), url(${MAP_IMG[m] || '/maps/ascent.png'})`,
                            backgroundSize: 'cover', backgroundPosition: 'center 30%',
                            transform: hit ? 'scale(1.05)' : 'scale(1)',
                            transition: 'transform .16s ease-out, box-shadow .16s ease-out, border-color .16s ease-out'
                          }}>
                            <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 28, color: hit ? '#E5C04C' : '#E8EAEC', transition: 'color .16s ease-out' }}>{m}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pendingShow && !deciderAnimating && (
                  <div style={{ background: '#1B2027', border: '1px solid #FF4B57', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14 }}>{bp.pending.map} — {teamName(bp.pending.chooser)}가 진영을 선택합니다.{myTurn ? '' : ' (관전)'}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['attack', '공격'], ['defense', '수비']].map(([v, label]) => (
                        <button key={v} onClick={() => chooseSide(v)} style={{ borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, border: 'none', cursor: myTurn ? 'pointer' : 'default', background: myTurn ? '#FF4B57' : '#252C34', color: myTurn ? '#0B0D10' : '#6B737C' }}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {!!selectedMap && !pendingShow && !deciderAnimating && (
                  <div style={{ background: '#1B2027', border: '1px solid #C8F24C', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14 }}>{selectedMap} 맵을 {step?.[0] === 'ban' ? '밴' : '픽'}하시겠습니까?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setSelectedMap(null)} style={{ borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, border: '1px solid #333B45', cursor: 'pointer', background: 'transparent', color: '#C6CDD4' }}>취소</button>
                      <button onClick={() => { clickMap(selectedMap); setSelectedMap(null); }} style={{ borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#C8F24C', color: '#0B0D10' }}>확인</button>
                    </div>
                  </div>
                )}

                {!finished && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                  {pool.map((m, mi) => {
                    const info = bp?.maps[m];
                    const hideDecider = deciderAnimating && info?.status === 'decider';
                    const st = hideDecider ? 'open' : info ? info.status : 'open';
                    const color = st === 'ban' ? '#E1424F' : st === 'pick' ? '#C8F24C' : st === 'decider' ? '#E5C04C' : '#8B949E';
                    const clickable = bp && step && step[0] !== 'decider' && !bp.pending && myRole === step[1] && !info;
                    const staged = selectedMap === m;
                    const overlay = st === 'ban' ? 'rgba(24,17,20,.86),rgba(24,17,20,.94)' : st === 'pick' ? 'rgba(15,22,16,.6),rgba(11,13,16,.85)' : 'rgba(11,13,16,.5),rgba(11,13,16,.8)';
                    return (
                      <div key={m} data-tile="1" onClick={() => { if (clickable) setSelectedMap(staged ? null : m); }} style={{
                        position: 'relative', overflow: 'hidden', minHeight: 150, display: 'flex', flexDirection: 'column',
                        justifyContent: 'space-between', gap: 14, padding: 16, borderRadius: 16,
                        cursor: clickable ? 'pointer' : 'default', border: `${staged ? 2 : 1}px solid ${staged ? '#C8F24C' : info ? color + '4D' : '#262C34'}`,
                        boxShadow: staged ? '0 0 0 3px #C8F24C33' : 'none',
                        backgroundImage: `linear-gradient(180deg,${overlay}), url(${MAP_IMG[m] || '/maps/ascent.png'})`,
                        backgroundSize: 'cover', backgroundPosition: 'center 30%',
                        filter: st === 'ban' ? 'grayscale(1)' : 'none', opacity: st === 'ban' ? .55 : 1,
                        animation: 'popIn .5s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${mi * 55}ms`
                      }}>
                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#C6CDD4' }}>{info && !hideDecider ? `STEP ${info.order}` : 'OPEN'}</div>
                          <div style={{ fontFamily: "'Archivo'", fontWeight: 700, fontSize: 22 }}>{m}</div>
                        </div>
                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: staged ? '#C8F24C' : color }}>
                            {staged ? '선택됨 — 확인 대기' : st === 'ban' ? `${teamName(info.by)} 밴` : st === 'pick' ? `${teamName(info.by)} 픽` : st === 'decider' ? '데사이더' : '선택 가능'}
                          </div>
                          <div style={{ fontSize: 11, color: '#C6CDD4' }}>{info?.side ? `${info.side === 'attack' ? '공격' : '수비'} 선택: ${teamName(info.sideBy)}` : ' '}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {/* STATS */}
            {screen === 'clips' && <ClipsScreen isAdmin={isAdmin} adminHeaders={adminHeaders} input={input} pill={pill} />}

            {screen === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both' }}>
                <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid #262C34', borderRadius: 22, padding: '30px 28px 24px', background: 'radial-gradient(1200px 300px at 12% 0%, #2A1B22 0%, #14181D 62%)' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.028) 0 12px,rgba(0,0,0,0) 12px 26px)' }} />
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '38%', height: '100%', background: 'linear-gradient(90deg,rgba(255,75,87,0) 0%,rgba(255,75,87,.1) 50%,rgba(255,75,87,0) 100%)', animation: 'sweep 5.5s linear infinite' }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.14em', color: '#FF4B57', marginBottom: 10 }}>ALL-TIME RECORDS</div>
                      <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 'clamp(34px,7vw,56px)', lineHeight: 1, letterSpacing: '-.02em', animation: 'revealMask .7s cubic-bezier(.2,.7,.3,1) both' }}>전체 전적</div>
                      <div style={{ fontSize: 13, color: '#A8B0B9', marginTop: 10, maxWidth: 520 }}>Riot ID 기준으로 방을 넘어 누적된 순위표입니다. 행을 클릭하면 최근 경기와 티어 스냅샷이 보입니다.</div>
                    </div>
                    <div className="statTiles" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {[
                        ['등록 선수', `${rankedBoard.length}명`],
                        ['누적 경기', String(totalMatchCount)],
                        ['최고 승률', `${rankedBoard.length ? Math.max(...rankedBoard.map((x) => x.rate)) : 0}%`]
                      ].map(([label, value], i) => (
                        <div key={label} className="statTile" data-lift="1" style={{ minWidth: 130, background: 'rgba(20,24,29,.72)', border: '1px solid #2C333C', borderRadius: 16, padding: '14px 18px', animation: 'fadeUp .5s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${i * 90 + 120}ms` }}>
                          <div style={{ fontSize: 11, color: '#8B949E', letterSpacing: '.06em' }}>{label}</div>
                          <div className="statValue" style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 30, marginTop: 6 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ background: '#14181D', border: '1px solid #2C333C', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>방금 끝난 내전 저장</div>
                    <div style={{ fontSize: 12, color: quickMsg ? '#E5C04C' : '#8B949E', marginTop: 3 }}>{quickMsg || '경기가 끝나면 버튼 한 번으로 최근 12시간 안의 내전 결과를 Riot 기록에서 가져와 저장합니다.'}</div>
                  </div>
                  <button onClick={quickImportLatest} disabled={quickImporting} style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: quickImporting ? 'default' : 'pointer', opacity: quickImporting ? .6 : 1, flex: 'none' }}>{quickImporting ? '불러오는 중…' : '내전 결과 불러오기'}</button>
                </div>

                {isAdmin && (
                  <div style={{ background: '#14181D', border: '1px dashed #2C333C', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>과거 내전 불러오기</div>
                      <div style={{ fontSize: 12, color: '#8B949E', marginTop: 3 }}>이 웹을 쓰기 전에 했던 내전도 Riot API 기록에서 찾아 전적에 추가할 수 있어요. 명단에 있는 사람 중 한 명을 기준으로 최근 50경기까지 뒤져서, 명단과 겹치는 내전만 골라줍니다.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select value={pastAnchor} onChange={(e) => setPastAnchor(e.target.value)} style={{ ...input, borderRadius: 10, padding: '10px 12px', flex: '1 1 220px', minWidth: 180, width: 'auto' }}>
                        <option value="">기준 선수 선택… (부계정으로도 조회 가능)</option>
                        {roster.filter((r) => r.name.includes('#')).map((r) => (
                          <optgroup key={r.name} label={r.name}>
                            <option value={r.name}>{r.name} (본계정)</option>
                            {(r.alts || []).filter((a) => a.includes('#')).map((a) => <option key={a} value={a}>{a} (부계정)</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <button onClick={scanPastCustoms} disabled={pastScanning || !pastAnchor} style={{ background: '#252C34', color: '#C8D0D8', border: '1px solid #333B45', borderRadius: 10, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: pastScanning || !pastAnchor ? 'default' : 'pointer', opacity: pastScanning || !pastAnchor ? .6 : 1 }}>{pastScanning ? '조회중…' : '내전 기록 조회'}</button>
                    </div>
                    {!!pastMsg && <div style={{ fontSize: 12, color: '#E5C04C' }}>{pastMsg}</div>}
                    {!!pastCandidates?.length && (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                          {pastCandidates.map((m) => (
                            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1B2027', border: '1px solid #262C34', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={m.checked} onChange={() => togglePastCandidate(m.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#FF4B57', flex: 'none' }} />
                              <div style={{ fontSize: 11, color: '#8B949E', width: 90, flex: 'none' }}>{fmtDate(Date.parse(m.startedAt))}</div>
                              <div style={{ fontSize: 12, color: '#C6CDD4', width: 70, flex: 'none' }}>{m.koMap}</div>
                              <div style={{ fontSize: 12, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <span style={{ color: m.redRounds > m.blueRounds ? '#C8F24C' : '#C6CDD4' }}>{m.redPlayers.map((p) => p.name).join(', ')}</span>
                                <span style={{ color: '#6B737C' }}> {m.redRounds}:{m.blueRounds} </span>
                                <span style={{ color: m.blueRounds > m.redRounds ? '#C8F24C' : '#C6CDD4' }}>{m.bluePlayers.map((p) => p.name).join(', ')}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                        <button onClick={importSelectedPast} disabled={pastSaving || !pastCandidates.some((m) => m.checked)} style={{ background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: pastSaving ? 'default' : 'pointer', opacity: pastSaving ? .6 : 1 }}>{pastSaving ? '저장중…' : `선택한 ${pastCandidates.filter((m) => m.checked).length}경기 전적에 추가`}</button>
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['player', '선수별'], ['match', '경기별']].map(([k, label]) => (
                      <button key={k} onClick={() => setStatView(k)} style={{ ...pill(statView === k, '#FF4B57'), padding: '10px 18px' }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ width: 1, height: 20, background: '#2C333C', flex: 'none' }} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {statView === 'player' && [['rate', '승률순'], ['tier', '티어순'], ['kd', 'K/D순'], ['hsPct', '헤드샷률순'], ['assists', '어시스트순']].map(([k, label]) => (
                      <button key={k} onClick={() => setStatSort(k)} style={{ ...pill(statSort === k, '#C8F24C'), padding: '7px 14px', fontSize: 12 }}>{label}</button>
                    ))}
                    {statView === 'match' && [['newest', '최신순'], ['oldest', '오래된순']].map(([k, label]) => (
                      <button key={k} onClick={() => setMatchSort(k)} style={{ ...pill(matchSort === k, '#C8F24C'), padding: '7px 14px', fontSize: 12 }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ flex: '1 0 0', minWidth: 0 }} />
                  <input value={statQuery} onChange={(e) => setStatQuery(e.target.value)} placeholder="Riot ID 검색" style={{ background: '#14181D', border: '1px solid #2C333C', borderRadius: 999, padding: '11px 18px', color: '#E8EAEC', fontSize: 13, flex: '1 1 160px', minWidth: 0, maxWidth: 230 }} />
                </div>

                {statView === 'match' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {matchLog.map((mt) => {
                      const expanded = expandedMatch === mt.date;
                      const bg = MAP_IMG[mt.map] || MAP_IMG[String(mt.map).split(',')[0]?.trim()] || null;
                      // MVP: highest ACS across both teams (K/D breaks ties);
                      // matches entered by hand without stats have no MVP.
                      const mvp = [...mt.winners, ...mt.losers].filter((p) => p.acs != null).sort((a, b) => b.acs - a.acs || (b.kills / Math.max(b.deaths, 1)) - (a.kills / Math.max(a.deaths, 1)))[0] || null;
                      const row = (p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.agentIcon
                            ? <img src={p.agentIcon} alt={p.agent || ''} title={p.agent || ''} style={{ width: 30, height: 30, borderRadius: 7, flex: 'none' }} />
                            : <div style={{ width: 30, height: 30, borderRadius: 7, background: '#252C34', flex: 'none' }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{p.id}</div>
                              {mvp?.id === p.id && <span title="이 경기 최고 ACS" style={{ flex: 'none', fontFamily: "'Archivo'", fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: '#4A3200', background: 'linear-gradient(145deg,#FFE29A,#E8B23D)', borderRadius: 5, padding: '2px 5px' }}>MVP</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontFamily: "'IBM Plex Mono'", fontSize: 10, color: '#8B949E' }}>
                              {p.tierIcon && <img src={p.tierIcon} alt="" style={{ width: 13, height: 13, flex: 'none', marginTop: 1 }} />}
                              <span style={{ wordBreak: 'break-word' }}>{tierPill(p.tier).label}{p.agent ? ` · ${p.agent}` : ''}{p.kills != null ? ` · ${p.kills}/${p.deaths}/${p.assists} · ACS ${p.acs} · HS ${p.hsPct}%` : ''}</span>
                            </div>
                          </div>
                        </div>
                      );
                      return (
                        <div key={mt.date} data-lift="1" style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #262C34', animation: 'fadeUp .4s cubic-bezier(.2,.7,.3,1) both' }}>
                          <div
                            onClick={() => setExpandedMatch(expanded ? null : mt.date)}
                            style={{
                              position: 'relative', cursor: 'pointer', padding: '20px 18px', minHeight: 88, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4,
                              backgroundImage: `linear-gradient(180deg,rgba(11,13,16,.55),rgba(11,13,16,.82)), url(${bg || '/maps/ascent.png'})`,
                              backgroundSize: 'cover', backgroundPosition: 'center'
                            }}
                          >
                            <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 28, color: '#F5F7F9', letterSpacing: '-.02em' }}>{mt.score}</div>
                            <div style={{ fontSize: 11, color: '#C6CDD4', fontFamily: "'IBM Plex Mono'" }}>{mt.map} · {fmtDate(mt.date)}</div>
                            {mvp && <div style={{ fontSize: 11, color: '#FFD166', fontWeight: 600 }}>👑 MVP {mvp.id} · ACS {mvp.acs} · K/D {mvp.deaths ? (mvp.kills / mvp.deaths).toFixed(2) : mvp.kills}</div>}
                          </div>
                          {expanded && (
                            <div style={{ background: '#14181D', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#C8F24C', letterSpacing: '.06em' }}>승리</div>
                                  {mt.winners.map(row)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8B949E', letterSpacing: '.06em' }}>패배</div>
                                  {mt.losers.map(row)}
                                </div>
                              </div>
                              {isAdmin && (
                                <button onClick={() => deleteRecord({ date: mt.date }, '이 경기를 모든 선수의 전적에서 삭제할까요?')} style={{ alignSelf: 'flex-end', background: 'transparent', color: '#E1424F', border: '1px solid #E1424F66', borderRadius: 8, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>삭제</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!matchLog.length && <div style={{ padding: '34px 18px', fontSize: 13, color: '#8B949E' }}>아직 저장된 경기가 없습니다.</div>}
                  </div>
                )}

                {statView === 'player' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                  <div data-scrollx="1" className="boardContainer" style={{ flex: '1 1 560px', minWidth: 0, background: '#0F1318', border: '1px solid #262C34', borderRadius: 20, padding: 10 }}>
                    <div className="boardHeader boardTable" style={{ minWidth: 600, display: 'grid', gridTemplateColumns: boardGrid, gap: 8, padding: '12px 16px', fontSize: 11, color: '#8B949E', letterSpacing: '.06em' }}>
                      <div>PLAYER</div><div>티어</div><div>승률</div><div>승-패</div><div>경기</div><div>K/D</div><div>HS%</div>
                    </div>
                    <div className="boardTable" style={{ minWidth: 600, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {boardList.map((x, i) => {
                        const t = tierPill(x.tier);
                        const medal = x.rank != null && x.rank <= 3 ? [{ bg: 'linear-gradient(145deg,#FFE29A,#E8B23D)', fg: '#4A3200', ring: '#FFD166' }, { bg: 'linear-gradient(145deg,#EDF1F5,#B9C2CB)', fg: '#33393F', ring: '#C9D2DA' }, { bg: 'linear-gradient(145deg,#E7B27E,#B9722F)', fg: '#3B2410', ring: '#CD7F32' }][x.rank - 1] : null;
                        const selected = statId === x.id;
                        return (
                          <div key={x.id} data-row="1" className="boardRow" onClick={() => setStatId(x.id)} style={{ display: 'grid', gridTemplateColumns: boardGrid, gap: 8, alignItems: 'center', cursor: 'pointer', opacity: x.excluded ? .45 : 1, background: selected ? '#242B34' : '#1B2027', border: `1px solid ${selected ? '#FF4B5766' : medal ? medal.ring + '55' : '#262C34'}`, borderRadius: 14, padding: '12px 16px', animation: 'fadeUp .45s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${i * 55}ms` }}>
                            <div className="b-player" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 'none', position: 'relative' }}>
                                {x.rank === 1 && <span style={{ position: 'absolute', top: -15, fontSize: 15, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))', animation: 'floaty 2.6s ease-in-out infinite' }}>👑</span>}
                                {x.excluded
                                  ? <div title="순위 제외됨" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#8B949E' }}>제외</div>
                                  : medal
                                  ? <div title={x.tied ? `공동 ${x.rank}위` : `${x.rank}위`} style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo'", fontWeight: 800, fontSize: 13, color: medal.fg, background: medal.bg, boxShadow: `0 2px 8px ${medal.ring}55` }}>{x.rank}</div>
                                  : <div title={x.tied ? `공동 ${x.rank}위` : `${x.rank}위`} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo'", fontWeight: 800, fontSize: 15, color: '#5F6872' }}>{String(x.rank).padStart(2, '0')}</div>}
                                {x.tied && <span style={{ fontSize: 8, fontWeight: 700, color: '#8B949E', letterSpacing: '.03em' }}>공동</span>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                  <div title={x.id} style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{x.id}</div>
                                  {!!x.realName && <div style={{ flex: 'none', fontSize: 12, color: '#4C9AFF', whiteSpace: 'nowrap' }}>{x.realName}</div>}
                                </div>
                                <div style={{ fontSize: 11, color: '#8B949E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.games}경기 · {statSort === 'assists' ? <span style={{ color: '#C8F24C' }}>경기당 어시 {x.assists ?? '—'}</span> : <>최근 {x.lastDate ? fmtDate(x.lastDate) : '—'}</>}</div>
                              </div>
                            </div>
                            <div className="b-tier" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {x.tierIcon
                                ? <><img src={x.tierIcon} alt={t.label} title={t.label} style={{ width: 26, height: 26 }} /><span style={{ fontSize: 12, color: '#C6CDD4' }}>{t.label}</span></>
                                : <span style={t.style}>{t.label}</span>}
                            </div>
                            <div className="b-rate" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ position: 'relative', flex: 1, height: 6, borderRadius: 999, background: '#22282F', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', inset: 0, width: `${x.rate}%`, borderRadius: 999, transformOrigin: 'left', background: x.rate >= 50 ? 'linear-gradient(90deg,#8FBF2E,#C8F24C)' : 'linear-gradient(90deg,#8A2B33,#E1424F)', animation: 'growBar .6s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${i * 60}ms` }} />
                              </div>
                              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, fontWeight: 600, width: 44, textAlign: 'right', color: x.rate >= 50 ? '#C8F24C' : '#E1424F' }}>{x.rate}%</div>
                            </div>
                            <div className="b-wl" style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#C8D0D8' }}>{x.wins} - {x.losses}</div>
                            <div className="b-games" style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#8B949E' }}>{x.games}</div>
                            <div className="b-kd" style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#8B949E' }}>{x.kd ?? '—'}</div>
                            <div className="b-hs" style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#8B949E' }}>{x.hsPct != null ? `${x.hsPct}%` : '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                    {!boardList.length && <div style={{ padding: '34px 18px', fontSize: 13, color: '#8B949E' }}>아직 누적된 전적이 없습니다. 밴픽 후 결과를 입력하면 여기에 쌓입니다.</div>}
                  </div>

                  <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, animation: 'slideInR .5s cubic-bezier(.2,.7,.3,1) both' }}>
                    {statRec ? (
                      <>
                        <div data-lift="1" style={{ position: 'relative', overflow: 'hidden', background: '#14181D', border: '1px solid #FF4B5735', borderRadius: 20, padding: 20 }}>
                          <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,75,87,.12)', filter: 'blur(6px)' }} />
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo'", fontWeight: 800, fontSize: 20, color: '#0B0D10', background: '#FF4B57', animation: 'glowPulse 3.4s ease-in-out infinite' }}>{statId.slice(0, 1).toUpperCase()}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, wordBreak: 'break-all' }}>{statId}</div>
                              <div style={{ fontSize: 12, color: '#8B949E' }}>{statTotal}경기 · 최근 {statLast ? fmtDate(statLast.date) : '—'}</div>
                            </div>
                            {isAdmin && <button onClick={() => setExcluded(statId, !excludedIds.includes(statId))} style={{ marginLeft: 'auto', flex: 'none', background: 'transparent', color: excludedIds.includes(statId) ? '#C8F24C' : '#E5C04C', border: `1px solid ${excludedIds.includes(statId) ? '#C8F24C66' : '#E5C04C66'}`, borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>{excludedIds.includes(statId) ? '순위 복원' : '순위 제외'}</button>}
                            {isAdmin && <button onClick={() => deleteRecord({ id: statId }, `${statId}의 전적을 전부 삭제할까요?`)} style={{ flex: 'none', background: 'transparent', color: '#E1424F', border: '1px solid #E1424F66', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>선수 전적 삭제</button>}
                          </div>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 11, color: '#8B949E', letterSpacing: '.06em' }}>승률</div>
                              <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 44, lineHeight: 1, color: '#C8F24C' }}>{statRate}%</div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8B949E' }}>
                                <span>{statRec.wins}승 {statRec.losses}패</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {statTier?.tierIcon && <img src={statTier.tierIcon} alt="" style={{ width: 16, height: 16 }} />}
                                  {tierPill(statTier?.tier).label}
                                </span>
                              </div>
                              <div style={{ position: 'relative', height: 8, borderRadius: 999, background: '#22282F', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', inset: 0, width: `${statRate}%`, borderRadius: 999, transformOrigin: 'left', background: 'linear-gradient(90deg,#8FBF2E,#C8F24C)', animation: 'growBar .7s cubic-bezier(.2,.7,.3,1) both' }} />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ ...card, borderRadius: 20, padding: 16 }}>
                          <div style={{ fontSize: 12, color: '#8B949E', letterSpacing: '.05em', marginBottom: 12 }}>최근 경기</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {(statRec.matches || []).slice().sort((a, b) => b.date - a.date).map((m, i) => (
                              <div key={i} data-row="1" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#1B2027', border: '1px solid #262C34', borderRadius: 12, padding: '11px 13px', animation: 'fadeUp .4s cubic-bezier(.2,.7,.3,1) both', animationDelay: `${i * 50}ms` }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 140px' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E' }}>
                                    <span>{fmtDate(m.date)} ·</span>
                                    {m.tierIcon && <img src={m.tierIcon} alt="" style={{ width: 14, height: 14 }} />}
                                    <span>{tierPill(m.tier).label}</span>
                                  </div>
                                  {m.kills != null && <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E', wordBreak: 'break-word' }}>{m.kills}/{m.deaths}/{m.assists} · ACS {m.acs} · HS {m.hsPct}%</div>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                                  <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: '#C8D0D8' }}>{m.score}</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 10px', color: '#0B0D10', background: m.result === '승' ? '#C8F24C' : '#E1424F' }}>{m.result}</div>
                                  {isAdmin && <button onClick={() => deleteRecord({ date: m.date }, '이 경기를 모든 선수의 전적에서 삭제할까요?')} style={{ background: 'transparent', color: '#E1424F', border: '1px solid #E1424F66', borderRadius: 8, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>삭제</button>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ background: '#14181D', border: '1px dashed #2C333C', borderRadius: 20, padding: '30px 22px', fontSize: 13, color: '#8B949E', textWrap: 'pretty' }}>왼쪽 순위표에서 선수를 선택하면 상세 전적이 표시됩니다.</div>
                    )}
                  </div>
                </div>}
              </div>
            )}
          </div>

          {/* right rail */}
          <div style={{ flex: '1 1 330px', minWidth: 270, display: 'flex', flexDirection: 'column', gap: 12, animation: 'slideInR .55s cubic-bezier(.2,.7,.3,1) both' }}>
            <div data-lift="1" style={{ ...glass, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -50, right: -30, width: 170, height: 170, borderRadius: '50%', background: 'rgba(255,75,87,.13)', filter: 'blur(8px)', animation: 'floaty 7s ease-in-out infinite' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>오늘의 내전</div>
                  <div style={{ fontSize: 11, color: '#8B949E', fontFamily: "'IBM Plex Mono'" }}>{fmtDate(Date.now())}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setScreen('balance')} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#C6CDD4', fontSize: 12, cursor: 'pointer' }}>⤢</button>
                  <button onClick={() => setScreen('setup')} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#C6CDD4', fontSize: 12, cursor: 'pointer' }}>⚙</button>
                </div>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
                {[['A', '팀 A', '#FF4B57'], ['B', '팀 B', '#2FD3B7']].map(([k, label, color]) => {
                  const list = teams?.[k] || [];
                  const avg = list.length ? Math.round(list.reduce((a, p) => a + (p.tier ?? 0), 0) / list.length) : null;
                  return (
                    <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo'", fontWeight: 800, fontSize: 20, color: '#0B0D10', background: color, boxShadow: '0 0 0 3px rgba(255,255,255,.08), 0 10px 24px rgba(0,0,0,.4)' }}>{k}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#8B949E', whiteSpace: 'nowrap' }}>{avg == null ? '미배정' : TIERS[avg]?.label}</div>
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#8B949E' }}>{series}</div>
                </div>
              </div>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(() => {
                  const stat = (k) => {
                    const list = teams?.[k] || [];
                    const avg = list.length ? list.reduce((a, p) => a + (p.tier ?? 0), 0) / list.length : 0;
                    const kd = list.length ? list.reduce((a, p) => {
                      const st = seasonStats[p.name];
                      return a + (st?.matches ? st.kd : 1);
                    }, 0) / list.length : 0;
                    return { avg, kd, n: list.length };
                  };
                  const A = stat('A'), B = stat('B');
                  const bar = (color, ratio) => ({ display: 'inline-block', width: 3, height: Math.max(8, Math.round(8 + ratio * 10)), borderRadius: 2, background: color });
                  const rows = [
                    ['평균 티어', A.n ? TIERS[Math.round(A.avg)]?.label.replace(/\s\d/, '') : '—', B.n ? TIERS[Math.round(B.avg)]?.label.replace(/\s\d/, '') : '—', A.avg / 24, B.avg / 24],
                    ['평균 K/D', A.n ? A.kd.toFixed(2) : '—', B.n ? B.kd.toFixed(2) : '—', Math.min(1, A.kd / 2), Math.min(1, B.kd / 2)],
                    ['인원', String(A.n), String(B.n), A.n / 5, B.n / 5]
                  ];
                  return rows.map(([label, aVal, bVal, aR, bR]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0,1fr) 54px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={bar('#FF4B57', aR)} />
                        <span style={{ color: '#E8EAEC', fontFamily: "'IBM Plex Mono'" }}>{aVal}</span>
                      </div>
                      <div style={{ textAlign: 'center', color: '#8B949E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ color: '#E8EAEC', fontFamily: "'IBM Plex Mono'" }}>{bVal}</span>
                        <span style={bar('#2FD3B7', bR)} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>자동 밸런싱 준비?</div>
                  <div style={{ fontSize: 11, color: '#8B949E' }}>{teams ? (usePosition ? '티어 + 포지션 반영됨' : '티어만 반영됨') : `${filled.length}명 등록 · 미배정`}</div>
                </div>
                <button onClick={balance} style={{ flex: 'none', background: '#C8F24C', color: '#0B0D10', border: 'none', borderRadius: 999, padding: '11px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', animation: 'glowPulse 3.6s ease-in-out infinite' }}>✦ 밸런싱</button>
              </div>
            </div>

            <div data-lift="1" style={{ background: 'rgba(240,240,244,.96)', borderRadius: 22, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15181C' }}>맵 밴픽 현황</div>
                <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#5E6570' }}>{bp ? `${Math.min(steps.length, bp.index)} / ${steps.length} 단계` : '대기'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                {pool.map((m) => {
                  const info = bp?.maps[m];
                  const st = info ? info.status : 'open';
                  const bg = st === 'ban' ? '#E1424F' : st === 'pick' ? '#1D2229' : st === 'decider' ? '#D8B24A' : '#E2E4E9';
                  const fg = st === 'ban' || st === 'pick' ? '#F5F6F8' : '#15181C';
                  return (
                    <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 14, padding: '11px 12px', background: bg, color: fg, opacity: st === 'ban' ? .75 : 1, transition: 'background .3s ease, opacity .3s ease' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{m}</div>
                      <div style={{ fontSize: 10, opacity: .85 }}>{st === 'ban' ? '밴' : st === 'pick' ? `팀 ${info.by} 픽` : st === 'decider' ? '데사이더' : '대기'}</div>
                      {!!info?.side && (
                        <div style={{ fontSize: 10, opacity: .85 }}>
                          {teamName(info.sideBy)} {info.side === 'attack' ? '공격' : '수비'} · {teamName(info.sideBy === 'A' ? 'B' : 'A')} {info.side === 'attack' ? '수비' : '공격'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                ['최고 승률', `${board.length ? Math.max(...board.map((x) => x.rate)) : 0}%`, '#C8F24C'],
                ['누적 경기', String(totalMatchCount), '#E8EAEC']
              ].map(([label, value, color]) => (
                <div key={label} data-lift="1" style={{ flex: '1 1 120px', minWidth: 120, background: 'rgba(16,20,25,.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 10 }}>{label}</div>
                  <div style={{ fontFamily: "'Archivo'", fontWeight: 800, fontSize: 30, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '26px 18px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'IBM Plex Mono'", fontSize: 11, letterSpacing: '.16em', color: '#5A626C' }}>
          <span style={{ width: 22, height: 1, background: '#2C333C' }} />
          <span>MADE BY 이현</span>
          <span style={{ width: 22, height: 1, background: '#2C333C' }} />
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#3E454E' }}>오류 및 버그 제보 atom11201202@gmail.com</div>
      </div>
    </div>
  );
}
