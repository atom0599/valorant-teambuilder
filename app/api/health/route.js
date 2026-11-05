// 서버가 살아 있는지만 알려 준다. DB · 외부 API를 안 건드려서 가볍다.
// Render 헬스체크와 UptimeRobot 핑(서버 잠들지 않게)에 쓴다.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, t: Date.now() });
}
