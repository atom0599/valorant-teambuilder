import { TIERS } from '../../../lib/constants';
import { henrikFetch } from '../../../lib/henrik';

export const dynamic = 'force-dynamic';

const KO = {
  Iron: '아이언', Bronze: '브론즈', Silver: '실버', Gold: '골드', Platinum: '플래티넘',
  Diamond: '다이아몬드', Ascendant: '초월자', Immortal: '불멸', Radiant: '레디언트'
};

function toKoLabel(patched) {
  if (!patched) return null;
  const m = String(patched).trim().match(/^([A-Za-z]+)\s*(\d)?$/);
  if (!m) return null;
  const base = KO[m[1]];
  if (!base) return null;
  const label = m[2] ? `${base} ${m[2]}` : base;
  return TIERS.some((t) => t.label === label) ? label : base;
}

export async function GET(request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();
  const region = url.searchParams.get('region') || 'kr';
  if (!name || !tag) return Response.json({ error: 'name and tag required' }, { status: 400 });

  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return Response.json({ error: 'HENRIKDEV_API_KEY not set', source: 'none' }, { status: 503 });

  try {
    const res = await henrikFetch(
      `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { headers: { Authorization: key }, cache: 'no-store' }
    );
    if (!res.ok) return Response.json({ error: `henrikdev ${res.status}`, source: 'none' }, { status: res.status });

    const json = await res.json();
    const d = json?.data || {};
    const peak = d.highest_rank || {};
    const peakTier = toKoLabel(peak.patched_tier);
    const currentTier = toKoLabel(d.current_data?.currenttierpatched);

    // Official Valorant rank icons. HenrikDev only gives us the icon for the
    // CURRENT tier (current_data.images.small); it doesn't expose one for the
    // peak tier's own episode. We reuse the current episode's icon set (same
    // base UUID) keyed by the peak tier's numeric id — tier numbering (0-27)
    // is stable across episodes even when the icon art gets redesigned, so
    // this is a reasonable approximation rather than an exact historical icon.
    const currentTierIcon = d.current_data?.images?.small || null;
    const iconBaseMatch = currentTierIcon ? currentTierIcon.match(/^(.*\/competitivetiers\/[^/]+)\/\d+\//) : null;
    const peakTierIcon = iconBaseMatch && typeof peak.tier === 'number' ? `${iconBaseMatch[1]}/${peak.tier}/smallicon.png` : currentTierIcon;

    return Response.json({
      source: 'api',
      account: `${name}#${tag}`,
      peakTier: peakTier || currentTier,
      peakTierRaw: peak.patched_tier || null,
      peakSeason: peak.season || null,
      peakTierIcon,
      currentTier,
      currentTierIcon,
      elo: d.current_data?.elo ?? null
    });
  } catch (e) {
    return Response.json({ error: String(e), source: 'none' }, { status: 502 });
  }
}
