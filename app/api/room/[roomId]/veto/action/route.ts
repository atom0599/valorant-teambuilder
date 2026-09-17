import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { applyAction, setSide } from "@/lib/veto";

function teamForToken(room: NonNullable<Awaited<ReturnType<typeof getRoom>>>, tok: string): 1 | 2 | null {
  if (room.captain1Token && room.captain1Token === tok) return 1;
  if (room.captain2Token && room.captain2Token === tok) return 2;
  return null;
}

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const room = await getRoom(params.roomId);
  if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  if (!room.veto) return NextResponse.json({ error: "밴픽이 시작되지 않았습니다" }, { status: 400 });

  const body = await req.json();
  const { token: tok, kind } = body as { token: string; kind: "select" | "side" };

  const team = teamForToken(room, tok);
  if (!team) return NextResponse.json({ error: "유효하지 않은 팀장 인증입니다" }, { status: 401 });

  try {
    if (kind === "select") {
      // 밴/픽 단계는 mapId를, 데사이더 단계는 side를 보냅니다.
      const { mapId, side } = body as {
        mapId?: string;
        side?: "attack" | "defense";
      };
      room.veto = applyAction({ veto: room.veto, team, mapId, side });
    } else if (kind === "side") {
      const { stepIndex, side } = body as { stepIndex: number; side: "attack" | "defense" };
      room.veto = setSide(room.veto, stepIndex, team, side);
    } else {
      return NextResponse.json({ error: "알 수 없는 요청입니다" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  await saveRoom(room);
  const { captain1Token, captain2Token, ...safe } = room;
  return NextResponse.json({ room: safe });
}
