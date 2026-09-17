import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { balanceTeams } from "@/lib/balance";

export async function POST(_req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (room.players.length < 2) {
    return NextResponse.json({ error: "최소 2명 이상의 플레이어가 필요합니다" }, { status: 400 });
  }

  const { team1, team2 } = balanceTeams(room.players);
  room.team1 = team1;
  room.team2 = team2;
  for (const p of room.players) {
    p.team = team1.includes(p.id) ? 1 : team2.includes(p.id) ? 2 : null;
  }
  room.balanced = true;

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
