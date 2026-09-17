import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (room.veto) {
    return NextResponse.json({ error: "밴픽이 시작된 후에는 팀을 변경할 수 없습니다" }, { status: 400 });
  }

  const { playerIdA, playerIdB } = await req.json();
  const a = room.players.find((p) => p.id === playerIdA);
  const b = room.players.find((p) => p.id === playerIdB);
  if (!a || !b || a.team === b.team) {
    return NextResponse.json({ error: "서로 다른 팀의 플레이어를 선택해주세요" }, { status: 400 });
  }

  const aTeam = a.team;
  const bTeam = b.team;
  a.team = bTeam;
  b.team = aTeam;
  room.team1 = room.players.filter((p) => p.team === 1).map((p) => p.id);
  room.team2 = room.players.filter((p) => p.team === 2).map((p) => p.id);

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
