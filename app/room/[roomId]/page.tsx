"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoomPolling } from "@/lib/useRoomPolling";
import { Region, Player } from "@/lib/types";

const REGIONS: { value: Region; label: string }[] = [
  { value: "kr", label: "KR" },
  { value: "ap", label: "APAC" },
  { value: "na", label: "NA" },
  { value: "eu", label: "EU" },
  { value: "latam", label: "LATAM" },
  { value: "br", label: "BR" },
];

interface Row {
  riotName: string;
  riotTag: string;
  region: Region;
}

function emptyRows(n: number): Row[] {
  return Array.from({ length: n }, () => ({ riotName: "", riotTag: "", region: "kr" as Region }));
}

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params;
  const { room, notFound, refresh } = useRoomPolling(roomId);
  const [rows, setRows] = useState<Row[]>(emptyRows(10));
  const [submitting, setSubmitting] = useState(false);
  const [looking, setLooking] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [swapA, setSwapA] = useState<string | null>(null);
  const [swapB, setSwapB] = useState<string | null>(null);
  const [myCaptain, setMyCaptain] = useState<1 | 2 | null>(null);
  const [claimError, setClaimError] = useState<Record<number, string>>({});

  useEffect(() => {
    const c1 = localStorage.getItem(`vtb:${roomId}:captain1`);
    const c2 = localStorage.getItem(`vtb:${roomId}:captain2`);
    if (c1) setMyCaptain(1);
    else if (c2) setMyCaptain(2);
  }, [roomId]);

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mute">방을 찾을 수 없습니다. 코드를 다시 확인해주세요.</p>
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

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submitPlayers() {
    const filled = rows.filter((r) => r.riotName.trim() && r.riotTag.trim());
    if (filled.length < 2) return;
    setSubmitting(true);
    await fetch(`/api/room/${roomId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: filled }),
    });
    setSubmitting(false);
    refresh();
  }

  async function runLookup() {
    setLooking(true);
    await fetch(`/api/room/${roomId}/lookup`, { method: "POST" });
    setLooking(false);
    refresh();
  }

  async function runBalance() {
    setBalancing(true);
    await fetch(`/api/room/${roomId}/balance`, { method: "POST" });
    setBalancing(false);
    refresh();
  }

  async function doSwap() {
    if (!swapA || !swapB) return;
    await fetch(`/api/room/${roomId}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIdA: swapA, playerIdB: swapB }),
    });
    setSwapA(null);
    setSwapB(null);
    refresh();
  }

  async function claimCaptain(team: 1 | 2) {
    const res = await fetch(`/api/room/${roomId}/captain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team }),
    });
    const data = await res.json();
    if (!res.ok) {
      setClaimError((e) => ({ ...e, [team]: data.error }));
      return;
    }
    localStorage.setItem(`vtb:${roomId}:captain${team}`, data.token);
    setMyCaptain(team);
    refresh();
  }

  const players = room.players;
  const team1Players = players.filter((p) => p.team === 1);
  const team2Players = players.filter((p) => p.team === 2);

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <header className="flex items-end justify-between mb-10">
        <div>
          <div className="text-mute text-xs font-mono mb-1">ROOM</div>
          <div className="font-display font-semibold text-3xl tracking-wide">{roomId}</div>
        </div>
        <p className="text-mute text-xs text-right max-w-[220px]">
          이 코드를 팀원과 팀장에게 공유하세요
        </p>
      </header>

      {!room.balanced && (
        <section>
          <h2 className="font-display font-semibold text-lg mb-1">참가자 등록</h2>
          <p className="text-mute text-sm mb-5">
            Riot ID(이름#태그)를 최대 10명까지 입력하세요. 최고 티어 기준으로 팀을 나눕니다.
          </p>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-mute font-mono text-xs w-5">{i + 1}</span>
                <input
                  value={row.riotName}
                  onChange={(e) => updateRow(i, { riotName: e.target.value })}
                  placeholder="닉네임"
                  className="flex-1 bg-panel border border-line px-3 py-2 text-sm focus:border-team1 outline-none"
                />
                <span className="text-mute">#</span>
                <input
                  value={row.riotTag}
                  onChange={(e) => updateRow(i, { riotTag: e.target.value })}
                  placeholder="태그"
                  className="w-20 bg-panel border border-line px-3 py-2 text-sm focus:border-team1 outline-none"
                />
                <select
                  value={row.region}
                  onChange={(e) => updateRow(i, { region: e.target.value as Region })}
                  className="bg-panel border border-line px-2 py-2 text-xs font-mono outline-none"
                >
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            onClick={submitPlayers}
            disabled={submitting}
            className="mt-5 w-full border border-line hover:border-team1 py-2.5 text-sm font-display disabled:opacity-50"
          >
            {submitting ? "저장 중..." : "참가자 저장"}
          </button>

          {players.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-sm">등록된 참가자 ({players.length})</h3>
                <button
                  onClick={runLookup}
                  disabled={looking}
                  className="text-xs font-mono bg-team1 text-onaccent px-3 py-1.5 disabled:opacity-50"
                >
                  {looking ? "조회 중..." : "티어 조회"}
                </button>
              </div>
              <ul className="divide-y divide-line border border-line">
                {players.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {p.riotName}
                      <span className="text-mute">#{p.riotTag}</span>
                    </span>
                    <span className="font-mono text-xs">
                      {p.status === "pending" && <span className="text-mute">대기중</span>}
                      {p.status === "ok" && <span className="text-team2">{p.peakTierLabel}</span>}
                      {p.status === "error" && <span className="text-team1">{p.error}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={runBalance}
                disabled={balancing || players.length < 2}
                className="mt-5 w-full bg-team1 hover:bg-team1/90 disabled:opacity-50 text-onaccent font-display font-semibold py-3 text-sm clip-tag"
              >
                {balancing ? "밸런싱 중..." : "팀 밸런싱하기"}
              </button>
            </div>
          )}
        </section>
      )}

      {room.balanced && (
        <section>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <TeamPanel
              label="TEAM 1"
              color="team1"
              players={team1Players}
              claimed={room.captain1Claimed}
              isMe={myCaptain === 1}
              onClaim={() => claimCaptain(1)}
              error={claimError[1]}
              selectable={!room.veto}
              selected={swapA}
              onSelect={setSwapA}
            />
            <TeamPanel
              label="TEAM 2"
              color="team2"
              players={team2Players}
              claimed={room.captain2Claimed}
              isMe={myCaptain === 2}
              onClaim={() => claimCaptain(2)}
              error={claimError[2]}
              selectable={!room.veto}
              selected={swapB}
              onSelect={setSwapB}
            />
          </div>

          {!room.veto && swapA && swapB && (
            <button
              onClick={doSwap}
              className="w-full border border-warn text-warn hover:bg-warn/10 py-2 text-sm font-display mb-6"
            >
              선택한 두 명 맞바꾸기
            </button>
          )}

          <Link
            href={`/room/${roomId}/veto`}
            className="block text-center w-full bg-team1 hover:bg-team1/90 text-onaccent font-display font-semibold py-3 text-sm clip-tag"
          >
            {room.veto ? "맵 밴픽으로 이동" : "맵 밴픽 설정하기"}
          </Link>
        </section>
      )}
    </main>
  );
}

function TeamPanel({
  label,
  color,
  players,
  claimed,
  isMe,
  onClaim,
  error,
  selectable,
  selected,
  onSelect,
}: {
  label: string;
  color: "team1" | "team2";
  players: Player[];
  claimed: boolean;
  isMe: boolean;
  onClaim: () => void;
  error?: string;
  selectable: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const labelColorClass = color === "team1" ? "text-team1" : "text-team2";

  return (
    <div className="border border-line">
      <div className={`px-3 py-2 border-b border-line font-display font-semibold text-sm ${labelColorClass}`}>
        {label}
      </div>
      <ul>
        {players.map((p) => (
          <li
            key={p.id}
            onClick={() => selectable && onSelect(selected === p.id ? null : p.id)}
            className={`px-3 py-2 text-sm flex justify-between border-b border-line/50 last:border-0 ${
              selectable ? "cursor-pointer hover:bg-panelraised" : ""
            } ${selected === p.id ? "bg-panelraised" : ""}`}
          >
            <span>
              {p.riotName}
              <span className="text-mute">#{p.riotTag}</span>
            </span>
            <span className="font-mono text-xs text-mute">{p.peakTierLabel ?? "-"}</span>
          </li>
        ))}
      </ul>
      <div className="p-3">
        {claimed ? (
          isMe ? (
            <p className="text-xs font-mono text-team2">내가 이 팀 주장</p>
          ) : (
            <p className="text-xs font-mono text-mute">주장 참가 완료</p>
          )
        ) : (
          <button
            onClick={onClaim}
            className="w-full border border-line hover:border-team1 py-1.5 text-xs font-display"
          >
            이 팀 주장으로 참가
          </button>
        )}
        {error && <p className="text-xs text-team1 mt-1">{error}</p>}
      </div>
    </div>
  );
}
