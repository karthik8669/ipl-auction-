"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { players as ALL_PLAYERS } from "@/data/players";

export function formatCr(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "-";
  if (value < 1) return `${(value * 100).toFixed(0)} L`;
  return `${value.toFixed(2)} Cr`;
}

type AnalysisResult = {
  rating?: number;
  strengths?: string;
  weaknesses?: string;
  summary?: string;
};

type RoomStateLike = {
  teams?: Record<string, Record<string, { soldFor?: number }>>;
};

export default function Playing11Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = String(rawCode || "")
    .trim()
    .toUpperCase();
  const { user, loading: authLoading } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  const [roomState, setRoomState] = useState<RoomStateLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected11, setSelected11] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string>("");
  const [viceCaptain, setViceCaptain] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (authLoading || !user || !code) return;
    const roomRef = ref(realtimeDb, `rooms/${code}`);
    const unsub = onValue(roomRef, (snap) => {
      setRoomState((snap.val() as RoomStateLike | null) || null);
      setLoading(false);
    });
    return () => unsub();
  }, [authLoading, code, user]);

  const mySquad = useMemo(() => {
    if (!roomState || !user) return [];
    const myTeamMap = roomState.teams?.[user.uid] || {};
    return Object.keys(myTeamMap)
      .map((id) => ALL_PLAYERS.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .sort((a, b) => b.basePrice - a.basePrice);
  }, [roomState, user]);

  const captainPlayer = mySquad.find((p) => p?.id === captain);
  const captainName = captainPlayer?.name || "";
  const vcPlayer = mySquad.find((p) => p?.id === viceCaptain);
  const vcName = vcPlayer?.name || "";

  const selectedPlayers = useMemo(
    () =>
      selected11
        .map((id) => mySquad.find((p) => p?.id === id))
        .filter((p): p is (typeof mySquad)[number] => Boolean(p)),
    [mySquad, selected11],
  );

  const roleCount = useMemo(() => {
    return selectedPlayers.reduce(
      (acc, p) => {
        if (p.role === "Batsman") acc.batsman += 1;
        if (p.role === "Bowler") acc.bowler += 1;
        if (p.role === "All-Rounder") acc.allRounder += 1;
        if (p.role === "WK-Batsman") acc.wicketKeeper += 1;
        if (p.nationality === "Overseas") acc.overseas += 1;
        return acc;
      },
      { batsman: 0, bowler: 0, allRounder: 0, wicketKeeper: 0, overseas: 0 },
    );
  }, [selectedPlayers]);

  const ratingValue = useMemo(() => {
    const raw = Number(analysisResult?.rating ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(10, raw));
  }, [analysisResult?.rating]);

  const breakdown = useMemo(() => {
    const clamp = (v: number) =>
      Math.max(0, Math.min(10, Math.round(v * 10) / 10));
    const batting = clamp(
      4 + roleCount.batsman * 0.95 + roleCount.allRounder * 0.55,
    );
    const bowling = clamp(
      4 + roleCount.bowler * 0.95 + roleCount.allRounder * 0.55,
    );
    const balance = clamp(
      5 +
        roleCount.allRounder * 1.05 +
        (roleCount.wicketKeeper > 0 ? 0.9 : -1.4) -
        Math.abs(roleCount.batsman - roleCount.bowler) * 0.45,
    );
    const leadership = clamp(
      (captain ? 5.4 : 3.2) + (viceCaptain ? 1.2 : 0) + ratingValue * 0.25,
    );
    const fielding = clamp(
      4.7 +
        roleCount.wicketKeeper * 0.9 +
        roleCount.allRounder * 0.45 +
        Math.min(roleCount.overseas, 4) * 0.2,
    );
    const xFactor = clamp(
      4.8 + roleCount.allRounder * 0.75 + ratingValue * 0.2,
    );
    return [
      { label: "Batting", score: batting, color: "#00c896" },
      { label: "Bowling", score: bowling, color: "#ff8c00" },
      { label: "Balance", score: balance, color: "#D4AF37" },
      { label: "Leadership", score: leadership, color: "#4da6ff" },
      { label: "Fielding", score: fielding, color: "#b57bee" },
      { label: "X-Factor", score: xFactor, color: "#ff4060" },
    ];
  }, [captain, ratingValue, roleCount, viceCaptain]);

  const captainAnalysisText = useMemo(() => {
    if (!captainPlayer) return "Pick a captain to unlock leadership analysis.";
    const roleInsight =
      captainPlayer.role === "Batsman"
        ? "anchors the innings and controls pressure phases"
        : captainPlayer.role === "Bowler"
          ? "sets tactical fields and controls middle/death overs"
          : captainPlayer.role === "All-Rounder"
            ? "offers two-dimensional match control"
            : "reads game tempo closely from behind the stumps";
    const viceSupport = vcPlayer
      ? `${vcPlayer.name} provides strong backup as VC.`
      : "Choose a VC to complete the leadership duo.";
    return `${captainPlayer.name} ${roleInsight}. ${viceSupport}`;
  }, [captainPlayer, vcPlayer]);

  const funFactText = useMemo(() => {
    if (selectedPlayers.length === 0)
      return "Select players to reveal your squad fun fact.";
    const expensive = [...selectedPlayers].sort(
      (a, b) => b.basePrice - a.basePrice,
    )[0];
    return `Squad Mix: ${roleCount.batsman} BAT, ${roleCount.bowler} BOWL, ${roleCount.allRounder} AR, ${roleCount.wicketKeeper} WK | Highest base value: ${expensive?.name} (${formatCr(expensive?.basePrice)})`;
  }, [selectedPlayers, roleCount]);

  const selectedOverseas = selected11.filter((id) => {
    const p = mySquad.find((pl) => pl?.id === id);
    return p?.nationality === "Overseas";
  }).length;

  const hasWK = selected11.some((id) => {
    const p = mySquad.find((pl) => pl?.id === id);
    return p?.role === "WK-Batsman";
  });

  const overseasFull = selectedOverseas >= 4;

  const isValid =
    selected11.length === 11 &&
    hasWK &&
    selectedOverseas <= 4 &&
    !!captain &&
    !!viceCaptain &&
    captain !== viceCaptain &&
    mySquad.length > 0;

  const togglePlayer = (id: string) => {
    const player = mySquad.find((p) => p?.id === id);

    if (selected11.includes(id)) {
      setSelected11((prev) => prev.filter((x) => x !== id));
      if (captain === id) setCaptain("");
      if (viceCaptain === id) setViceCaptain("");
      return;
    }

    if (selected11.length >= 11) return;

    if (player?.nationality === "Overseas" && overseasFull) return;

    setSelected11((prev) => [...prev, id]);
  };

  const handleAnalyze = async () => {
    if (!isValid) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const xiPlayers = selectedPlayers;

    try {
      const res = await fetch("/api/analyze-playing11", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: xiPlayers,
          captain: captainName,
          viceCaptain: vcName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.analysis || null);
      } else {
        alert("Analysis failed. Try again.");
      }
    } catch (error) {
      console.error(error);
      alert("Error reaching AI API");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const roleEmoji = (role: string) => {
    if (role === "WK-Batsman") return "🧤";
    if (role === "All-Rounder") return "⚡";
    if (role === "Batsman") return "🏏";
    return "🎯";
  };

  const roleLabel = (role: string) => {
    if (role === "WK-Batsman") return "WK";
    if (role === "All-Rounder") return "AR";
    if (role === "Batsman") return "BAT";
    return "BOWL";
  };

  if (loading || authLoading) {
    return (
      <div
        style={{
          background: "#030c18",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#D4AF37",
          fontFamily: "Rajdhani, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          background: "#030c18",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5a8ab0",
          fontFamily: "Rajdhani, sans-serif",
        }}
      >
        Please sign in to continue.
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#030c18",
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
      `}</style>

      <nav
        style={{
          background: "rgba(3,12,24,0.98)",
          borderBottom: "1px solid #1a3a5c",
          padding: isMobile ? "10px 14px" : "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: "Teko, sans-serif",
            fontSize: isMobile ? "20px" : "26px",
            color: "#D4AF37",
            letterSpacing: 2,
          }}
        >
          🏏 PLAYING 11
        </div>

        <div
          style={{
            fontFamily: "Teko, sans-serif",
            fontSize: isMobile ? "16px" : "20px",
            color: selected11.length === 11 ? "#00c896" : "#ddeeff",
          }}
        >
          {selected11.length}/11
          {selected11.length === 11 && " ✅"}
        </div>

        <button
          onClick={() => {
            window.location.href = `/room/${code}/results`;
          }}
          style={{
            padding: isMobile ? "6px 10px" : "8px 16px",
            borderRadius: 8,
            border: "1px solid #1a3a5c",
            background: "transparent",
            color: "#5a8ab0",
            fontFamily: "Rajdhani, sans-serif",
            fontWeight: 600,
            fontSize: isMobile ? "11px" : "13px",
            cursor: "pointer",
          }}
        >
          ← Results
        </button>
      </nav>

      <div
        style={{
          maxWidth: isMobile ? "100%" : "720px",
          margin: "0 auto",
          padding: isMobile ? "16px 12px 80px" : "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            padding: isMobile ? "14px 12px" : "16px 18px",
            background: "rgba(7,24,44,0.9)",
            border: "1px solid #1a3a5c",
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: isMobile ? "20px" : "24px",
              color: "#D4AF37",
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Select Your Best XI
          </div>
          <div
            style={{
              color: "#5a8ab0",
              fontSize: isMobile ? "12px" : "13px",
              lineHeight: 1.55,
            }}
          >
            Pick exactly 11 players, include at least 1 WK-Batsman, keep max 4
            overseas players, then assign Captain and Vice Captain for AI
            evaluation.
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            background: "rgba(7,24,44,0.9)",
            border: "1px solid #1a3a5c",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 20,
              color: "#D4AF37",
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            👑 Choose Captain & Vice Captain
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                background:
                  selected11.length === 11
                    ? "rgba(0,200,150,0.15)"
                    : "rgba(255,255,255,0.06)",
                border: `1px solid ${
                  selected11.length === 11
                    ? "rgba(0,200,150,0.3)"
                    : "rgba(255,255,255,0.1)"
                }`,
                color: selected11.length === 11 ? "#00c896" : "#ddeeff",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              👥 {selected11.length}/11 Players
            </div>

            <div
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                background: hasWK
                  ? "rgba(0,200,150,0.15)"
                  : "rgba(255,64,96,0.1)",
                border: `1px solid ${
                  hasWK ? "rgba(0,200,150,0.3)" : "rgba(255,64,96,0.3)"
                }`,
                color: hasWK ? "#00c896" : "#ff4060",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              🧤 {hasWK ? "1 WK ✓" : "Need 1 WK"}
            </div>

            <div
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                background: overseasFull
                  ? "rgba(255,140,0,0.12)"
                  : "rgba(255,255,255,0.06)",
                border: `1px solid ${
                  overseasFull ? "rgba(255,140,0,0.4)" : "rgba(255,255,255,0.1)"
                }`,
                color: overseasFull ? "#ff8c00" : "#ddeeff",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              🌏 {selectedOverseas}/4 Overseas
              {overseasFull ? " (MAX)" : ""}
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                color: "#D4AF37",
                fontSize: 10,
                letterSpacing: 3,
                textTransform: "uppercase",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Captain (C)
            </label>
            <select
              value={captain}
              onChange={(e) => setCaptain(e.target.value)}
              style={{
                width: "100%",
                background: "#0d2240",
                border: `1px solid ${captain ? "rgba(212,175,55,0.5)" : "#1a3a5c"}`,
                borderRadius: 10,
                padding: "12px 14px",
                color: captain ? "#D4AF37" : "#5a8ab0",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: isMobile ? "14px" : "15px",
                outline: "none",
                cursor: "pointer",
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235a8ab0' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px",
              }}
            >
              <option
                value=""
                style={{ background: "#07182c", color: "#5a8ab0" }}
              >
                Select Captain
              </option>
              {selected11.map((id) => {
                const p = mySquad.find((pl) => pl?.id === id);
                if (!p) return null;
                return (
                  <option
                    key={id}
                    value={id}
                    disabled={id === viceCaptain}
                    style={{
                      background: "#07182c",
                      color: "#ddeeff",
                    }}
                  >
                    {p.name} —{" "}
                    {p.role === "WK-Batsman"
                      ? "🧤 WK"
                      : p.role === "All-Rounder"
                        ? "⚡ AR"
                        : p.role === "Batsman"
                          ? "🏏 BAT"
                          : "🎯 BOWL"}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                color: "#4da6ff",
                fontSize: 10,
                letterSpacing: 3,
                textTransform: "uppercase",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Vice Captain (VC)
            </label>
            <select
              value={viceCaptain}
              onChange={(e) => setViceCaptain(e.target.value)}
              style={{
                width: "100%",
                background: "#0d2240",
                border: `1px solid ${viceCaptain ? "rgba(77,166,255,0.5)" : "#1a3a5c"}`,
                borderRadius: 10,
                padding: "12px 14px",
                color: viceCaptain ? "#4da6ff" : "#5a8ab0",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: isMobile ? "14px" : "15px",
                outline: "none",
                cursor: "pointer",
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235a8ab0' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px",
              }}
            >
              <option
                value=""
                style={{ background: "#07182c", color: "#5a8ab0" }}
              >
                Select Vice Captain
              </option>
              {selected11.map((id) => {
                const p = mySquad.find((pl) => pl?.id === id);
                if (!p) return null;
                return (
                  <option
                    key={id}
                    value={id}
                    disabled={id === captain}
                    style={{
                      background: "#07182c",
                      color: "#ddeeff",
                    }}
                  >
                    {p.name} —{" "}
                    {p.role === "WK-Batsman"
                      ? "🧤 WK"
                      : p.role === "All-Rounder"
                        ? "⚡ AR"
                        : p.role === "Batsman"
                          ? "🏏 BAT"
                          : "🎯 BOWL"}
                  </option>
                );
              })}
            </select>
          </div>

          {(captain || viceCaptain) && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {captain && (
                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    background: "rgba(212,175,55,0.15)",
                    border: "1px solid rgba(212,175,55,0.3)",
                    color: "#D4AF37",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  👑 {mySquad.find((p) => p?.id === captain)?.name}
                </div>
              )}
              {viceCaptain && (
                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    background: "rgba(77,166,255,0.15)",
                    border: "1px solid rgba(77,166,255,0.3)",
                    color: "#4da6ff",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  🥈 {mySquad.find((p) => p?.id === viceCaptain)?.name}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            background: "rgba(7,24,44,0.9)",
            border: "1px solid #1a3a5c",
            borderRadius: 16,
            padding: isMobile ? "14px 12px" : "18px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontFamily: "Teko, sans-serif",
                fontSize: isMobile ? "22px" : "24px",
                color: "#ddeeff",
                letterSpacing: 1,
              }}
            >
              Squad Players
            </div>
            <div
              style={{
                color: selected11.length === 11 ? "#00c896" : "#ff4060",
                fontSize: isMobile ? "12px" : "13px",
                fontWeight: 700,
              }}
            >
              {selected11.length}/11 selected
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, 1fr)"
                : "repeat(3, 1fr)",
              gap: isMobile ? 8 : 10,
            }}
          >
            {mySquad.map((p) => {
              const isSelected = selected11.includes(p.id);
              const isOverseasBlocked =
                !isSelected && p.nationality === "Overseas" && overseasFull;
              const isBlocked =
                (!isSelected && selected11.length >= 11) || isOverseasBlocked;
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: isMobile ? "10px 8px" : "14px 12px",
                    borderRadius: 12,
                    cursor: isBlocked ? "not-allowed" : "pointer",
                    opacity: isBlocked ? 0.35 : 1,
                    border: `1px solid ${isSelected ? "rgba(0,200,150,0.55)" : "#1a3a5c"}`,
                    background: isSelected
                      ? "rgba(0,200,150,0.12)"
                      : "rgba(255,255,255,0.03)",
                    transition: "all 0.15s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minHeight: isMobile ? 108 : 122,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: isMobile ? "22px" : "28px" }}>
                      {roleEmoji(p.role)}
                    </span>
                    <span
                      style={{
                        color: "#D4AF37",
                        fontFamily: "Teko, sans-serif",
                        fontSize: isMobile ? "16px" : "18px",
                        lineHeight: 1,
                      }}
                    >
                      {formatCr(p.basePrice)}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: isMobile ? "13px" : "14px",
                      color: isSelected ? "#00c896" : "#ddeeff",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#5a8ab0",
                      fontSize: isMobile ? "10px" : "11px",
                      fontWeight: 700,
                    }}
                  >
                    <span>{roleLabel(p.role)}</span>
                    <span>
                      {p.nationality === "Overseas" ? "🌏 OS" : "🇮🇳 IND"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!isValid || isAnalyzing}
          style={{
            width: "100%",
            padding: isMobile ? "16px" : "18px",
            borderRadius: 14,
            border: "none",
            background: isValid
              ? "linear-gradient(135deg, #D4AF37 0%, #f5d76e 50%, #D4AF37 100%)"
              : "#1a3a5c",
            color: isValid ? "#111" : "#5a8ab0",
            fontFamily: "Teko, sans-serif",
            fontWeight: 700,
            fontSize: isMobile ? "18px" : "22px",
            letterSpacing: 1,
            cursor: isValid && !isAnalyzing ? "pointer" : "not-allowed",
            boxShadow: isValid ? "0 8px 28px rgba(212,175,55,0.45)" : "none",
          }}
        >
          {isAnalyzing
            ? "⏳ Submitting..."
            : !hasWK
              ? "⚠️ Add at least 1 Wicket Keeper"
              : selected11.length < 11
                ? `Select ${11 - selected11.length} more players`
                : selectedOverseas > 4
                  ? "⚠️ Max 4 overseas players"
                  : !captain
                    ? "👑 Select a Captain first"
                    : !viceCaptain
                      ? "🥈 Select a Vice Captain"
                      : "🚀 SUBMIT & GET AI ANALYSIS"}
        </button>

        {isAnalyzing && (
          <div
            style={{
              padding: "28px 20px",
              background: "rgba(7,24,44,0.9)",
              border: "1px solid rgba(155,89,182,0.25)",
              borderRadius: 16,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: "4px solid rgba(155,89,182,0.15)",
                borderTopColor: "#b57bee",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <div
              style={{
                fontFamily: "Teko, sans-serif",
                fontSize: isMobile ? "22px" : "26px",
                color: "#b57bee",
                letterSpacing: 2,
                marginBottom: 8,
              }}
            >
              🤖 AI IS ANALYZING...
            </div>
            <div
              style={{
                color: "#5a8ab0",
                fontSize: isMobile ? "13px" : "14px",
                lineHeight: 1.6,
              }}
            >
              Evaluating your team balance,
              <br />
              captain choice and squad strength
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 6,
                marginTop: 16,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#b57bee",
                    animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {analysisResult && (
          <div
            style={{
              background: "rgba(7,24,44,0.95)",
              borderRadius: 16,
              padding: isMobile ? "14px 12px" : "20px 18px",
              border: "1px solid rgba(212,175,55,0.25)",
              color: "#ddeeff",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexDirection: isMobile ? "column" : "row",
                textAlign: isMobile ? "center" : "left",
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 10,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                  }}
                >
                  Overall Rating
                </div>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: isMobile ? "56px" : "72px",
                    color: "#D4AF37",
                    lineHeight: 1,
                    textShadow: "0 0 20px rgba(212,175,55,0.45)",
                  }}
                >
                  {ratingValue.toFixed(1)}
                </div>
              </div>
              <div
                style={{
                  color: "#5a8ab0",
                  fontSize: isMobile ? "13px" : "14px",
                  lineHeight: 1.5,
                }}
              >
                XI: {selected11.length}/11 • WK: {hasWK ? "Yes" : "No"} •
                Captain: {captainName || "-"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "repeat(2, 1fr)"
                  : "repeat(3, 1fr)",
                gap: isMobile ? 8 : 10,
              }}
            >
              {breakdown.map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: isMobile ? "10px 12px" : "14px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div
                    style={{
                      fontSize: isMobile ? "9px" : "10px",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      color: "#5a8ab0",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: isMobile ? "22px" : "28px",
                      color: item.color,
                      lineHeight: 1,
                    }}
                  >
                    {item.score.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  background: "rgba(0,200,150,0.09)",
                  border: "1px solid rgba(0,200,150,0.25)",
                  borderRadius: 12,
                  padding: isMobile ? "10px 12px" : "12px 14px",
                }}
              >
                <div
                  style={{
                    color: "#00c896",
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Strengths
                </div>
                <div
                  style={{
                    fontSize: isMobile ? "12px" : "13px",
                    lineHeight: 1.6,
                    color: "#ddeeff",
                  }}
                >
                  {analysisResult.strengths ||
                    "Balanced squad with strong intent."}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,64,96,0.08)",
                  border: "1px solid rgba(255,64,96,0.22)",
                  borderRadius: 12,
                  padding: isMobile ? "10px 12px" : "12px 14px",
                }}
              >
                <div
                  style={{
                    color: "#ff4060",
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Weaknesses
                </div>
                <div
                  style={{
                    fontSize: isMobile ? "12px" : "13px",
                    lineHeight: 1.6,
                    color: "#ddeeff",
                  }}
                >
                  {analysisResult.weaknesses ||
                    "Some matchups may need role flexibility."}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: isMobile ? "14px" : "16px",
                lineHeight: 1.6,
                color: "#ddeeff",
              }}
            >
              <span style={{ color: "#D4AF37", fontWeight: 700 }}>
                AI Verdict:
              </span>{" "}
              {analysisResult.summary ||
                "Strong combination with a competitive T20 core."}
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(77,166,255,0.08)",
                border: "1px solid rgba(77,166,255,0.24)",
                color: "#ddeeff",
                fontSize: isMobile ? "13px" : "14px",
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: "#4da6ff", fontWeight: 700 }}>
                Captain Analysis:
              </span>{" "}
              {captainAnalysisText}
            </div>

            <div
              style={{
                fontSize: isMobile ? "12px" : "13px",
                padding: isMobile ? "10px 12px" : "12px 16px",
                lineHeight: 1.6,
                background: "rgba(212,175,55,0.08)",
                border: "1px solid rgba(212,175,55,0.2)",
                borderRadius: 12,
                color: "#f4e7b2",
              }}
            >
              💡 {funFactText}
            </div>

            <button
              onClick={() => {
                window.location.href = `/room/${code}/results`;
              }}
              style={{
                width: "100%",
                fontSize: isMobile ? "20px" : "22px",
                padding: isMobile ? "16px" : "18px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #00c896 0%, #00a87a 100%)",
                color: "#fff",
                fontFamily: "Teko, sans-serif",
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
              }}
            >
              🚀 Go to Results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
