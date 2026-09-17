import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { lookupTier } from "@/lib/valorant-api";

export async function POST(_req: Request, { params }: { params: { roomId: string } }) {
  const apiKey = process.env.HENRIKDEV_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "서버에 HENRIKDEV_API_KEY 환경변수가 설정되어 있지 않습니다" },
      { status: 500 }
    );
  }

  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });

  // 30req/min(Basic 키) 한도를 고려해 순차 처리 + 약간의 간격
  for (const player of room.players) {
    const result = await lookupTier(player.riotName, player.riotTag, player.region, apiKey);
    if (result.ok) {
      player.status = "ok";
      player.peakTierValue = result.peakTierValue;
      player.peakTierLabel = result.peakTierLabel;
      player.currentTierLabel = result.currentTierLabel;
      player.error = undefined;
    } else {
      player.status = "error";
      player.error = result.error;
      player.peakTierValue = result.peakTierValue;
      player.peakTierLabel = result.peakTierLabel;
      player.currentTierLabel = result.currentTierLabel;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
