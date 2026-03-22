"use client";

import { useEffect, useRef, useState } from "react";

export function useTimer(timerEnd: number) {
  const [seconds, setSeconds] = useState(0);
  const lastTickRef = useRef<number>(-1);

  useEffect(() => {
    if (!timerEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((timerEnd - Date.now()) / 1000);
      const next = Math.max(0, remaining);
      setSeconds(next);
      lastTickRef.current = next;
    }, 100);
    return () => clearInterval(interval);
  }, [timerEnd]);

  return { seconds };
}
