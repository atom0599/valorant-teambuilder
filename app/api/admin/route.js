import { adminEnabled, checkPassword, makeToken, isAdmin } from '../../../lib/admin';

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
  const body = await request.json().catch(() => null);
  if (!checkPassword(body?.password)) {
    return Response.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  return Response.json({ token: makeToken() });
}
