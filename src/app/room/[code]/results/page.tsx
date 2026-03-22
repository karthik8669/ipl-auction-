"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue, update } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { players as ALL_PLAYERS, getEspnId } from "@/data/players";
import { toArray, toEntries } from "@/lib/utils";
import { formatCr } from "@/lib/budgetGuard";
import { TradeDrawer } from "@/components/trade/TradeDrawer";
import { LiveChat } from "@/components/auction/LiveChat";
import { AuctionStats } from "@/components/results/AuctionStats";
import { SquadCardGenerator } from "@/components/results/SquadCard";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = String(rawCode || "").trim().toUpperCase();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [roomState, setRoomState] = useState<Record<string, unknown> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, unknown> | null>(
    null,
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [statsTab, setStatsTab] = useState<"analysis" | "overview">("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [squadCardMode, setSquadCardMode] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  // Listen to room — wait for auth, use correct path
  useEffect(() => {
    if (authLoading || !user || !code) return;

    const roomRef = ref(realtimeDb, `rooms/${code}`);
    const unsub = onValue(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          setError("Room not found. The room may have expired.");
          setLoading(false);
          return;
        }
        const data = snap.val() as Record<string, unknown>;
        setRoomState(data);
        setLoading(false);

        if (!selectedTab && user) setSelectedTab(user.uid);

        if (data?.aiAnalysis && typeof data.aiAnalysis === "string") {
          try {
            setAiAnalysis(JSON.parse(data.aiAnalysis) as Record<string, unknown>);
          } catch {
            // ignore parse errors
          }
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [code, user, authLoading]);

  // Trigger AI analysis when auction finishes
  useEffect(() => {
    if (!roomState || aiAnalysis || aiLoading) return;
    const meta = roomState.meta as { status?: string } | undefined;
    if (meta?.status !== "finished") return;

    triggerAiAnalysis();
  }, [roomState, aiAnalysis, aiLoading]);

  async function triggerAiAnalysis() {
    if (!roomState) return;
    setAiLoading(true);
    try {
      const participants = (roomState.participants || {}) as Record<
        string,
        { name?: string; budget?: number; overseas?: number }
      >;
      const teams = (roomState.teams || {}) as Record<
        string,
        Record<string, { soldFor?: number }>
      >;

      const teamsPayload = Object.entries(participants).map(
        ([uid, p]: [string, { name?: string; budget?: number; overseas?: number }]) => {
          const rawTeam = teams[uid] || {};
          const teamPlayers = Object.entries(rawTeam)
            .map(([id, meta]: [string, { soldFor?: number }]) => {
              const pl = ALL_PLAYERS.find((x) => x.id === id);
              return pl
                ? {
                    name: pl.name,
                    role: pl.role,
                    nationality: pl.nationality,
                    soldFor: meta?.soldFor ?? pl.basePrice,
                    basePrice: pl.basePrice,
                    stats: pl.stats,
                  }
                : null;
            })
            .filter(Boolean);

          return {
            name: p?.name || "Unknown",
            budget: (p?.budget ?? 100).toString(),
            overseas: p?.overseas ?? 0,
            players: teamPlayers,
          };
        },
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: teamsPayload }),
      });
      const data = (await res.json()) as { success?: boolean; analysis?: Record<string, unknown> };
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
        await update(ref(realtimeDb, `rooms/${code}`), {
          aiAnalysis: JSON.stringify(data.analysis),
        });
      }
    } catch (e) {
      console.warn("AI analysis failed:", e);
    } finally {
      setAiLoading(false);
    }
  }

  // Build teams data safely
  const teamsData = useMemo(() => {
    if (!roomState) return [];
    const participants = (roomState.participants || {}) as Record<
      string,
      {
        name?: string;
        photoURL?: string;
        budget?: number;
        overseas?: number;
        squadSize?: number;
      }
    >;
    const teams = (roomState.teams || {}) as Record<
      string,
      Record<string, { soldFor?: number; isAutoFilled?: boolean }>
    >;

    return Object.entries(participants)
      .map(([uid, p]) => {
        const rawTeam = teams[uid] || {};
        const teamPlayers = Object.entries(rawTeam)
          .map(([id, meta]) => {
            const pl = ALL_PLAYERS.find((x) => x.id === id);
            if (!pl) return null;
            return {
              ...pl,
              soldFor: meta?.soldFor ?? pl.basePrice,
              isAutoFilled: meta?.isAutoFilled ?? false,
            };
          })
          .filter((v): v is NonNullable<typeof v> => Boolean(v))
          .sort((a, b) => b.soldFor - a.soldFor);

        return {
          uid,
          name: p?.name || "Unknown",
          photoURL: p?.photoURL || "",
          budget: p?.budget ?? 100,
          overseas: p?.overseas ?? 0,
          squadSize: teamPlayers.length,
          players: teamPlayers,
          totalSpent: Math.round((100 - (p?.budget ?? 100)) * 100) / 100,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [roomState]);

  // ── GUARDS ──
  if (authLoading || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030c18",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "4px solid #D4AF37",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 24,
              color: "#D4AF37",
              letterSpacing: 4,
            }}
          >
            LOADING RESULTS...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030c18",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: 40,
            background: "#07182c",
            border: "1px solid #1a3a5c",
            borderRadius: 20,
            maxWidth: 420,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>😕</div>
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 32,
              color: "#ff4060",
              marginBottom: 8,
            }}
          >
            {error}
          </div>
          <p
            style={{
              color: "#5a8ab0",
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            Make sure you have the correct room code and that the auction has
            started.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => router.push(`/room/${code}/auction`)}
              style={{
                padding: "12px 24px",
                borderRadius: 10,
                background: "linear-gradient(135deg,#D4AF37,#f5d76e)",
                border: "none",
                color: "#111",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Back to Auction
            </button>
            <button
              onClick={() => router.push("/lobby")}
              style={{
                padding: "12px 24px",
                borderRadius: 10,
                border: "1px solid #1a3a5c",
                background: "transparent",
                color: "#5a8ab0",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auction still in progress — show message but don't block
  const meta = roomState?.meta as { status?: string } | undefined;
  if (meta?.status === "auction") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030c18",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
          <p
            style={{
              color: "#D4AF37",
              fontFamily: "Teko, sans-serif",
              fontSize: 28,
            }}
          >
            Auction still in progress...
          </p>
          <button
            onClick={() => router.push(`/room/${code}/auction`)}
            style={{
              marginTop: 16,
              padding: "12px 24px",
              borderRadius: 12,
              background: "#D4AF37",
              color: "#111",
              border: "none",
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Back to Auction
          </button>
        </div>
      </div>
    );
  }

  const currentTab = selectedTab || teamsData[0]?.uid || "";
  const selectedTeam = teamsData.find((t) => t.uid === currentTab);
  const unsoldCount = toArray<string>(roomState?.unsoldPlayers).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#030c18",
        padding: "0 0 60px",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(3,12,24,0.95)",
          borderBottom: "1px solid #1a3a5c",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(12px)",
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 36,
              color: "#D4AF37",
              letterSpacing: 4,
            }}
          >
            IPL
          </span>
          <span
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 16,
              color: "#5a8ab0",
              marginLeft: 8,
              letterSpacing: 4,
            }}
          >
            AUCTION 2026 — RESULTS
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span
            style={{
              padding: "4px 14px",
              borderRadius: 20,
              background: "rgba(0,200,150,0.1)",
              border: "1px solid rgba(0,200,150,0.3)",
              color: "#00c896",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            AUCTION COMPLETE
          </span>
          <button
            onClick={() => router.push("/lobby")}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #1a3a5c",
              background: "transparent",
              color: "#5a8ab0",
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← New Auction
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        {/* AI Analysis Banner */}
        <div
          style={{
            marginBottom: 28,
            borderRadius: 16,
            background:
              "linear-gradient(135deg,rgba(212,175,55,0.08),rgba(0,33,71,0.6))",
            border: "1px solid rgba(212,175,55,0.25)",
            padding: "24px 28px",
            boxShadow: "0 0 40px rgba(212,175,55,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 24 }}>🤖</span>
            <div>
              <div
                style={{
                  fontFamily: "Teko, sans-serif",
                  fontSize: 20,
                  color: "#D4AF37",
                  letterSpacing: 2,
                }}
              >
                AI VERDICT
              </div>
              <div
                style={{
                  color: "#5a8ab0",
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                Best Squad Analysis
              </div>
            </div>
          </div>

          {aiLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "2px solid #D4AF37",
                  borderTopColor: "transparent",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#5a8ab0", fontStyle: "italic" }}>
                AI is analyzing all squads...
              </span>
            </div>
          )}

          {aiAnalysis && !aiLoading && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 40 }}>🏆</span>
                <div>
                  <div
                    style={{
                      color: "#5a8ab0",
                      fontSize: 11,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    Best Squad
                  </div>
                  <div
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: 36,
                      color: "#D4AF37",
                      lineHeight: 1,
                    }}
                  >
                    {String(aiAnalysis.winner || "")}
                  </div>
                </div>
              </div>
              <p
                style={{
                  color: "#ddeeff",
                  fontSize: 14,
                  lineHeight: 1.7,
                  marginBottom: 12,
                }}
              >
                {String(aiAnalysis.winnerReason || "")}
              </p>
              {aiAnalysis.funFact != null && String(aiAnalysis.funFact) && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid #1a3a5c",
                    color: "#5a8ab0",
                    fontSize: 13,
                  }}
                >
                  💡 {String(aiAnalysis.funFact)}
                </div>
              )}
            </div>
          )}

          {!aiAnalysis && !aiLoading && (
            <button
              onClick={triggerAiAnalysis}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                background: "linear-gradient(135deg,#D4AF37,#f5d76e)",
                border: "none",
                color: "#111",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              🤖 Analyze Teams with AI
            </button>
          )}

          <div
            style={{
              marginTop: 16,
              color: "#5a8ab0",
              fontSize: 12,
            }}
          >
            Unsold players: {unsoldCount}
          </div>
        </div>

        {/* Auction Stats */}
        <AuctionStats roomState={roomState as any} />

        {/* Leaderboard */}
        <div
          style={{
            marginBottom: 28,
            borderRadius: 16,
            background: "#07182c",
            border: "1px solid #1a3a5c",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid #1a3a5c",
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              color: "#D4AF37",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            Final Leaderboard
          </div>
          {teamsData.map((team, i) => (
            <div
              key={team.uid}
              onClick={() => setSelectedTab(team.uid)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 24px",
                borderBottom:
                  i < teamsData.length - 1
                    ? "1px solid rgba(255,255,255,0.04)"
                    : "none",
                cursor: "pointer",
                background:
                  team.uid === currentTab ? "rgba(212,175,55,0.06)" : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Teko, sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  background:
                    i === 0
                      ? "#D4AF37"
                      : i === 1
                        ? "#aaa"
                        : i === 2
                          ? "#cd7f32"
                          : "rgba(255,255,255,0.06)",
                  color: i < 3 ? "#111" : "#5a8ab0",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>

              <img
                src={team.photoURL}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=1a3a5c&color=D4AF37&bold=true`;
                }}
              />

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#ddeeff",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {team.name}
                  {team.uid === user?.uid && (
                    <span
                      style={{
                        fontSize: 10,
                        background: "rgba(0,200,150,0.15)",
                        color: "#00c896",
                        padding: "1px 8px",
                        borderRadius: 20,
                        fontWeight: 700,
                        letterSpacing: 1,
                      }}
                    >
                      YOU
                    </span>
                  )}
                  {aiAnalysis?.winner === team.name && (
                    <span
                      style={{
                        fontSize: 10,
                        background: "rgba(212,175,55,0.2)",
                        color: "#D4AF37",
                        padding: "1px 8px",
                        borderRadius: 20,
                        fontWeight: 700,
                      }}
                    >
                      🏆 BEST TEAM
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {team.players.length}/20 players · {team.overseas}/8 overseas
                </div>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 22,
                    color: "#D4AF37",
                    lineHeight: 1,
                  }}
                >
                  {formatCr(team.totalSpent)}
                </div>
                <div style={{ color: "#5a8ab0", fontSize: 11 }}>spent</div>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 18,
                    color: team.budget < 10 ? "#ff4060" : "#00c896",
                    lineHeight: 1,
                  }}
                >
                  {formatCr(team.budget)}
                </div>
                <div style={{ color: "#5a8ab0", fontSize: 11 }}>
                  remaining
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Squad Viewer */}
        {selectedTeam && (
          <div
            style={{
              borderRadius: 16,
              background: "#07182c",
              border: "1px solid #1a3a5c",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                overflowX: "auto",
                borderBottom: "1px solid #1a3a5c",
                background: "rgba(3,12,24,0.5)",
              }}
            >
              {teamsData.map((team) => (
                <button
                  key={team.uid}
                  onClick={() => { setSelectedTab(team.uid); setSquadCardMode(false); }}
                  style={{
                    padding: "12px 20px",
                    border: "none",
                    borderBottom: `2px solid ${
                      team.uid === currentTab ? "#D4AF37" : "transparent"
                    }`,
                    background: "transparent",
                    color: team.uid === currentTab ? "#D4AF37" : "#5a8ab0",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    letterSpacing: 1,
                    transition: "all 0.15s",
                  }}
                >
                  {team.name}
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      background: "rgba(255,255,255,0.08)",
                      padding: "1px 7px",
                      borderRadius: 20,
                      color: "#5a8ab0",
                    }}
                  >
                    {team.players.length}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setSquadCardMode(true)}
                style={{
                  padding: "12px 20px", border: "none",
                  borderBottom: `2px solid ${squadCardMode ? "#D4AF37" : "transparent"}`,
                  background: "transparent", color: squadCardMode ? "#D4AF37" : "#5a8ab0",
                  fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 1, transition: "all 0.15s",
                }}
              >
                🎨 Squad Card
              </button>
            </div>

            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #1a3a5c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 28,
                    color: "#D4AF37",
                    lineHeight: 1,
                  }}
                >
                  {selectedTeam.name}&apos;s {squadCardMode ? "Squad Card" : "Squad"}
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {selectedTeam.players.length}/20 players ·
                  {formatCr(selectedTeam.totalSpent)} spent ·
                  {formatCr(selectedTeam.budget)} remaining
                </div>
              </div>
              <button
                onClick={() => {
                  const text = [
                    `=== ${selectedTeam.name}'s IPL 2026 Squad ===`,
                    `Spent: ${formatCr(selectedTeam.totalSpent)} | Left: ${formatCr(selectedTeam.budget)}`,
                    "",
                    ...selectedTeam.players.map(
                      (p) => `${p.name} (${p.role}) — ${formatCr(p.soldFor)}`,
                    ),
                  ].join("\n");
                  navigator.clipboard?.writeText(text);
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(212,175,55,0.3)",
                  background: "rgba(212,175,55,0.08)",
                  color: "#D4AF37",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                📋 Copy Team
              </button>
            </div>

            <div style={{ padding: squadCardMode ? "0" : "16px 24px" }}>
              {squadCardMode ? (
                <SquadCardGenerator 
                  team={selectedTeam as any} 
                  franchise={(roomState as any)?.franchises?.[selectedTeam.uid] || { name: selectedTeam.name, color: '#D4AF37', logo: '🏏' }} 
                />
              ) : (
                <>
              {(
                [
                  "Batsman",
                  "WK-Batsman",
                  "All-Rounder",
                  "Bowler",
                ] as const
              ).map((role) => {
                const rolePlayers = selectedTeam.players.filter(
                  (p) => p.role === role,
                );
                if (!rolePlayers.length) return null;
                const roleColors: Record<string, string> = {
                  Batsman: "#00c896",
                  "WK-Batsman": "#ff8c00",
                  "All-Rounder": "#b57bee",
                  Bowler: "#ff4060",
                };
                const color = (roleColors as any)[role] || "#5a8ab0";
                return (
                  <div key={role} style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: 3,
                        color,
                        textTransform: "uppercase",
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 1,
                          background: color,
                          display: "inline-block",
                        }}
                      />
                      {role}s ({rolePlayers.length})
                      <span
                        style={{
                          flex: 1,
                          height: 1,
                          background: `linear-gradient(90deg,${color}40,transparent)`,
                          display: "inline-block",
                        }}
                      />
                    </div>

                    {rolePlayers.map((p) => {
                      const espnId = getEspnId(p.id);
                      const imgSrc = espnId
                        ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${espnId}.png`
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true&size=80`;
                      return (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 14px",
                            borderRadius: 10,
                            marginBottom: 6,
                            background: "rgba(13,34,64,0.5)",
                            border: "1px solid #1a3a5c",
                          }}
                        >
                          <img
                            src={imgSrc}
                            alt=""
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true&size=80`;
                            }}
                          />
                          <span style={{ fontSize: 16, flexShrink: 0 }}>
                            {p.nationality === "Indian" ? "🇮🇳" : "🌏"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontFamily: "Rajdhani, sans-serif",
                                fontWeight: 700,
                                fontSize: 15,
                                color: "#ddeeff",
                              }}
                            >
                              {p.name}
                              {p.isAutoFilled && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 10,
                                    background: "rgba(255,255,255,0.08)",
                                    color: "#5a8ab0",
                                    padding: "1px 7px",
                                    borderRadius: 20,
                                  }}
                                >
                                  AUTO
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#5a8ab0", fontSize: 11 }}>
                              {p.stats}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div
                              style={{
                                fontFamily: "Teko, sans-serif",
                                fontSize: 18,
                                color: "#D4AF37",
                                lineHeight: 1,
                              }}
                            >
                              {formatCr(p.soldFor)}
                            </div>
                            <div style={{ color: "#5a8ab0", fontSize: 10 }}>
                              Base {formatCr(p.basePrice)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              </>
            )}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5a8ab0', fontSize: 13, letterSpacing: 1, fontFamily: 'Rajdhani, sans-serif' }}>
        Designed and Developed by Kartik Jain
      </div>

      <LiveChat code={code} user={user} roomState={roomState as any} isOpen={chatOpen} onToggle={() => setChatOpen(o => !o)} />
      <TradeDrawer roomState={roomState as any} user={user} code={code} />
    </div>
  );
}
