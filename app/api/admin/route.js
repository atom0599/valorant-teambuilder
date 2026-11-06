import { adminEnabled, checkPassword, makeToken, isAdmin } from '../../../lib/admin';
import { logAdmin } from '../../../lib/adminLog';

// 비밀번호 맞히기 막기: 10분 안에 5번 틀리면 10분 동안 로그인을 받지 않는다.
// 비밀번호 하나를 모두가 같이 쓰니 IP별이 아니라 전체로 센다(서버 한 대 · 메모리).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const gate = globalThis.__adminGate || (globalThis.__adminGate = { fails: [], blockedUntil: 0 });

export const dynamic = 'force-dynamic';

// GET: does the token this browser holds still work?
export async function GET(request) {
  return Response.json({ enabled: adminEnabled, admin: isAdmin(request) }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { password } -> { token }
export async function POST(request) {
  if (!adminEnabled) {
    return Response.json({ error: '서버에 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.' }, { status: 503 });
  }
  const now = Date.now();
  if (gate.blockedUntil > now) {
    const min = Math.ceil((gate.blockedUntil - now) / 60000);
    return Response.json({ error: `비밀번호를 여러 번 틀려서 ${min}분 뒤에 다시 시도할 수 있습니다.` }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  if (!checkPassword(body?.password)) {
    gate.fails = [...gate.fails.filter((t) => now - t < WINDOW_MS), now];
    if (gate.fails.length >= MAX_FAILS) {
      gate.blockedUntil = now + WINDOW_MS;
      gate.fails = [];
      await logAdmin('로그인 잠김', `비밀번호 ${MAX_FAILS}번 틀림 → 10분 잠금`);
    } else {
      await logAdmin('로그인 실패', '');
    }
    return Response.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  gate.fails = [];
  await logAdmin('로그인', '');
  return Response.json({ token: makeToken() });
}
