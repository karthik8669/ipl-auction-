"use client";

export function CircularTimer({
  seconds,
  total = 15,
}: {
  seconds: number;
  total?: number;
}) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, seconds / total));
  const dash = circ * (1 - pct);
  const color = seconds <= 3 ? "#ff4060" : seconds <= 7 ? "#ff8c00" : "#00c896";
  const shakeStyle =
    seconds <= 3 ? { animation: "shake 0.3s ease-in-out infinite" } : {};

  return (
    <div
      style={{ position: "relative", flexShrink: 0, ...shakeStyle }}
      className="circular-timer"
    >
      <svg
        width={130}
        height={130}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={65}
          cy={65}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
        />
        <circle
          cx={65}
          cy={65}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={circ}
          strokeDashoffset={dash}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.1s linear, stroke 0.3s",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Teko, sans-serif",
            fontSize: 36,
            fontWeight: 700,
            color,
            lineHeight: 1,
            textShadow: `0 0 20px ${color}80`,
          }}
        >
          {Math.max(0, seconds)}
        </div>
        <div
          style={{
            color: "#5a8ab0",
            fontSize: 9,
            letterSpacing: 1,
          }}
        >
          SEC
        </div>
      </div>
    </div>
  );
}
