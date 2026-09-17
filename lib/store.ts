import { RoomState } from "./types";

const KEY_PREFIX = "vtb:room:";
const TTL_SECONDS = 60 * 60 * 12; // 12시간 후 자동 만료

const hasKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

// 로컬 개발(npm run dev)에서 Vercel KV 없이 테스트할 때만 쓰는 메모리 폴백.
// 서버리스 배포 환경에서는 인스턴스 간 상태가 공유되지 않으므로 반드시
// Vercel KV(또는 호환 Redis)를 연결해서 배포하세요. README 참고.
const memoryStore = new Map<string, RoomState>();

async function getKv() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

export async function getRoom(id: string): Promise<RoomState | null> {
  if (hasKv) {
    const kv = await getKv();
    const room = await kv.get<RoomState>(KEY_PREFIX + id);
    return room ?? null;
  }
  return memoryStore.get(id) ?? null;
}

export async function saveRoom(room: RoomState): Promise<void> {
  if (hasKv) {
    const kv = await getKv();
    await kv.set(KEY_PREFIX + room.id, room, { ex: TTL_SECONDS });
    return;
  }
  memoryStore.set(room.id, room);
}

export function isPersistentStoreConfigured(): boolean {
  return hasKv;
}
