import { NextResponse } from "next/server";
import { RoomState } from "@/lib/types";
import { saveRoom } from "@/lib/store";
import { shortId } from "@/lib/id";

export async function POST() {
  const id = shortId(6);
  const room: RoomState = {
    id,
    createdAt: Date.now(),
    players: [],
    team1: [],
    team2: [],
    balanced: false,
    captain1Claimed: false,
    captain2Claimed: false,
    captain1Token: null,
    captain2Token: null,
    veto: null,
  };
  await saveRoom(room);
  return NextResponse.json({ id });
}
