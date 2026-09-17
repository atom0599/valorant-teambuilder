import { Region } from "./types";

const BASE = "https://api.henrikdev.xyz";

export interface TierLookupResult {
  ok: boolean;
  error?: string;
  peakTierValue: number | null;
  peakTierLabel: string | null;
  currentTierLabel: string | null;
}

// HenrikDev API 응답 스키마는 종종 바뀝니다. 여러 필드 경로를 순서대로
// 시도해서 최대한 방어적으로 파싱합니다. 만약 이 함수가 계속 실패한다면
// https://docs.henrikdev.xyz 에서 최신 MMR 엔드포인트 응답 형태를
// 확인하고 아래 파싱 로직을 맞춰주세요.
function extractTier(data: any): {
  peakValue: number | null;
  peakLabel: string | null;
  currentLabel: string | null;
} {
  const current =
    data?.current_data?.currenttierpatched ??
    data?.current?.tier?.name ??
    data?.currenttierpatched ??
    null;

  const currentValue =
    data?.current_data?.currenttier ?? data?.current?.tier?.id ?? data?.currenttier ?? null;

  const peakLabel =
    data?.highest_rank?.patched_tier ??
    data?.peak?.tier?.name ??
    data?.highest_rank?.tier_name ??
    current;

  const peakValue =
    data?.highest_rank?.tier ?? data?.peak?.tier?.id ?? currentValue ?? null;

  return {
    peakValue: typeof peakValue === "number" ? peakValue : null,
    peakLabel: peakLabel ?? null,
    currentLabel: current ?? null,
  };
}

export async function lookupTier(
  name: string,
  tag: string,
  region: Region,
  apiKey: string
): Promise<TierLookupResult> {
  try {
    const res = await fetch(
      `${BASE}/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      {
        headers: { Authorization: apiKey },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return {
        ok: false,
        error: "해당 Riot ID를 찾을 수 없습니다 (이름#태그를 확인해주세요)",
        peakTierValue: null,
        peakTierLabel: null,
        currentTierLabel: null,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: "API 요청 제한(분당 30회)에 걸렸습니다. 잠시 후 다시 시도해주세요",
        peakTierValue: null,
        peakTierLabel: null,
        currentTierLabel: null,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `조회 실패 (status ${res.status})`,
        peakTierValue: null,
        peakTierLabel: null,
        currentTierLabel: null,
      };
    }

    const json = await res.json();
    const { peakValue, peakLabel, currentLabel } = extractTier(json.data);

    if (peakValue === null) {
      return {
        ok: false,
        error: "티어 정보를 파싱하지 못했습니다 (언랭이거나 API 응답 형식 변경)",
        peakTierValue: null,
        peakTierLabel: peakLabel,
        currentTierLabel: currentLabel,
      };
    }

    return {
      ok: true,
      peakTierValue: peakValue,
      peakTierLabel: peakLabel,
      currentTierLabel: currentLabel,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: "네트워크 오류로 조회하지 못했습니다",
      peakTierValue: null,
      peakTierLabel: null,
      currentTierLabel: null,
    };
  }
}
