import { Player } from "./types";

// 최고 티어(peakTierValue) 내림차순으로 정렬한 뒤, 그 시점에 합계 티어가
// 더 낮은 팀에 한 명씩 배정하는 그리디 방식. 티어 정보가 없는(null) 플레이어는
// 0으로 간주해 마지막에 배정됩니다.
export function balanceTeams(players: Player[]): { team1: string[]; team2: string[] } {
  const sorted = [...players].sort(
    (a, b) => (b.peakTierValue ?? 0) - (a.peakTierValue ?? 0)
  );

  const team1: string[] = [];
  const team2: string[] = [];
  let sum1 = 0;
  let sum2 = 0;

  for (const p of sorted) {
    const value = p.peakTierValue ?? 0;
    if (team1.length >= 5) {
      team2.push(p.id);
      sum2 += value;
      continue;
    }
    if (team2.length >= 5) {
      team1.push(p.id);
      sum1 += value;
      continue;
    }
    if (sum1 <= sum2) {
      team1.push(p.id);
      sum1 += value;
    } else {
      team2.push(p.id);
      sum2 += value;
    }
  }

  return { team1, team2 };
}
