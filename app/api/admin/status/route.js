import { isAdmin } from '../../../../lib/admin';
import { henrikStatus } from '../../../../lib/henrik';
import { listBackups, restoreBackup, hasKV } from '../../../../lib/store';
import { lockView } from '../../../../lib/refreshLock';
import { logAdmin, readAdminLog } from '../../../../lib/adminLog';

export const dynamic = 'force-dynamic';

// 관리자 전용. 통계 탭의 "서버 상태 · 백업" 카드가 쓴다.
// GET → { henrik: HenrikDev 상태, backups: 하루 한 벌 백업 목록, log: 관리자 활동 기록, uptimeSec, refresh }
export async function GET(request) {
  if (!isAdmin(request)) return Response.json({ error: 'admin only' }, { status: 403 });
  let backups = [], backupError = null;
  try { backups = await listBackups(); } catch (e) { backupError = String(e); }
  let log = [];
  try { log = await readAdminLog(); } catch { /* 비어 있는 것처럼 */ }
  return Response.json(
    { henrik: henrikStatus(), backups, backupError, log, persistent: hasKV, uptimeSec: Math.round(process.uptime()), refresh: lockView(null) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// POST { restore: 'backup:<키>:<날짜>' } → 그 백업으로 되돌린다. 되돌리기 직전 값도 백업으로 남는다.
export async function POST(request) {
  if (!isAdmin(request)) return Response.json({ error: 'admin only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.restore !== 'string') return Response.json({ error: 'restore key required' }, { status: 400 });
  try {
    const of = await restoreBackup(body.restore);
    await logAdmin('백업 되돌리기', body.restore.replace(/^backup:/, ''));
    return Response.json({ ok: true, restored: of });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 400 });
  }
}
