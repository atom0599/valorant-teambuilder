// 인원 관리 "새로고침"은 한 번에 한 사람만. 라이엇 전적 API 한도(분당 30번)를
// 서버 전체가 나눠 쓰니, 두 사람이 동시에 누르면 둘 다 두 배로 느려진다.
// 서버가 한 대로 계속 떠 있으니(Render) 저장소 없이 서버 메모리에만 둔다 —
// 확인과 차지가 같은 틱 안에서 끝나서 두 사람이 동시에 잡을 수 없다.
// 누른 사람이 탭을 닫으면 진행 소식이 끊기니, STALE_MS 동안 소식이 없으면 풀린다.
const STALE_MS = 90 * 1000;
const s = globalThis.__refreshLock || (globalThis.__refreshLock = { owner: null, progress: 0, updatedAt: 0, endedAt: 0 });

const active = () => !!s.owner && Date.now() - s.updatedAt < STALE_MS;

// 다른 사람에게 owner(탭 id)는 보내지 않는다 — 내 것인지만 알려 준다.
export function lockView(id) {
  const on = active();
  return { active: on, progress: on ? s.progress : 0, mine: on && !!id && s.owner === id, endedAt: s.endedAt };
}

export function lockAction(action, id, progress) {
  if (!id) return { ok: false, lock: lockView(id) };
  if (action === 'start') {
    if (active() && s.owner !== id) return { ok: false, lock: lockView(id) };
    Object.assign(s, { owner: id, progress: 0, updatedAt: Date.now() });
    return { ok: true, lock: lockView(id) };
  }
  // 서버가 재시작(배포 등)되면 메모리의 잠금이 사라진다. 그때 진행 중이던 탭의
  // 다음 진행 알림이 잠금을 다시 잡아서, 그 사이 다른 사람이 새로고침을 겹쳐 시작하지 못하게 한다.
  if (action === 'progress' && !active()) Object.assign(s, { owner: id });
  if (s.owner !== id) return { ok: false, lock: lockView(id) };
  if (action === 'progress') {
    Object.assign(s, { progress: Math.max(0, Math.min(100, Math.round(Number(progress) || 0))), updatedAt: Date.now() });
  } else if (action === 'end') {
    Object.assign(s, { owner: null, progress: 0, updatedAt: 0, endedAt: Date.now() });
  }
  return { ok: true, lock: lockView(id) };
}
