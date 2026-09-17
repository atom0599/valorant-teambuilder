"use client";

import { useEffect, useState } from "react";
import { useRoomPolling } from "@/lib/useRoomPolling";
import { ALL_MAPS, mapById } from "@/lib/maps";
import { VetoStep } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  ban: "밴",
  pick: "픽",
  decider: "데사이더",
};

export default function VetoPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params;
  const { room, notFound, refresh } = useRoomPolling(roomId, 1200);
  const [format, setFormat] = useState<"bo3" | "bo5">("bo3");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(ALL_MAPS.filter((m) => m.defaultRotation).map((m) => m.id))
  );
  const [starting, setStarting] = useState(false);
  const [myCaptain, setMyCaptain] = useState<1 | 2 | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const c1 = localStorage.getItem(`vtb:${roomId}:captain1`);
    const c2 = localStorage.getItem(`vtb:${roomId}:captain2`);
    if (c1) setMyCaptain(1);
    else if (c2) setMyCaptain(2);
  }, [roomId]);

  function myToken(): string | null {
    return localStorage.getItem(`vtb:${roomId}:captain${myCaptain}`);
  }

  function toggleMap(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startVeto() {
    setStarting(true);
    const res = await fetch(`/api/room/${roomId}/veto/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, pool: Array.from(selected) }),
    });
    const data = await res.json();
    setStarting(false);
    if (!res.ok) {
      setActionError(data.error);
      return;
    }
    refresh();
  }

  async function selectMap(mapId: string) {
    const tok = myToken();
    if (!tok) return;
    setActionError(null);
    const res = await fetch(`/api/room/${roomId}/veto/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tok, kind: "select", mapId }),
    });
    const data = await res.json();
    if (!res.ok) setActionError(data.error);
    refresh();
  }

  async function chooseSide(stepIndex: number, side: "attack" | "defense", isDecider = false) {
    const tok = myToken();
    if (!tok) return;
    setActionError(null);
    const body = isDecider
      ? { token: tok, kind: "select", side }
      : { token: tok, kind: "side", stepIndex, side };
    const res = await fetch(`/api/room/${roomId}/veto/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setActionError(data.error);
    refresh();
  }

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mute">방을 찾을 수 없습니다.</p>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mute font-mono text-sm">불러오는 중...</p>
      </main>
    );
  }
  if (!room.balanced) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-mute">먼저 로비에서 팀을 밸런싱해주세요.</p>
      </main>
    );
  }

  // ---- 밴픽 설정 화면 ----
  if (!room.veto) {
    return (
      <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
        <h1 className="font-display font-semibold text-2xl mb-1">맵 밴픽 설정</h1>
        <p className="text-mute text-sm mb-8">
          경기 방식과 밴픽에 사용할 맵 풀을 정하세요. 정확히 7개를 선택해야 시작할 수 있습니다.
        </p>

        <div className="flex gap-3 mb-8">
          {(["bo3", "bo5"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex-1 py-3 border text-sm font-display font-semibold ${
                format === f ? "border-team1 text-team1 bg-team1/5" : "border-line text-mute"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-sm">맵 풀</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-mute">{selected.size}/7 선택됨</span>
            <button
              onClick={() =>
                setSelected(new Set(ALL_MAPS.filter((m) => m.defaultRotation).map((m) => m.id)))
              }
              className="text-xs font-mono text-team2 hover:underline"
            >
              경쟁전 로테이션 적용
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs font-mono text-mute hover:underline"
            >
              전체 해제
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-8">
          {ALL_MAPS.map((m) => (
            <label
              key={m.id}
              className={`flex items-center gap-2 px-3 py-2.5 border cursor-pointer text-sm ${
                selected.has(m.id) ? "border-team1 bg-team1/5" : "border-line text-mute"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggleMap(m.id)}
                className="accent-[#E8483A]"
              />
              {m.name}
            </label>
          ))}
        </div>

        {actionError && <p className="text-team1 text-sm mb-4">{actionError}</p>}

        <button
          onClick={startVeto}
          disabled={selected.size !== 7 || starting}
          className="w-full bg-team1 hover:bg-team1/90 disabled:opacity-40 text-onaccent font-display font-semibold py-3.5 text-sm clip-tag"
        >
          {starting ? "시작하는 중..." : "밴픽 시작"}
        </button>
      </main>
    );
  }

  // ---- 밴픽 진행 화면 ----
  const veto = room.veto;
  const currentStep: VetoStep | undefined = veto.steps[veto.currentStep];
  const pendingSideStep = veto.steps.find(
    (s) => s.action === "pick" && s.resolved && s.side === null
  );

  function statusFor(mapId: string) {
    return veto.steps.find((s) => s.resolved && s.mapId === mapId);
  }

  const canActNow =
    !veto.finished &&
    currentStep &&
    currentStep.action !== "decider" &&
    myCaptain === currentStep.team;

  const canActDecider =
    !veto.finished &&
    currentStep &&
    currentStep.action === "decider" &&
    myCaptain === currentStep.sideChooser;

  const canActPendingSide =
    pendingSideStep && myCaptain === pendingSideStep.sideChooser;

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-semibold text-2xl">
          {veto.format.toUpperCase()} 밴픽
        </h1>
        <span className="text-xs font-mono text-mute">
          {myCaptain ? `TEAM ${myCaptain} 주장으로 참가중` : "관전 모드"}
        </span>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex gap-1 mb-6">
        {veto.steps.map((s, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 ${
              s.resolved
                ? s.team === 1 || (s.team === "auto" && s.sideChooser === 1)
                  ? "bg-team1"
                  : "bg-team2"
                : i === veto.currentStep
                ? "bg-warn turn-indicator"
                : "bg-line"
            }`}
          />
        ))}
      </div>

      {/* 현재 차례 배너 */}
      {!veto.finished && currentStep && (
        <div className="border border-line px-4 py-3 mb-6 flex items-center justify-between">
          <div>
            <span
              className={`font-display font-semibold ${
                currentStep.team === 1 ? "text-team1" : "text-team2"
              }`}
            >
              {currentStep.team === "auto"
                ? `TEAM ${currentStep.sideChooser}`
                : `TEAM ${currentStep.team}`}
            </span>
            <span className="text-mute text-sm ml-2">
              {currentStep.action === "decider"
                ? "데사이더 맵 사이드 선택 차례"
                : `${ACTION_LABEL[currentStep.action]} 차례`}
            </span>
          </div>
          {canActDecider && (
            <div className="flex gap-2">
              <button
                onClick={() => chooseSide(currentStep.index, "attack", true)}
                className="px-3 py-1.5 text-xs font-display border border-team1 text-team1"
              >
                공격
              </button>
              <button
                onClick={() => chooseSide(currentStep.index, "defense", true)}
                className="px-3 py-1.5 text-xs font-display border border-team2 text-team2"
              >
                수비
              </button>
            </div>
          )}
        </div>
      )}

      {veto.finished && (
        <div className="border border-team2 px-4 py-3 mb-6 text-team2 font-display font-semibold">
          밴픽 완료
        </div>
      )}

      {/* 사이드 선택 대기 배너 */}
      {pendingSideStep && (
        <div className="border border-warn px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm">
            <span className="text-warn font-display font-semibold">
              {mapById(pendingSideStep.mapId!)?.name}
            </span>{" "}
            <span className="text-mute">
              사이드 선택 대기중 (TEAM {pendingSideStep.sideChooser})
            </span>
          </span>
          {canActPendingSide && (
            <div className="flex gap-2">
              <button
                onClick={() => chooseSide(pendingSideStep.index, "attack")}
                className="px-3 py-1.5 text-xs font-display border border-team1 text-team1"
              >
                공격
              </button>
              <button
                onClick={() => chooseSide(pendingSideStep.index, "defense")}
                className="px-3 py-1.5 text-xs font-display border border-team2 text-team2"
              >
                수비
              </button>
            </div>
          )}
        </div>
      )}

      {actionError && <p className="text-team1 text-sm mb-4">{actionError}</p>}

      {/* 맵 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        {veto.pool.map((mapId) => {
          const map = mapById(mapId);
          const st = statusFor(mapId);
          const isBanned = st?.action === "ban";
          const isPicked = st?.action === "pick" || st?.action === "decider";
          const clickable = canActNow && !st;

          return (
            <button
              key={mapId}
              disabled={!clickable}
              onClick={() => clickable && selectMap(mapId)}
              className={`text-left px-4 py-4 border text-sm transition-colors ${
                isBanned
                  ? "border-line/50 text-mute/40 line-through"
                  : isPicked
                  ? st!.team === 1 || (st!.team === "auto" && st!.sideChooser === 1)
                    ? "border-team1 bg-team1/10"
                    : "border-team2 bg-team2/10"
                  : clickable
                  ? "border-line hover:border-team1 cursor-pointer"
                  : "border-line/60 text-mute"
              }`}
            >
              <div className="font-display font-semibold">{map?.name ?? mapId}</div>
              {st && (
                <div className="text-xs font-mono mt-1 text-mute">
                  {isBanned && `BAN · TEAM ${st.team}`}
                  {isPicked &&
                    `${st.action === "decider" ? "DECIDER" : "PICK"} · TEAM ${
                      st.team === "auto" ? "?" : st.team
                    }${st.side ? ` · ${st.side === "attack" ? "ATK" : "DEF"} TEAM${
                      st.sideChooser
                    }` : ""}`}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
