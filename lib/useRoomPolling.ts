"use client";

import { useEffect, useRef, useState } from "react";
import { RoomState } from "./types";

export function useRoomPolling(roomId: string, intervalMs = 1500) {
  const [room, setRoom] = useState<Omit<RoomState, "captain1Token" | "captain2Token"> | null>(
    null
  );
  const [notFound, setNotFound] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/room/${roomId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setRoom(data.room);
    } catch {
      // 네트워크 일시 오류는 다음 폴링에서 재시도
    }
  }

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { room, notFound, refresh };
}
