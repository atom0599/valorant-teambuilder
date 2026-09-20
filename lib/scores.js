// Round scores are edited by whoever is typing, while every client also pushes
// its whole room blob every ~3s. Plain last-write-wins let a stale push (an
// older, emptier copy of the scores) erase what was just typed. Each map's
// entry carries `t` (ms timestamp of its last edit) and merging keeps the
// newer entry per map, on both the server and the clients, so an old copy
// can never win over a newer edit.
export function mergeScores(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => {
    const mine = out[k];
    if (!mine || (b[k]?.t || 0) > (mine.t || 0)) out[k] = b[k];
  });
  return out;
}
