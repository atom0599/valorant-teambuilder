import { lockAction } from '../../../lib/refreshLock';

export const dynamic = 'force-dynamic';

// body: { action: 'start' | 'progress' | 'end', id: 탭 id, progress?: 0~100 }
// 지금 상태는 따로 조회하지 않고 2초마다 받는 /api/room 응답(refresh)에 같이 온다.
const validId = (x) => typeof x === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(x);

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || !['start', 'progress', 'end'].includes(body.action) || !validId(body.id)) {
    return Response.json({ error: 'action and id required' }, { status: 400 });
  }
  return Response.json(lockAction(body.action, body.id, body.progress), { headers: { 'Cache-Control': 'no-store' } });
}
