import { getJSON } from '../../../lib/store';
import { MAPPOOL_KEY } from '../../../lib/mappool';

// 서버가 살아 있는지 알려 준다. Render 헬스체크와 UptimeRobot 핑(5분마다)에 쓴다.
// Supabase 무료는 7일 동안 DB 사용이 없으면 일시정지되니, 여기서 가장 작은 값
// (맵풀, 약 100B)을 가끔 읽어서 DB도 깨워 둔다. Render 헬스체크는 몇 초마다
// 들어오므로 DB는 10분에 한 번만 읽는다. DB가 실패해도 서버 자체는 정상이니 200을 준다
// (헬스체크가 실패하면 Render가 멀쩡한 서버를 재시작해 버림).
export const dynamic = 'force-dynamic';

const DB_EVERY_MS = 10 * 60 * 1000;
const state = globalThis.__healthDb || (globalThis.__healthDb = { at: 0, ok: null });

export async function GET() {
  if (Date.now() - state.at > DB_EVERY_MS) {
    state.at = Date.now();
    try {
      await getJSON(MAPPOOL_KEY);
      state.ok = true;
    } catch {
      state.ok = false;
    }
  }
  return Response.json(
    { ok: true, db: state.ok, dbCheckedAt: state.at, t: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
