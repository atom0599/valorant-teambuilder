// Admin gate. The password lives only in the ADMIN_PASSWORD env var; the
// browser gets back a token derived from it (HMAC), sends it as
// `x-admin-token`, and every protected route re-verifies it server-side —
// hiding buttons in the UI alone would not protect anything.
import { createHmac, timingSafeEqual } from 'crypto';

const PW = process.env.ADMIN_PASSWORD;

export const adminEnabled = !!PW;

const digest = (s) => createHmac('sha256', PW || 'unset').update(s).digest();

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(candidate) {
  if (!PW || typeof candidate !== 'string') return false;
  return timingSafeEqual(digest(candidate), digest(PW));
}

export function makeToken() {
  return digest('scrim-admin-v1').toString('hex');
}

export function isAdmin(request) {
  if (!PW) return false;
  return safeEqual(request.headers.get('x-admin-token') || '', makeToken());
}
