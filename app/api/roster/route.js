import { getJSON, setJSON, hasKV } from '../../../lib/store';

export const dynamic = 'force-dynamic';

const KEY = 'roster:all';

export async function GET() {
  try {
    const roster = (await getJSON(KEY)) || [];
    return Response.json({ roster, persistent: hasKV }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e), roster: [] }, { status: 502 });
  }
}

// body: { roster: [{ name, pos, realName, alts }] } — full replace, deduped by name.
// `alts` are other Riot IDs (부계정) the same person also plays on — see
// rosterAlias in app/page.js, which folds their match records back onto
// `name` so switching accounts doesn't split one person's 전적 in two.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.roster)) return Response.json({ error: 'roster array required' }, { status: 400 });

  const map = new Map();
  body.roster.forEach((r) => {
    const name = String(r?.name || '').trim();
    if (!name) return;
    const alts = Array.isArray(r?.alts) ? [...new Set(r.alts.map((a) => String(a || '').trim()).filter(Boolean))] : [];
    map.set(name, { name, pos: r.pos || '미정', realName: String(r?.realName || '').trim(), alts });
  });
  const roster = [...map.values()];

  try {
    await setJSON(KEY, roster);
    return Response.json({ roster, persistent: hasKV });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
