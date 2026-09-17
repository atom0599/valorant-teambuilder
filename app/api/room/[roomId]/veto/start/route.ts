import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { initVeto } from "@/lib/veto";

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (!room.balanced) {
    return NextResponse.json({ error: "먼저 팀을 확정해주세요" }, { status: 400 });
  }
  if (room.veto) {
    return NextResponse.json({ error: "이미 밴픽이 시작되었습니다" }, { status: 400 });
  }

  const { format, pool } = await req.json();
  if (format !== "bo3" && format !== "bo5") {
    return NextResponse.json({ error: "format은 bo3 또는 bo5여야 합니다" }, { status: 400 });
  }
  if (!Array.isArray(pool) || pool.length !== 7) {
    return NextResponse.json({ error: "맵을 정확히 7개 선택해주세요" }, { status: 400 });
  }

  try {
    room.veto = initVeto(format, pool);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
