"use client";

export function CircularTimer({
  seconds,
  total = 15,
  size = 130,
  numberFontSize = 36,
}: {
  seconds: number;
  total?: number;
  size?: number;
  numberFontSize?: number;
}) {
  const strokeWidth = Math.max(6, Math.round(size * 0.08));
  const center = size / 2;
  const r = Math.max(18, center - strokeWidth - 3);
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
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
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
            fontSize: numberFontSize,
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
