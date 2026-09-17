import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });

  // 토큰은 클라이언트로 내려주지 않는다 (본인이 받은 토큰만 localStorage에 보관)
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
