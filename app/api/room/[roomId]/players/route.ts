import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { Player, Region } from "@/lib/types";
import { randomBytes } from "crypto";

interface Body {
  players: { riotName: string; riotTag: string; region: Region }[];
}

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (room.balanced) {
    return NextResponse.json({ error: "이미 팀이 확정된 방입니다" }, { status: 400 });
  }

  const body: Body = await req.json();
  if (!Array.isArray(body.players) || body.players.length < 2 || body.players.length > 10) {
    return NextResponse.json({ error: "2~10명의 플레이어가 필요합니다" }, { status: 400 });
  }

  room.players = body.players.map((p): Player => ({
    id: randomBytes(6).toString("hex"),
    riotName: p.riotName.trim(),
    riotTag: p.riotTag.trim().replace(/^#/, ""),
    region: p.region,
    status: "pending",
    peakTierValue: null,
    peakTierLabel: null,
    currentTierLabel: null,
    team: null,
  }));

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
