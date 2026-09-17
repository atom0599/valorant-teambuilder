import { VetoState, VetoStep } from "./types";

function buildSteps(format: "bo3" | "bo5"): Omit<VetoStep, "mapId" | "side" | "resolved">[] {
  const base: Omit<VetoStep, "mapId" | "side" | "resolved">[] = [
    { index: 0, team: 1, action: "ban", sideChooser: null },
    { index: 1, team: 2, action: "ban", sideChooser: null },
    { index: 2, team: 1, action: "pick", sideChooser: 2 },
    { index: 3, team: 2, action: "pick", sideChooser: 1 },
  ];

  if (format === "bo3") {
    return [
      ...base,
      { index: 4, team: 1, action: "ban", sideChooser: null },
      { index: 5, team: 2, action: "ban", sideChooser: null },
      { index: 6, team: "auto", action: "decider", sideChooser: 1 },
    ];
  }

  // bo5
  return [
    ...base,
    { index: 4, team: 1, action: "pick", sideChooser: 2 },
    { index: 5, team: 2, action: "pick", sideChooser: 1 },
    { index: 6, team: "auto", action: "decider", sideChooser: 1 },
  ];
}

export function initVeto(format: "bo3" | "bo5", pool: string[]): VetoState {
  if (pool.length !== 7) {
    throw new Error("맵 풀은 정확히 7개여야 합니다");
  }
  const steps: VetoStep[] = buildSteps(format).map((s) => ({
    ...s,
    mapId: null,
    side: null,
    resolved: false,
  }));
  return { format, pool, steps, currentStep: 0, finished: false };
}

export function remainingMaps(veto: VetoState): string[] {
  const used = new Set(veto.steps.filter((s) => s.resolved && s.mapId).map((s) => s.mapId));
  return veto.pool.filter((m) => !used.has(m));
}

export interface ApplyActionInput {
  veto: VetoState;
  team: 1 | 2;
  mapId?: string; // ban/pick 시 필요
  side?: "attack" | "defense"; // 상대가 지정한 맵에 사이드 선택 필요한 경우
}

export function applyAction({ veto, team, mapId, side }: ApplyActionInput): VetoState {
  const step = veto.steps[veto.currentStep];
  if (!step || step.resolved) throw new Error("이미 종료되었거나 진행할 단계가 없습니다");

  if (step.action === "decider") {
    // 자동 결정: 남은 맵 하나, team1이 사이드 선택
    if (team !== step.sideChooser) throw new Error("사이드 선택 권한이 없습니다");
    if (!side) throw new Error("사이드를 선택해주세요");
    const remaining = remainingMaps(veto);
    if (remaining.length !== 1) throw new Error("데사이더 맵이 아직 확정되지 않았습니다");
    step.mapId = remaining[0];
    step.side = side;
    step.resolved = true;
    veto.currentStep += 1;
    veto.finished = true;
    return veto;
  }

  // ban / pick 단계: 행동 팀 검증
  if (step.team !== team) throw new Error("지금은 상대 팀의 차례입니다");
  if (!mapId) throw new Error("맵을 선택해주세요");
  const remaining = remainingMaps(veto);
  if (!remaining.includes(mapId)) throw new Error("이미 사용되었거나 유효하지 않은 맵입니다");

  step.mapId = mapId;
  step.resolved = true;

  if (step.action === "pick") {
    // pick의 경우 사이드는 상대(sideChooser)가 별도 액션으로 지정.
    // side가 이번 요청에 함께 왔다면 (같은 팀장이 즉시 입력하는 UX) 바로 반영.
    if (side) step.side = side;
  }

  veto.currentStep += 1;
  if (veto.currentStep >= veto.steps.length) veto.finished = true;
  return veto;
}

export function needsSideChoice(veto: VetoState): VetoStep | null {
  const step = veto.steps.find((s) => s.action === "pick" && s.resolved && s.side === null);
  return step ?? null;
}

export function setSide(
  veto: VetoState,
  stepIndex: number,
  team: 1 | 2,
  side: "attack" | "defense"
): VetoState {
  const step = veto.steps[stepIndex];
  if (!step || !step.resolved || step.side !== null) {
    throw new Error("사이드를 지정할 수 없는 단계입니다");
  }
  if (step.sideChooser !== team) throw new Error("사이드 선택 권한이 없습니다");
  step.side = side;
  return veto;
}
