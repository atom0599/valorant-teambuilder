import { randomBytes } from "crypto";

export function shortId(len = 6): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 문자 제외
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function token(): string {
  return randomBytes(24).toString("hex");
}
