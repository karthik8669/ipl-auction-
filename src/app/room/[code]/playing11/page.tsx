"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { players as ALL_PLAYERS, getEspnId } from "@/data/players";

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
  const code = String(rawCode || "").trim().toUpperCase();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [roomState, setRoomState] = useState<RoomStateLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected11, setSelected11] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string>("");
  const [viceCaptain, setViceCaptain] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

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

  const hasWK = selected11.some((id) => {
    const p = mySquad.find((pl) => pl?.id === id);
    return p?.role === "WK-Batsman";
  });

  const isValid =
    selected11.length === 11 &&
    hasWK &&
    !!captain &&
    !!viceCaptain &&
    captain !== viceCaptain &&
    mySquad.length > 0;

  const togglePlayer = (id: string) => {
    setSelected11((prev) => {
      if (prev.includes(id)) {
        if (captain === id) setCaptain("");
        if (viceCaptain === id) setViceCaptain("");
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 11) return prev;
      return [...prev, id];
    });
  };

  const handleAnalyze = async () => {
    if (!isValid) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const xiPlayers = selected11
      .map((id) => mySquad.find((p) => p?.id === id))
      .filter(Boolean);

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
    <div style={{ minHeight: "100vh", background: "#030c18", padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 36,
              color: "#D4AF37",
              margin: 0,
              letterSpacing: 1,
            }}
          >
            PLAYING 11
          </h1>
          <div style={{ color: "#5a8ab0", fontSize: 13 }}>
            Select your best 11 and get AI feedback
          </div>
        </div>
        <button
          onClick={() => router.push(`/room/${code}/results`)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid #1a3a5c",
            color: "#5a8ab0",
            cursor: "pointer",
            fontFamily: "Rajdhani, sans-serif",
            fontWeight: 700,
          }}
        >
          ← Back to Results
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div
          style={{
            background: "#07182c",
            borderRadius: 16,
            padding: 20,
            border: "1px solid #1a3a5c",
          }}
        >
          <h2 style={{ color: "#ddeeff", marginTop: 0, marginBottom: 16, fontSize: 18 }}>
            Your Squad ({mySquad.length})
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {mySquad.map((p) => {
              const isSelected = selected11.includes(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 10,
                    cursor: "pointer",
                    background: isSelected ? "rgba(0, 200, 150, 0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? "#00c896" : "#1a3a5c"}`,
                  }}
                >
                  <img
                    src={`https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(p.id)}.png`}
                    alt={p.name}
                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", background: "#111" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isSelected ? "#00c896" : "#ddeeff", fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#5a8ab0" }}>
                      {p.role} · {p.nationality === "Overseas" ? "OS" : "IND"} · {formatCr(p.basePrice)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "#07182c",
              borderRadius: 16,
              padding: 20,
              border: "1px solid #1a3a5c",
            }}
          >
            <div style={{ color: selected11.length === 11 ? "#00c896" : "#ff4060", marginBottom: 8 }}>
              {selected11.length}/11 Players Selected
            </div>
            <div style={{ color: hasWK ? "#00c896" : "#ff4060", marginBottom: 12, fontSize: 13 }}>
              {hasWK ? "✓ Wicket Keeper Included" : "✗ Need at least 1 WK"}
            </div>

            <label style={{ color: "#5a8ab0", fontSize: 12, display: "block", marginBottom: 6 }}>
              Captain
            </label>
            <select
              value={captain}
              onChange={(e) => setCaptain(e.target.value)}
              style={{
                width: "100%",
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1a3a5c",
                background: "rgba(255,255,255,0.03)",
                color: "#ddeeff",
              }}
            >
              <option value="">Select Captain</option>
              {selected11
                .filter((id) => !!id)
                .map((id) => {
                  const p = mySquad.find((pl) => pl?.id === id);
                  if (!p) return null;
                  return (
                    <option key={id} value={id} disabled={id === viceCaptain}>
                      {p.name} ({p.role === "WK-Batsman" ? "WK" : p.role === "All-Rounder" ? "AR" : p.role === "Batsman" ? "BAT" : "BOWL"})
                    </option>
                  );
                })
                .filter(Boolean)}
            </select>

            <label style={{ color: "#5a8ab0", fontSize: 12, display: "block", marginBottom: 6 }}>
              Vice Captain
            </label>
            <select
              value={viceCaptain}
              onChange={(e) => setViceCaptain(e.target.value)}
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1a3a5c",
                background: "rgba(255,255,255,0.03)",
                color: "#ddeeff",
              }}
            >
              <option value="">Select Vice Captain</option>
              {selected11
                .filter((id) => !!id)
                .map((id) => {
                  const p = mySquad.find((pl) => pl?.id === id);
                  if (!p) return null;
                  return (
                    <option key={id} value={id} disabled={id === captain}>
                      {p.name} ({p.role === "WK-Batsman" ? "WK" : p.role === "All-Rounder" ? "AR" : p.role === "Batsman" ? "BAT" : "BOWL"})
                    </option>
                  );
                })
                .filter(Boolean)}
            </select>

            <div style={{ color: captain ? "#00c896" : "#ff4060", marginBottom: 8, fontSize: 13 }}>
              {captain ? `✓ Captain: ${captainName}` : "✗ Select Captain"}
            </div>
            <div style={{ color: viceCaptain ? "#00c896" : "#ff4060", marginBottom: 16, fontSize: 13 }}>
              {viceCaptain ? `✓ Vice Captain: ${vcName}` : "✗ Select Vice Captain"}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!isValid || isAnalyzing}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: "none",
                background: isValid ? "linear-gradient(135deg, #D4AF37, #f5d76e)" : "#1a3a5c",
                color: isValid ? "#000" : "#5a8ab0",
                fontWeight: 700,
                cursor: isValid ? "pointer" : "not-allowed",
              }}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze Playing 11"}
            </button>
          </div>

          {analysisResult && (
            <div
              style={{
                background: "rgba(212,175,55,0.05)",
                borderRadius: 16,
                padding: 20,
                border: "1px solid rgba(212,175,55,0.2)",
                color: "#ddeeff",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 8, fontFamily: "Teko, sans-serif" }}>AI Verdict</div>
              <div style={{ color: "#D4AF37", fontSize: 22, fontFamily: "Teko, sans-serif", marginBottom: 8 }}>
                Rating: {analysisResult.rating ?? "-"}/10
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Strengths:</strong> {analysisResult.strengths || "-"}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Weaknesses:</strong> {analysisResult.weaknesses || "-"}
              </div>
              <div>
                <strong>Summary:</strong> {analysisResult.summary || "-"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}