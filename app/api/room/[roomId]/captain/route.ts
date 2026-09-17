import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { token } from "@/lib/id";

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (!room.balanced) {
    return NextResponse.json({ error: "아직 팀이 확정되지 않았습니다" }, { status: 400 });
  }

  const { team } = await req.json();
  if (team !== 1 && team !== 2) {
    return NextResponse.json({ error: "team은 1 또는 2여야 합니다" }, { status: 400 });
  }

  if (team === 1) {
    if (room.captain1Claimed) {
      return NextResponse.json({ error: "이미 팀 1 주장이 있습니다" }, { status: 409 });
    }
    const t = token();
    room.captain1Claimed = true;
    room.captain1Token = t;
    await saveRoom(room);
    return NextResponse.json({ token: t });
  } else {
    if (room.captain2Claimed) {
      return NextResponse.json({ error: "이미 팀 2 주장이 있습니다" }, { status: 409 });
    }
    const t = token();
    room.captain2Claimed = true;
    room.captain2Token = t;
    await saveRoom(room);
    return NextResponse.json({ token: t });
  }
}
