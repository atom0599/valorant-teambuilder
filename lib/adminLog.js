// 관리자 활동 기록. 전적 삭제 · 순위 제외 · 맵풀 변경 · 백업 되돌리기 · 클립 삭제 같은
// 관리자 작업(과 로그인 시도, 방 초기화)을 언제 무엇을 했는지 남긴다. 관리자는 비밀번호
// 하나를 같이 쓰니 "누가"는 알 수 없고, 무엇을 · 언제만 남긴다. 최근 MAX개만 보관.
import { getJSON, setJSON, withLock, getCached } from './store';

const KEY = 'admin:log';
const MAX = 300;

// 실패해도 본 작업은 막지 않는다.
export async function logAdmin(action, detail = '') {
  try {
    await withLock(KEY, async () => {
      const list = (await getJSON(KEY)) || [];
      list.unshift({ at: Date.now(), action: String(action).slice(0, 40), detail: String(detail || '').slice(0, 300) });
      await setJSON(KEY, list.slice(0, MAX));
    });
  } catch { /* 기록 실패는 무시 */ }
}

export async function readAdminLog() {
  return (await getCached(KEY, 5000)) || [];
}
