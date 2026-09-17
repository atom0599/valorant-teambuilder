"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [joinId, setJoinId] = useState("");

  async function createRoom() {
    setLoading(true);
    const res = await fetch("/api/room", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.id) router.push(`/room/${data.id}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <div className="text-team1 font-mono text-xs tracking-wide mb-2">
            5v5 CUSTOM MATCH
          </div>
          <h1 className="font-display font-semibold text-4xl leading-tight">
            내전 팀을
            <br />
            티어로 짜고
            <br />
            맵을 정한다
          </h1>
          <p className="text-mute mt-4 text-sm leading-relaxed">
            Riot ID 10개를 넣으면 최고 티어를 기준으로 팀을 나누고, 팀장 둘이
            들어와서 직접 맵 밴픽까지 진행합니다.
          </p>
        </div>

        <button
          onClick={createRoom}
          disabled={loading}
          className="w-full bg-team1 hover:bg-team1/90 disabled:opacity-50 text-onaccent font-display font-semibold py-3.5 text-sm tracking-wide clip-tag"
        >
          {loading ? "방 만드는 중..." : "새 방 만들기"}
        </button>

        <div className="mt-8 pt-8 border-t border-line">
          <label className="text-mute text-xs font-mono block mb-2">
            초대받은 방 코드로 입장
          </label>
          <div className="flex gap-2">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value.toUpperCase())}
              placeholder="ABCD12"
              className="flex-1 bg-panel border border-line px-3 py-2.5 text-sm font-mono tracking-widest placeholder:text-mute/50 focus:border-team1 outline-none"
            />
            <button
              onClick={() => joinId && router.push(`/room/${joinId}`)}
              className="px-5 border border-line hover:border-team2 text-sm font-display"
            >
              입장
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
