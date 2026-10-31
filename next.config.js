/** @type {import('next').NextConfig} */
// public 그림(맵 · 요원 · 명예의 전당)은 잘 안 바뀌니 브라우저에 1주일 저장해서 매번 다시 받지 않게.
const cache = { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' };
module.exports = {
  reactStrictMode: false,
  async headers() {
    return ['/maps/:path*', '/agents/:path*', '/fame/:path*', '/logo.png'].map((source) => ({ source, headers: [cache] }));
  }
};
