"use client";

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { useAuction } from "@/hooks/useAuction";
import { useTimer } from "@/hooks/useTimer";
import { players as ALL_PLAYERS, getEspnId } from "@/data/players";
import { ref, push, update, get, onValue, off } from "firebase/database";
import { realtimeDb as db } from "@/lib/firebase";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { CircularTimer } from "@/components/auction/CircularTimer";
import { AudioControls } from "@/components/shared/AudioControls";
import { audioManager } from "@/lib/audioManager";
import { toast, Toaster } from "react-hot-toast";
import { firebaseArrayToArray, cn, toArray } from "@/lib/utils";
import { getNextBidAmount, formatCr } from "@/lib/budgetGuard";
import { TradeDrawer } from "@/components/trade/TradeDrawer";
import { LiveChat } from "@/components/auction/LiveChat";
import type { BidEntry } from "@/types/room";
import type { BudgetGuardResult } from "@/lib/budgetGuard";
import type { ParticipantState } from "@/types/room";
import type { Player } from "@/data/players";

// ─── Helper: Quick bid options ───
function getQuickBidOptions(currentBid: number, myBudget: number) {
  const next = getNextBidAmount(currentBid);
  const mid = getNextBidAmount(next);
  const high =
    currentBid < 2
      ? Math.round((currentBid + 0.5) * 100) / 100
      : Math.round((currentBid + 1.0) * 100) / 100;
  return [
    { amount: next, label: "Min Raise" },
    { amount: mid, label: "+1 Step" },
    { amount: Math.min(high, myBudget), label: "Big Jump" },
  ].filter((o) => o.amount <= myBudget);
}

// ─── Helper: Bid block reason ───
function getBidBlockReason(
  me: ParticipantState | null | undefined,
  player: Player | null,
  nextBid: number,
  guard: BudgetGuardResult | null
): string {
  if (!me) return "Not in room";
  if (me.squadSize >= 20) return "✅ Squad Full (20/20)";
  if (guard?.status === "blocked")
    return `🚫 Budget reserved for ${guard.slotsLeft} slots`;
  if (me.budget < nextBid) return "💰 Insufficient Budget";
  if (player?.nationality === "Overseas" && me.overseas >= 8)
    return "🌏 Overseas Limit (8/8)";
  return "Cannot bid right now";
}

export default function AuctionPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").trim().toUpperCase();
  const {
    currentRoom,
    roomCode,
    joinRoom,
    setRoomCode,
    leaveRoom,
  } = useRoom();
  const {
    auction,
    currentPlayer: hookCurrentPlayer,
    nextBidAmount,
    myState: me,
    budgetGuard,
    placeBid,
    finalizeSold,
    finalizeUnsold,
    pauseAuction,
    resumeAuction,
  } = useAuction(currentRoom, roomCode);
  const { seconds } = useTimer(auction?.timerEnd ?? 0);
  const [windowWidth, setWindowWidth] = useState(1200)

  useEffect(() => {
    setWindowWidth(window.innerWidth)
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const isMobile = windowWidth < 768
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSec = useRef(-1);
  const prevPhaseRef = useRef<string>("");
  const prevBidCountRef = useRef(0);

  const participants = currentRoom?.participants || {};
  const isHost = (currentRoom?.meta?.hostId || "") === user?.uid;
  const pool = firebaseArrayToArray<string>(currentRoom?.auction?.pool);
  const currentIndex = currentRoom?.auction?.currentIndex ?? 0;
  const currentPlayerId = pool[currentIndex] || null;
  const currentPlayer =
    currentPlayerId
      ? ALL_PLAYERS.find((p) => p.id === currentPlayerId) ||
        hookCurrentPlayer ||
        null
      : hookCurrentPlayer || null;

  const myTeam = useMemo(() => {
    if (!user) return [];
    const teamMap = currentRoom?.teams?.[user.uid] || {};
    return Object.entries(teamMap)
      .map(([pid, t]) => {
        const p = ALL_PLAYERS.find((x) => x.id === pid);
        return p ? { ...p, soldFor: t.soldFor } : null;
      })
      .filter((x): x is Player & { soldFor: number } => x !== null);
  }, [user, currentRoom?.teams]);

  const currentBid = currentRoom?.auction?.currentBid ?? 0;
  const leaderId = currentRoom?.auction?.leaderId ?? null;
  const leaderName = auction?.leaderName ?? null;
  const phase = currentRoom?.auction?.phase ?? "waiting";
  const timerEnd = currentRoom?.auction?.timerEnd ?? null;
  const bidHistory = firebaseArrayToArray<BidEntry>(auction?.bidHistory);

  const canBid =
    !!me &&
    !!currentPlayer &&
    !!user &&
    phase === "bidding" &&
    leaderId !== user.uid &&
    me.squadSize < 20 &&
    (currentPlayer.nationality !== "Overseas" || me.overseas < 8) &&
    !!budgetGuard?.canBid &&
    me.budget >= nextBidAmount;

  const handleLeave = useCallback(async () => {
    await leaveRoom();
    router.push("/lobby");
  }, [leaveRoom, router]);

  const handlePlaceBid = useCallback(async () => {
    await audioManager.resume();
    const ok = await placeBid(nextBidAmount);
    if (ok) {
      audioManager.playBid();
      toast.success(`You bid ${nextBidAmount.toFixed(2)} Cr`);
    }
  }, [placeBid, nextBidAmount]);

  const handleBidAmount = useCallback(
    async (amount: number) => {
      await audioManager.resume();
      const ok = await placeBid(amount);
      if (ok) {
        audioManager.playBid();
        toast.success(`You bid ${formatCr(amount)}`);
      }
    },
    [placeBid]
  );

  const handleSkipOrPass = useCallback(() => {
    if (isHost) {
      finalizeUnsold();
    }
  }, [isHost, finalizeUnsold]);

  const handleWithdraw = useCallback(() => {
    toast("You passed on " + (currentPlayer?.name ?? "this player"), {
      icon: "⏭",
    });
  }, [currentPlayer?.name]);

  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [showFranchises, setShowFranchises] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [rtmWindow, setRtmWindow] = useState<{
    active: boolean
    playerId: string
    playerName: string
    amount: number
    originalWinnerId: string
    originalWinnerName: string
    expiresAt: number
  } | null>(null)
  const [rtmCountdown, setRtmCountdown] = useState(0)
  const myRtmUsed = currentRoom?.rtm?.[user?.uid || '']?.used ?? false

  useEffect(() => {
    if (!code) return
    const rtmRef = ref(db, `rooms/${code}/rtmWindow`)
    const unsub = onValue(rtmRef, snap => {
      if (!snap.exists()) return
      const data = snap.val()
      setRtmWindow(data)
    })
    return () => off(rtmRef)
  }, [code])

  useEffect(() => {
    if (!rtmWindow?.active || !rtmWindow.expiresAt) return
    const interval = setInterval(() => {
      const rem = Math.ceil((rtmWindow.expiresAt - Date.now()) / 1000)
      setRtmCountdown(Math.max(0, rem))
    }, 100)
    return () => clearInterval(interval)
  }, [rtmWindow])

  const currentPlayerIsOverseas = ALL_PLAYERS.find(p => p.id === rtmWindow?.playerId)?.nationality === 'Overseas'
  const canUseRtm = !!(
    rtmWindow?.active &&
    phase === 'sold' &&
    !myRtmUsed &&
    (me?.budget ?? 0) >= rtmWindow.amount &&
    (me?.squadSize ?? 0) < 20 &&
    !(currentPlayerIsOverseas && (me?.overseas ?? 0) >= 8) &&
    rtmWindow.originalWinnerId !== user?.uid
  )

  async function handleUseRtm() {
    if (!user || !rtmWindow || myRtmUsed || !code) return
    const updates: Record<string, any> = {}
    const player = ALL_PLAYERS.find(p => p.id === rtmWindow.playerId)
    
    updates[`rooms/${code}/rtm/${user.uid}/used`] = true
    updates[`rooms/${code}/rtm/${user.uid}/usedOn`] = rtmWindow.playerId
    updates[`rooms/${code}/rtm/${user.uid}/usedAt`] = Date.now()
    updates[`rooms/${code}/teams/${rtmWindow.originalWinnerId}/${rtmWindow.playerId}`] = null
    updates[`rooms/${code}/teams/${user.uid}/${rtmWindow.playerId}`] = {
      soldFor: rtmWindow.amount,
      addedAt: Date.now(),
      isRtm: true,
    }
    
    const meSnap = await get(ref(db, `rooms/${code}/participants/${user.uid}`))
    const origSnap = await get(ref(db, `rooms/${code}/participants/${rtmWindow.originalWinnerId}`))
    const meData = meSnap.val() || {}
    const origData = origSnap.val() || {}
    
    updates[`rooms/${code}/participants/${user.uid}/budget`] =
      Math.round(((meData.budget || 100) - rtmWindow.amount) * 100) / 100
    updates[`rooms/${code}/participants/${user.uid}/squadSize`] =
      (meData.squadSize || 0) + 1
    updates[`rooms/${code}/participants/${rtmWindow.originalWinnerId}/budget`] =
      Math.round(((origData.budget || 100) + rtmWindow.amount) * 100) / 100
    updates[`rooms/${code}/participants/${rtmWindow.originalWinnerId}/squadSize`] =
      Math.max(0, (origData.squadSize || 0) - 1)
    
    if (player?.nationality === 'Overseas') {
      updates[`rooms/${code}/participants/${user.uid}/overseas`] =
        (meData.overseas || 0) + 1
      updates[`rooms/${code}/participants/${rtmWindow.originalWinnerId}/overseas`] =
        Math.max(0, (origData.overseas || 0) - 1)
    }
    
    updates[`rooms/${code}/rtmWindow/active`] = false
    await update(ref(db), updates)
    
    const franchise = currentRoom?.franchises?.[user.uid]
    toast.success(
      `🃏 RTM used! ${rtmWindow.playerName} joins ${franchise?.name || 'your team'}!`,
      { duration: 4000 }
    )
    
    postSystemMessage(
      `🃏 RTM! ${franchise?.name || user.displayName} matched ${formatCr(rtmWindow.amount)} and took ${rtmWindow.playerName}!`
    )
  }

  async function postSystemMessage(text: string) {
    if (!code) return;
    await push(ref(db, `rooms/${code}/chat`), {
      userId: 'system',
      name: 'System',
      photoURL: '',
      text,
      type: 'system',
      createdAt: Date.now(),
    });
  }

  useEffect(() => {
    if (code) {
      setRoomCode(code);
      joinRoom(code);
    }
  }, [code, joinRoom, setRoomCode]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFranchises(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    if (currentRoom?.meta?.status === "finished") {
      audioManager.stopMusic();
      router.push(`/room/${code}/results`);
    }
  }, [code, currentRoom?.meta?.status, router]);

  useEffect(() => {
    const startMusic = () => {
      audioManager.resume().then(() => {
        audioManager.startAuctionMusic();
      });
      document.removeEventListener("click", startMusic);
    };
    document.addEventListener("click", startMusic, { once: true });
    return () => audioManager.stopMusic();
  }, []);

  useEffect(() => {
    if (!phase || phase === prevPhaseRef.current) return;
    
    // System messages logic (Only Host triggers this to avoid duplicate entries)
    if (isHost) {
      if (prevPhaseRef.current === 'waiting' && phase === 'bidding') {
        postSystemMessage('🚀 Auction has started! Good luck everyone!');
      } else if (phase === 'sold' && currentPlayer && leaderName) {
        const f = currentRoom?.franchises?.[leaderId!];
        const fname = f?.name || leaderName;
        const flogo = f?.logo || '🏏';
        postSystemMessage(`🔨 ${currentPlayer.name} SOLD to ${flogo} ${fname} for ${formatCr(currentBid)}!`);
        
        // START RTM WINDOW
        update(ref(db, `rooms/${code}/rtmWindow`), {
          active: true,
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          amount: currentBid,
          originalWinnerId: leaderId,
          originalWinnerName: leaderName,
          expiresAt: Date.now() + 5000,
        });
        setTimeout(() => {
          update(ref(db, `rooms/${code}/rtmWindow`), { active: false });
        }, 5000);
      } else if (phase === 'unsold' && currentPlayer) {
        postSystemMessage(`😔 ${currentPlayer.name} went UNSOLD`);
      }
    }

    prevPhaseRef.current = phase;
    if (phase === "sold") audioManager.playSold();
    else if (phase === "unsold") audioManager.playUnsold();
    else if (phase === "bidding") audioManager.playNewPlayer();
  }, [phase, isHost, currentPlayer, leaderName, leaderId, currentBid, currentRoom?.franchises, code]);

  useEffect(() => {
    const count = bidHistory?.length ?? 0;
    if (count > prevBidCountRef.current) {
      const hadBidsBefore = prevBidCountRef.current > 0;
      prevBidCountRef.current = count;
      if (hadBidsBefore) {
        const latest = bidHistory?.[0];
        if (latest && latest.userId !== user?.uid) {
          audioManager.playOutbid();
        }
      }
    }
  }, [bidHistory, user?.uid]);

  useEffect(() => {
    if (phase !== "bidding") return;
    if (
      seconds <= 3 &&
      seconds > 0 &&
      seconds !== prevSec.current
    ) {
      audioManager.playTimerCritical();
    } else if (
      seconds <= 5 &&
      seconds > 3 &&
      seconds !== prevSec.current
    ) {
      audioManager.playTimerWarning();
    }
    prevSec.current = seconds;
  }, [seconds, phase]);

  useEffect(() => {
    if (!currentRoom?.meta) return
    const status = currentRoom.meta.status
    // Only redirect FORWARD to results — never back to waiting room
    if (status === 'finished') {
      window.location.replace(`/room/${code}/results`)
    }
  }, [currentRoom?.meta?.status, code])

  // Auth redirect — must be in useEffect, never in render body
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.replace('/')
    }
  }, [user, authLoading])

  useEffect(() => {
    if (!isHost || !auction || !roomCode) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      if (auction.phase !== "bidding" || !auction.timerEnd) return;
      if (Date.now() >= auction.timerEnd) {
        if (auction.leaderId) await finalizeSold();
        else await finalizeUnsold();
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [auction, finalizeSold, finalizeUnsold, isHost, roomCode]);

  if (authLoading || !user) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#030c18',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid rgba(212,175,55,0.15)',
        borderTopColor: '#D4AF37',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
  if (!currentRoom || !auction) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#030c18', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid rgba(212,175,55,0.15)',
        borderTopColor: '#D4AF37',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{
        fontFamily: 'Teko, sans-serif',
        fontSize: 20, color: '#D4AF37', letterSpacing: 4,
      }}>LOADING AUCTION...</div>
    </div>
  )
  if (!currentPlayer) {
    return (
      <AuthGuard>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#030c18',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{ fontSize: 56 }}>⏳</div>
          <div style={{
            fontFamily: 'Teko, sans-serif',
            fontSize: 28, color: '#D4AF37',
            letterSpacing: 4,
          }}>
            AUCTION STARTING...
          </div>
          <div style={{ color: '#5a8ab0', fontSize: 14 }}>
            Waiting for host to begin
          </div>
          <button
            onClick={() => window.location.href = `/room/${code}`}
            style={{
              marginTop: 16,
              padding: '10px 24px',
              borderRadius: 10,
              border: '1px solid #1a3a5c',
              background: 'transparent',
              color: '#5a8ab0',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600, fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ← Back to Waiting Room
          </button>
        </div>
      </AuthGuard>
    );
  }

  const quickBidOptions = getQuickBidOptions(
    currentBid,
    me?.budget ?? 100
  );

  return (
    <AuthGuard>
      <Toaster />
      <div
        className="grid grid-rows-[auto_1fr] h-screen min-h-screen overflow-hidden"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '280px 1fr 280px',
          background: "#030c18",
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.25) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.08) 0%, transparent 50%)
          `,
        }}
      >
        {/* ─── TOP NAVBAR ─── */}
        <div
          style={{
            gridColumn: "1 / -1",
            background: "rgba(3,12,24,0.95)",
            borderBottom: "1px solid #1a3a5c",
            backdropFilter: "blur(12px)",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <span
                style={{
                  fontFamily: "Teko, sans-serif",
                  fontSize: 32,
                  color: "#D4AF37",
                  letterSpacing: 4,
                }}
              >
                IPL
              </span>
              <span
                style={{
                  fontFamily: "Teko, sans-serif",
                  fontSize: 14,
                  color: "#5a8ab0",
                  marginLeft: 6,
                  letterSpacing: 4,
                }}
              >
                AUCTION 2026
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,64,96,0.12)",
                border: "1px solid rgba(255,64,96,0.3)",
                padding: "4px 12px",
                borderRadius: 20,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#ff4060",
                  boxShadow: "0 0 0 3px rgba(255,64,96,0.3)",
                  animation: "livePulse 1s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  color: "#ff4060",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                }}
              >
                LIVE
              </span>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                color: "#5a8ab0",
                fontSize: 10,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              Room
            </div>
            <div
              style={{
                fontFamily: "Teko, sans-serif",
                fontSize: 22,
                color: "#D4AF37",
                letterSpacing: 6,
                lineHeight: 1,
              }}
            >
              {roomCode || code}
            </div>
            <div style={{ color: "#5a8ab0", fontSize: 11, marginTop: 2 }}>
              Player{" "}
              <span style={{ color: "#ddeeff" }}>{currentIndex + 1}</span> of{" "}
              {pool.length}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                background: "rgba(212,175,55,0.1)",
                border: "1px solid rgba(212,175,55,0.3)",
              }}
            >
              <div
                style={{
                  color: "#5a8ab0",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                My Budget
              </div>
              <div
                style={{
                  fontFamily: "Teko, sans-serif",
                  fontSize: 20,
                  color: "#D4AF37",
                  lineHeight: 1,
                }}
              >
                {formatCr(me?.budget ?? 100)}
              </div>
            </div>

            <div style={{
              padding: '8px 12px',
              borderRadius: 8, marginTop: 8, marginBottom: 16,
              background: myRtmUsed ? 'rgba(255,255,255,0.04)' : 'rgba(255,140,0,0.08)',
              border: `1px solid ${myRtmUsed ? 'rgba(255,255,255,0.06)' : 'rgba(255,140,0,0.3)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>🃏</span>
              <div>
                <div style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 13, color: myRtmUsed ? '#5a8ab0' : '#ff8c00' }}>
                  RTM Card
                </div>
                <div style={{ color: '#5a8ab0', fontSize: 10 }}>
                  {myRtmUsed ? 'Used ✓' : '1 available — use wisely!'}
                </div>
              </div>
            </div>

            {/* Mobile drawer toggles */}
            <div className="flex gap-2 md:hidden">
              <button
                onClick={() => setLeftDrawerOpen((o) => !o)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #1a3a5c",
                  background: leftDrawerOpen ? "rgba(212,175,55,0.15)" : "transparent",
                  color: "#D4AF37",
                  fontFamily: "Rajdhani, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                My Squad
              </button>
              <button
                onClick={() => setShowFranchises(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #1a3a5c",
                  background: showFranchises
                    ? "rgba(212,175,55,0.15)"
                    : "transparent",
                  color: "#D4AF37",
                  fontFamily: "Rajdhani, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                👥 All Teams
              </button>
            </div>
            <button
              onClick={handleLeave}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "1px solid #1a3a5c",
                background: "transparent",
                color: "#5a8ab0",
                fontFamily: "Rajdhani, sans-serif",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ← Leave
            </button>
          </div>
        </div>

        {/* Mobile drawer backdrop */}
        {leftDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => {
              setLeftDrawerOpen(false);
            }}
            aria-hidden
          />
        )}

        {/* ─── LEFT SIDEBAR — MY SQUAD ─── */}
        <div
          className={`${leftDrawerOpen ? "fixed inset-y-0 left-0 z-50 flex w-[280px] shadow-2xl md:relative md:inset-auto md:z-auto md:w-auto md:shadow-none" : ""}`}
          style={{
            display: leftDrawerOpen ? 'flex' : (isMobile ? 'none' : 'flex'),
            background: "rgba(7,24,44,0.9)",
            borderRight: "1px solid #1a3a5c",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid #1a3a5c",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "#D4AF37",
                letterSpacing: 3,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              <div className="flex items-center justify-between">
                <span>My Squad</span>
                <button
                  className="md:hidden"
                  onClick={() => setLeftDrawerOpen(false)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #1a3a5c",
                    background: "transparent",
                    color: "#5a8ab0",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#5a8ab0", fontSize: 11 }}>Budget</span>
                <span
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 16,
                    color: "#D4AF37",
                  }}
                >
                  {formatCr(me?.budget ?? 100)}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    background: "linear-gradient(90deg, #00c896, #D4AF37)",
                    width: `${((me?.budget ?? 100) / 100) * 100}%`,
                    transition: "width 0.5s",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 8,
                  textAlign: "center",
                  background:
                    (me?.squadSize ?? 0) >= 20
                      ? "rgba(0,200,150,0.1)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    (me?.squadSize ?? 0) >= 20
                      ? "rgba(0,200,150,0.3)"
                      : "#1a3a5c"
                  }`,
                }}
              >
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 22,
                    color:
                      (me?.squadSize ?? 0) >= 20 ? "#00c896" : "#ddeeff",
                    lineHeight: 1,
                  }}
                >
                  {me?.squadSize ?? 0}/20
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 10,
                    letterSpacing: 1,
                  }}
                >
                  SLOTS
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 8,
                  textAlign: "center",
                  background:
                    (me?.overseas ?? 0) >= 8
                      ? "rgba(255,64,96,0.1)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    (me?.overseas ?? 0) >= 8
                      ? "rgba(255,64,96,0.3)"
                      : "#1a3a5c"
                  }`,
                }}
              >
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 22,
                    color:
                      (me?.overseas ?? 0) >= 8 ? "#ff4060" : "#ddeeff",
                    lineHeight: 1,
                  }}
                >
                  {me?.overseas ?? 0}/8
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 10,
                    letterSpacing: 1,
                  }}
                >
                  OVERSEAS
                </div>
              </div>
            </div>
            {budgetGuard?.status === "blocked" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,64,96,0.1)",
                  border: "1px solid rgba(255,64,96,0.3)",
                  fontSize: 11,
                  color: "#ff4060",
                  lineHeight: 1.4,
                }}
              >
                🚫 {budgetGuard.message}
              </div>
            )}
            {budgetGuard?.status === "warning" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,140,0,0.1)",
                  border: "1px solid rgba(255,140,0,0.3)",
                  fontSize: 11,
                  color: "#ff8c00",
                  lineHeight: 1.4,
                }}
              >
                ⚠️ {budgetGuard.message}
              </div>
            )}
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
            }}
          >
            {myTeam.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  color: "#5a8ab0",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏏</div>
                <div style={{ fontSize: 13 }}>No players yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  Start bidding!
                </div>
              </div>
            ) : (
              myTeam.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    marginBottom: 6,
                    background: "rgba(13,34,64,0.6)",
                    border: "1px solid #1a3a5c",
                  }}
                >
                  <PlayerImage
                    player={{ name: p.name, espnId: getEspnId(p.id) }}
                    size={28}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 600,
                        fontSize: 13,
                        color: "#ddeeff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        alignItems: "center",
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 10,
                          background:
                            p.role === "Batsman"
                              ? "rgba(0,200,150,0.15)"
                              : p.role === "Bowler"
                                ? "rgba(255,64,96,0.12)"
                                : p.role === "All-Rounder"
                                  ? "rgba(155,89,182,0.15)"
                                  : "rgba(255,140,0,0.12)",
                          color:
                            p.role === "Batsman"
                              ? "#00c896"
                              : p.role === "Bowler"
                                ? "#ff4060"
                                : p.role === "All-Rounder"
                                  ? "#b57bee"
                                  : "#ff8c00",
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        }}
                      >
                        {p.role === "WK-Batsman"
                          ? "WK"
                          : p.role === "All-Rounder"
                            ? "AR"
                            : p.role === "Batsman"
                              ? "BAT"
                              : "BOWL"}
                      </span>
                      {p.nationality === "Overseas" && (
                        <span style={{ fontSize: 10 }}>🌏</span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: 14,
                      color: "#D4AF37",
                      flexShrink: 0,
                    }}
                  >
                    {formatCr(p.soldFor)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── CENTER — MAIN AUCTION AREA ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#030c18",
          }}
        >
          {/* Player Spotlight */}
          <div
            style={{
              padding: "24px 28px",
              background:
                "linear-gradient(180deg, rgba(13,34,64,0.8) 0%, transparent 100%)",
              borderBottom: "1px solid #1a3a5c",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 16px",
                  borderRadius: 20,
                  background:
                    currentPlayer.role === "Batsman"
                      ? "rgba(0,200,150,0.12)"
                      : currentPlayer.role === "Bowler"
                        ? "rgba(255,64,96,0.12)"
                        : currentPlayer.role === "All-Rounder"
                          ? "rgba(155,89,182,0.15)"
                          : "rgba(255,140,0,0.12)",
                  border: `1px solid ${
                    currentPlayer.role === "Batsman"
                      ? "rgba(0,200,150,0.35)"
                      : currentPlayer.role === "Bowler"
                        ? "rgba(255,64,96,0.3)"
                        : currentPlayer.role === "All-Rounder"
                          ? "rgba(155,89,182,0.3)"
                          : "rgba(255,140,0,0.3)"
                  }`,
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {currentPlayer.role === "Batsman"
                    ? "🏏"
                    : currentPlayer.role === "Bowler"
                      ? "🎯"
                      : currentPlayer.role === "All-Rounder"
                        ? "⚡"
                        : "🧤"}
                </span>
                <span
                  style={{
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color:
                      currentPlayer.role === "Batsman"
                        ? "#00c896"
                        : currentPlayer.role === "Bowler"
                          ? "#ff4060"
                          : currentPlayer.role === "All-Rounder"
                            ? "#b57bee"
                            : "#ff8c00",
                  }}
                >
                  {currentPlayer.role}
                </span>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background:
                    currentPlayer.nationality === "Indian"
                      ? "rgba(0,136,51,0.12)"
                      : "rgba(0,123,255,0.12)",
                  border: `1px solid ${
                    currentPlayer.nationality === "Indian"
                      ? "rgba(0,136,51,0.3)"
                      : "rgba(0,123,255,0.3)"
                  }`,
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {currentPlayer.nationality === "Indian" ? "🇮🇳" : "🌏"}
                </span>
                <span
                  style={{
                    color:
                      currentPlayer.nationality === "Indian"
                        ? "#00c864"
                        : "#4da6ff",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 1,
                  }}
                >
                  {currentPlayer.nationality === "Indian"
                    ? "INDIA"
                    : (currentPlayer.country || "OVERSEAS").toUpperCase()}
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
              }}
            >
              <div style={{ flexShrink: 0, position: "relative" }}>
                <div
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: "50%",
                    background: "rgba(212,175,55,0.1)",
                    border: "3px solid #D4AF37",
                    overflow: "hidden",
                    boxShadow:
                      "0 0 30px rgba(212,175,55,0.35), 0 0 0 6px rgba(212,175,55,0.08)",
                    animation: "goldPulse 2s ease-in-out infinite",
                  }}
                >
                  <PlayerImage
                    player={{
                      name: currentPlayer.name,
                      espnId: getEspnId(currentPlayer.id),
                    }}
                    size={110}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <h2
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: isMobile ? 32 : 56,
                    fontWeight: 700,
                    color: "#ffffff",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {currentPlayer.name}
                </h2>
                <p
                  style={{
                    color: "#5a8ab0",
                    fontSize: 13,
                    marginBottom: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {currentPlayer.stats}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      padding: "4px 14px",
                      borderRadius: 8,
                      background: "rgba(212,175,55,0.1)",
                      border: "1px solid rgba(212,175,55,0.3)",
                    }}
                  >
                    <span
                      style={{
                        color: "#5a8ab0",
                        fontSize: 10,
                        letterSpacing: 2,
                      }}
                    >
                      BASE PRICE{" "}
                    </span>
                    <span
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 20,
                        color: "#D4AF37",
                      }}
                    >
                      {formatCr(currentPlayer.basePrice)}
                    </span>
                  </div>
                  {currentPlayer.ipl2025Team && (
                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid #1a3a5c",
                        color: "#5a8ab0",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      2025: {currentPlayer.ipl2025Team}
                    </div>
                  )}
                  <div
                    style={{
                      marginLeft: "auto",
                      textAlign: "right",
                    }}
                  >
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: 10,
                        letterSpacing: 1,
                      }}
                    >
                      PROGRESS
                    </div>
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 16,
                        color: "#ddeeff",
                      }}
                    >
                      {currentIndex + 1} / {pool.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                height: 3,
                borderRadius: 2,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 2,
                  background:
                    "linear-gradient(90deg, #D4AF37, #f5d76e)",
                  width: `${((currentIndex + 1) / Math.max(pool.length, 1)) * 100}%`,
                  transition: "width 0.6s",
                }}
              />
            </div>
          </div>

          {/* Bid Section */}
          <div
            style={{
              padding: "20px 28px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderRadius: 16,
                background: "rgba(13,34,64,0.8)",
                border: "1px solid rgba(212,175,55,0.2)",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 11,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Current Bid
                </div>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: isMobile ? 48 : 72,
                    fontWeight: 700,
                    lineHeight: 1,
                    background: "linear-gradient(135deg, #D4AF37 0%, #f5d76e 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 0 20px rgba(212,175,55,0.35))",
                  }}
                >
                  {formatCr(currentBid)}
                </div>
                {leaderId ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>🏆</span>
                    <img
                      src={participants[leaderId]?.photoURL || ""}
                      alt=""
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        color: "#00c896",
                        fontSize: 15,
                      }}
                    >
                      {leaderName || participants[leaderId]?.name || "Leader"}
                    </span>
                    {leaderId === user?.uid && (
                      <span
                        style={{
                          background: "rgba(0,200,150,0.15)",
                          color: "#00c896",
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        YOU&apos;RE LEADING!
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      color: "#5a8ab0",
                      fontSize: 13,
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    No bids yet — be the first!
                  </div>
                )}
              </div>
              <CircularTimer seconds={seconds} total={15} />
            </div>

            {/* CASE 1: No bids yet */}
            {!leaderId && phase === "bidding" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={handlePlaceBid}
                  disabled={!canBid}
                  style={{
                    width: "100%",
                    padding: isMobile ? '20px' : '18px',
                    borderRadius: 14,
                    border: "none",
                    background: canBid
                      ? "linear-gradient(135deg, #D4AF37, #f5d76e)"
                      : "#1a3a5c",
                    color: canBid ? "#0a0e00" : "#5a8ab0",
                    fontFamily: "Teko, sans-serif",
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 700,
                    letterSpacing: 3,
                    cursor: canBid ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                    boxShadow: canBid
                      ? "0 4px 28px rgba(212,175,55,0.45)"
                      : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) =>
                    canBid && (e.currentTarget.style.transform = "scale(1.02)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "none")
                  }
                >
                  {canBid
                    ? `🔨 PLACE BID — ${formatCr(nextBidAmount)}`
                    : getBidBlockReason(
                        me ?? undefined,
                        currentPlayer,
                        nextBidAmount,
                        budgetGuard
                      )}
                </button>
                <button
                  onClick={handleSkipOrPass}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #1a3a5c",
                    background: "transparent",
                    color: "#5a8ab0",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                    letterSpacing: 1,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#ff4060";
                    e.currentTarget.style.color = "#ff4060";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1a3a5c";
                    e.currentTarget.style.color = "#5a8ab0";
                  }}
                >
                  ⏭ Skip / Pass on This Player
                </button>
              </div>
            )}

            {/* CASE 2: Someone has bid — raise options */}
            {leaderId && phase === "bidding" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {canBid && leaderId !== user?.uid && (
                  <>
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: 11,
                        letterSpacing: 3,
                        textTransform: "uppercase",
                        textAlign: "center",
                      }}
                    >
                      — Raise Your Bid —
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 10,
                      }}
                    >
                      {quickBidOptions.map((option, i) => (
                        <button
                          key={i}
                          onClick={() => handleBidAmount(option.amount)}
                          style={{
                            padding: "14px 8px",
                            borderRadius: 12,
                            border: `1px solid ${
                              i === 0
                                ? "rgba(212,175,55,0.5)"
                                : "rgba(212,175,55,0.25)"
                            }`,
                            background:
                              i === 0
                                ? "rgba(212,175,55,0.15)"
                                : "rgba(212,175,55,0.06)",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            textAlign: "center",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(212,175,55,0.2)";
                            e.currentTarget.style.transform =
                              "translateY(-2px)";
                            e.currentTarget.style.boxShadow =
                              "0 4px 16px rgba(212,175,55,0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              i === 0
                                ? "rgba(212,175,55,0.15)"
                                : "rgba(212,175,55,0.06)";
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          <div
                            style={{
                              color: "#5a8ab0",
                              fontSize: 10,
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            {option.label}
                          </div>
                          <div
                            style={{
                              fontFamily: "Teko, sans-serif",
                              fontSize: 22,
                              color: i === 0 ? "#D4AF37" : "#ddeeff",
                              lineHeight: 1,
                            }}
                          >
                            {formatCr(option.amount)}
                          </div>
                          <div
                            style={{
                              color: "#00c896",
                              fontSize: 10,
                              marginTop: 3,
                            }}
                          >
                            +{formatCr(option.amount - currentBid)}
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleWithdraw}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid rgba(255,64,96,0.25)",
                        background: "rgba(255,64,96,0.06)",
                        color: "#ff4060",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                        letterSpacing: 1,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,64,96,0.12)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,64,96,0.06)")
                      }
                    >
                      ✕ Withdraw / Let Them Have It
                    </button>
                  </>
                )}
                {leaderId === user?.uid && (
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 14,
                      background: "rgba(0,200,150,0.08)",
                      border: "2px solid rgba(0,200,150,0.35)",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 28,
                        color: "#00c896",
                        lineHeight: 1,
                      }}
                    >
                      YOU&apos;RE WINNING!
                    </div>
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: 13,
                        marginTop: 6,
                      }}
                    >
                      Hold on — don&apos;t let anyone outbid you!
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        fontFamily: "Teko, sans-serif",
                        fontSize: 20,
                        color: "#D4AF37",
                      }}
                    >
                      Current: {formatCr(currentBid)}
                    </div>
                  </div>
                )}
                {!canBid && leaderId !== user?.uid && (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: "rgba(255,64,96,0.06)",
                      border: "1px solid rgba(255,64,96,0.2)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        color: "#ff4060",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {getBidBlockReason(
                        me ?? undefined,
                        currentPlayer,
                        nextBidAmount,
                        budgetGuard
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAUSED */}
            {phase === "paused" && (
              <div
                style={{
                  padding: 24,
                  borderRadius: 14,
                  background: "rgba(255,140,0,0.08)",
                  border: "1px solid rgba(255,140,0,0.3)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>⏸️</div>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 28,
                    color: "#ff8c00",
                  }}
                >
                  AUCTION PAUSED
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  Waiting for host to resume...
                </div>
              </div>
            )}

            {/* Host Controls */}
            {isHost && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(212,175,55,0.04)",
                  border: "1px solid rgba(212,175,55,0.15)",
                }}
              >
                <div
                  style={{
                    color: "#D4AF37",
                    fontSize: 10,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    marginBottom: 10,
                    textAlign: "center",
                  }}
                >
                  Host Controls
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {phase === "bidding" && (
                    <button
                      onClick={pauseAuction}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #1a3a5c",
                        background: "rgba(255,140,0,0.08)",
                        color: "#ff8c00",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                        letterSpacing: 1,
                      }}
                    >
                      ⏸ Pause
                    </button>
                  )}
                  {phase === "paused" && (
                    <button
                      onClick={resumeAuction}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(0,200,150,0.3)",
                        background: "rgba(0,200,150,0.08)",
                        color: "#00c896",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                        letterSpacing: 1,
                      }}
                    >
                      ▶ Resume
                    </button>
                  )}
                  <button
                    onClick={finalizeUnsold}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #1a3a5c",
                      background: "transparent",
                      color: "#5a8ab0",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}
                  >
                    ⏭ Skip
                  </button>
                  <button
                    onClick={finalizeUnsold}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(255,64,96,0.25)",
                      background: "rgba(255,64,96,0.06)",
                      color: "#ff4060",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}
                  >
                    🚫 Unsold
                  </button>
                  {leaderId && (
                    <button
                      onClick={finalizeSold}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid rgba(0,200,150,0.3)",
                        background: "rgba(0,200,150,0.1)",
                        color: "#00c896",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        letterSpacing: 1,
                        gridColumn: phase === "paused" ? "span 1" : "span 2",
                      }}
                    >
                      ✅ Sell Now to {leaderName || "Winner"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bid History */}
            <div
              style={{
                borderRadius: 12,
                background: "rgba(7,24,44,0.6)",
                border: "1px solid #1a3a5c",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid #1a3a5c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#D4AF37",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  Bid History
                </span>
                <span
                  style={{
                    background: "rgba(212,175,55,0.15)",
                    color: "#D4AF37",
                    padding: "1px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                  }}
                >
                  {bidHistory.length}
                </span>
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {bidHistory.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "#5a8ab0",
                      fontSize: 13,
                      fontStyle: "italic",
                    }}
                  >
                    Be the first to bid!
                  </div>
                ) : (
                  bidHistory.map((bid, i) => (
                    <div
                      key={`${bid.userId}-${bid.time}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 16px",
                        borderBottom:
                          i < bidHistory.length - 1
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "none",
                        background:
                          i === 0 ? "rgba(212,175,55,0.06)" : "transparent",
                        borderLeft:
                          i === 0
                            ? "3px solid #D4AF37"
                            : "3px solid transparent",
                      }}
                    >
                      <img
                        src={bid.photoURL || ""}
                        alt=""
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 600,
                          fontSize: 13,
                          color: i === 0 ? "#ddeeff" : "#5a8ab0",
                        }}
                      >
                        {bid.name}
                      </span>
                      {i === 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            background: "rgba(212,175,55,0.2)",
                            color: "#D4AF37",
                            padding: "1px 6px",
                            borderRadius: 20,
                            fontWeight: 700,
                            letterSpacing: 1,
                          }}
                        >
                          HIGHEST
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: "Teko, sans-serif",
                          fontSize: 16,
                          color: i === 0 ? "#D4AF37" : "#5a8ab0",
                          flexShrink: 0,
                        }}
                      >
                        {formatCr(bid.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT SIDEBAR — ALL FRANCHISES ─── */}
        <div
          style={{
            display: isMobile ? 'none' : 'flex',
            background: "rgba(7,24,44,0.9)",
            borderLeft: "1px solid #1a3a5c",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #1a3a5c",
              flexShrink: 0,
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: "#D4AF37",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            <div className="flex items-center justify-between">
              <span>All Franchises ({Object.keys(participants).length})</span>
              <span />
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 10,
            }}
          >
            {Object.entries(participants).map(
              ([uid, p]: [string, ParticipantState]) => (
                <div
                  key={uid}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 8,
                    background:
                      uid === user?.uid
                        ? "rgba(212,175,55,0.06)"
                        : "rgba(13,34,64,0.5)",
                    border: `1px solid ${
                      uid === user?.uid ? "rgba(212,175,55,0.25)" : "#1a3a5c"
                    }`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor =
                      "rgba(212,175,55,0.3)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor =
                      uid === user?.uid ? "rgba(212,175,55,0.25)" : "#1a3a5c")
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <img
                      src={p.photoURL || ""}
                      alt=""
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                        border: `1px solid ${
                          uid === currentRoom?.meta?.hostId
                            ? "#D4AF37"
                            : "#1a3a5c"
                        }`,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true`;
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#ddeeff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.name}
                        {uid === user?.uid && (
                          <span
                            style={{
                              color: "#00c896",
                              fontSize: 10,
                              marginLeft: 4,
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontFamily: "Teko, sans-serif",
                          fontSize: 16,
                          color: "#D4AF37",
                          lineHeight: 1,
                        }}
                      >
                        {formatCr(p.budget)}
                      </div>
                    </div>
                    {uid === currentRoom?.meta?.hostId && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 20,
                          background: "rgba(212,175,55,0.15)",
                          color: "#D4AF37",
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        HOST
                      </span>
                    )}
                    {uid === leaderId && (
                      <span style={{ fontSize: 14 }}>🏆</span>
                    )}
                  </div>
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 2,
                        background:
                          "linear-gradient(90deg, #00c896, #D4AF37)",
                        width: `${(p.budget / 100) * 100}%`,
                        transition: "width 0.5s",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 11,
                      color: "#5a8ab0",
                    }}
                  >
                    <span>{(p.squadSize ?? 0)}/20 players</span>
                    <span>·</span>
                    <span>{(p.overseas ?? 0)}/8 OS</span>
                  </div>
                </div>
              )
            )}
          </div>
          <div
            style={{
              borderTop: "1px solid #1a3a5c",
              padding: "12px 14px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 700,
                fontSize: 11,
                color: "#5a8ab0",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Next Up
            </div>
            {pool
              .slice(currentIndex + 1, currentIndex + 4)
              .map((pid: string, i: number) => {
                const np = ALL_PLAYERS.find((p) => p.id === pid);
                if (!np) return null;
                return (
                  <div
                    key={pid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      marginBottom: 4,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#1a3a5c",
                        color: "#5a8ab0",
                        fontSize: 9,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {i + 2}
                    </span>
                    <PlayerImage
                      player={{ name: np.name, espnId: getEspnId(np.id) }}
                      size={20}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: "#5a8ab0",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {np.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 13,
                        color: "#D4AF37",
                        flexShrink: 0,
                      }}
                    >
                      {formatCr(np.basePrice)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Mobile All Franchises modal */}
        {showFranchises && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onClick={() => setShowFranchises(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#07182c",
                border: "1px solid #1a3a5c",
                borderRadius: 20,
                padding: 24,
                maxWidth: 600,
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                position: "relative",
              }}
            >
              <button
                onClick={() => setShowFranchises(false)}
                style={{
                  zIndex: 200,
                  pointerEvents: "all",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,64,96,0.3)",
                  background: "rgba(255,64,96,0.08)",
                  color: "#ff4060",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 1,
                  position: "absolute",
                  top: 16,
                  right: 16,
                }}
              >
                ✕ Close
              </button>

              <div
                style={{
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "#D4AF37",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 16,
                }}
              >
                All Franchises ({Object.keys(participants || {}).length})
              </div>

              {Object.entries(participants || {}).map(
                ([uid, p]: [string, ParticipantState]) => (
                  <div
                    key={uid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: 12,
                      marginBottom: 8,
                      background:
                        uid === user?.uid
                          ? "rgba(212,175,55,0.08)"
                          : "rgba(13,34,64,0.6)",
                      border: `1px solid ${
                        uid === user?.uid
                          ? "rgba(212,175,55,0.25)"
                          : "#1a3a5c"
                      }`,
                    }}
                  >
                    <img
                      src={p.photoURL || ""}
                      alt=""
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true`;
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 700,
                          fontSize: 15,
                          color: "#ddeeff",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {p.name}
                        {uid === user?.uid && (
                          <span
                            style={{
                              fontSize: 10,
                              background: "rgba(0,200,150,0.15)",
                              color: "#00c896",
                              padding: "1px 8px",
                              borderRadius: 20,
                              fontWeight: 700,
                            }}
                          >
                            YOU
                          </span>
                        )}
                        {uid === leaderId && <span style={{ fontSize: 14 }}>🏆</span>}
                      </div>
                      <div style={{ color: "#5a8ab0", fontSize: 12, marginTop: 2 }}>
                        {p.squadSize ?? 0}/20 players · {p.overseas ?? 0}/8 OS
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 20,
                        color: "#D4AF37",
                        flexShrink: 0,
                      }}
                    >
                      {formatCr(p.budget ?? 100)}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>
      {isMobile && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          background: 'rgba(3,12,24,0.98)',
          borderTop: '1px solid #1a3a5c',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 50,
        }}>
          <div>
            <div style={{ color:'#5a8ab0', fontSize:10 }}>My Budget</div>
            <div style={{ fontFamily:'Teko', fontSize:18, color:'#D4AF37' }}>
              {formatCr(me?.budget ?? 100)}
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ color:'#5a8ab0', fontSize:10 }}>Slots</div>
            <div style={{ fontFamily:'Teko', fontSize:18, color:'#ddeeff' }}>
              {me?.squadSize ?? 0}/20
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ color:'#5a8ab0', fontSize:10 }}>OS</div>
            <div style={{ fontFamily:'Teko', fontSize:18, color:'#ddeeff' }}>
              {me?.overseas ?? 0}/8
            </div>
          </div>
        </div>
      )}
      {rtmWindow?.active && phase === 'sold' && !myRtmUsed && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120,
          background: 'rgba(3,12,24,0.98)', border: '2px solid rgba(255,140,0,0.6)', borderRadius: 20, padding: '24px 32px', textAlign: 'center', minWidth: 300, boxShadow: '0 0 60px rgba(255,140,0,0.3)', animation: 'fadeInUp 0.2s ease-out',
        }}>
          <div style={{ marginBottom: 8, position: 'relative', height: 60 }}>
            <svg width={60} height={60} style={{ transform:'rotate(-90deg)', margin: '0 auto', display: 'block' }}>
              <circle cx={30} cy={30} r={24} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4}/>
              <circle cx={30} cy={30} r={24} fill="none" stroke="#ff8c00" strokeWidth={4} strokeDasharray={150.8} strokeDashoffset={150.8 * (1 - rtmCountdown/5)} strokeLinecap="round" style={{ transition:'stroke-dashoffset 0.1s linear' }}/>
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontFamily: 'Teko', fontSize: 22, color: '#ff8c00', fontWeight: 700 }}>
              {rtmCountdown}
            </div>
          </div>
          <div style={{ fontFamily: 'Teko', fontSize: 14, color: '#ff8c00', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            RTM WINDOW OPEN
          </div>
          <div style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 16, color: '#ddeeff', marginBottom: 4 }}>
            {rtmWindow.originalWinnerName} won {rtmWindow.playerName}
          </div>
          <div style={{ fontFamily: 'Teko', fontSize: 28, color: '#D4AF37', marginBottom: 16 }}>
            {formatCr(rtmWindow.amount)}
          </div>
          <div style={{ fontSize: 12, color: '#5a8ab0', marginBottom: 16 }}>
            Use your RTM card to match this bid and take the player!
          </div>
          {canUseRtm ? (
            <button onClick={handleUseRtm} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ff8c00, #ffb347)', color: '#111', fontFamily: 'Teko', fontWeight: 700, fontSize: 22, letterSpacing: 2, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,140,0,0.5)', animation: 'goldPulse 1s ease-in-out infinite' }}>
              🃏 USE RTM CARD — {formatCr(rtmWindow.amount)}
            </button>
          ) : (
            <div style={{ padding: '10px', borderRadius: 10, background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)', color: '#ff4060', fontSize: 13 }}>
              {(me?.budget ?? 0) < (rtmWindow?.amount ?? 0) ? '💰 Insufficient budget for RTM' : (me?.overseas ?? 0) >= 8 && currentPlayerIsOverseas ? '🌏 Overseas limit reached' : 'Cannot use RTM right now'}
            </div>
          )}
        </div>
      )}

      <AudioControls />
      <LiveChat code={code} user={user} roomState={currentRoom as any} isOpen={chatOpen} onToggle={() => setChatOpen(o => !o)} />
      <TradeDrawer roomState={currentRoom as any} user={user} code={code} />
    </AuthGuard>
  );
}
