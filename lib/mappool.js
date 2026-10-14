import { getJSON } from './store';
import { ROTATION, normalizePool } from './constants';

// The admin's own "맵풀" (rotation). It used to be only the hard-coded
// ROTATION constant: an admin could customize the room's pool, but the
// "맵풀로 설정" button and 방 초기화 both reset it straight back to that
// constant — so a configured 맵풀 kept "going back to the original".
// Stored on its own (not inside the room) so it survives room resets.
export const MAPPOOL_KEY = 'mappool:rotation';

export async function loadRotation() {
  const saved = normalizePool(await getJSON(MAPPOOL_KEY).catch(() => null));
  return Array.isArray(saved) && saved.length ? saved : ROTATION;
}
