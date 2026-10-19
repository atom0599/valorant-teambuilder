// 라운드 단위 기록 — HenrikDev v4 경기 데이터(rounds[], kills[])에서 선수별로
// 센다. 내전을 불러올 때(app/api/customs)와 예전 경기를 다시 채울 때 같이 쓴다.
//   firstKills  : 라운드 첫 킬 (rounds[].first_blood)
//   firstDeaths : 라운드에서 가장 먼저 죽은 횟수 (kills[] 중 그 라운드 가장 이른 킬의 피해자)
//   plants / defuses : 스파이크 설치 / 해체
//   clutches    : 우리 팀에서 혼자 남았을 때 상대가 1명 이상 살아 있었고, 그 사람이
//                 상대를 다 잡거나 라운드가 끝날 때까지 살아서 이긴 횟수 (혼자 남은
//                 사람이 죽은 뒤 스파이크가 터져서 이긴 건 클러치가 아니다)
// 지금 화면에 쓰는 건 퍼스트 킬 / 퍼스트 데스뿐이지만, 나중에 다시 경기를
// 조회하지 않아도 되도록 같은 데이터에서 나오는 값을 함께 저장해 둔다.
export function roundStats(match) {
  const players = Array.isArray(match?.players) ? match.players : [];
  const rounds = Array.isArray(match?.rounds) ? match.rounds : [];
  const kills = Array.isArray(match?.kills) ? match.kills : [];
  const out = {};
  const blank = () => ({ firstKills: 0, firstDeaths: 0, plants: 0, defuses: 0, clutches: 0 });
  players.forEach((p) => { if (p?.puuid) out[p.puuid] = blank(); });
  const add = (puuid, key) => { if (puuid && out[puuid]) out[puuid][key] += 1; };
  const teamOf = Object.fromEntries(players.map((p) => [p.puuid, p.team_id]));

  const killsByRound = new Map();
  kills.forEach((k) => {
    const list = killsByRound.get(k.round) || [];
    list.push(k);
    killsByRound.set(k.round, list);
  });

  rounds.forEach((r, idx) => {
    const roundNo = r.id ?? idx;
    const list = (killsByRound.get(roundNo) || []).slice().sort((a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0));
    add(r.first_blood?.puuid || list[0]?.killer?.puuid, 'firstKills');
    add(list[0]?.victim?.puuid, 'firstDeaths');
    add(r.plant?.player?.puuid, 'plants');
    add(r.defuse?.player?.puuid, 'defuses');

    // 클러치: 킬 순서대로 생존자를 줄여 가며, 어느 팀이 1명만 남은 순간
    // 상대가 1명 이상 살아 있으면 그 1명을 클러치 후보로 둔다. 상대가 아직
    // 남아 있을 때 후보가 죽으면 무효. 그 팀이 라운드를 이기면 클러치 1회.
    // (상대를 다 잡은 뒤의 킬 — 라운드 끝난 뒤 스파이크 폭발 등 — 은 무시)
    const alive = { Red: new Set(), Blue: new Set() };
    players.forEach((p) => { if (alive[p.team_id]) alive[p.team_id].add(p.puuid); });
    const candidate = {};
    const check = () => ['Red', 'Blue'].forEach((t) => {
      const other = t === 'Red' ? 'Blue' : 'Red';
      if (!candidate[t] && alive[t].size === 1 && alive[other].size >= 1) candidate[t] = [...alive[t]][0];
    });
    list.forEach((k) => {
      const v = k.victim?.puuid;
      const t = teamOf[v];
      if (!t || !alive[t]) return;
      const other = t === 'Red' ? 'Blue' : 'Red';
      if (!alive[other].size) return;
      if (candidate[t] === v) candidate[t] = 'dead';
      alive[t].delete(v);
      check();
    });
    const c = candidate[r.winning_team];
    if (c && c !== 'dead') add(c, 'clutches');
  });
  return out;
}
