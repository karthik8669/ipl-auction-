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

// --- Player Avatar with Emoji Fallback ---
function PlayerAvatar({ player, size = 100 }: any) {
  const [imgError, setImgError] = useState(false);

  const roleConfig: any = {
    Batsman: { emoji: "🏏", bg: "linear-gradient(135deg, #004d2e, #00c896)", color: "#00c896" },
    Bowler: { emoji: "🎯", bg: "linear-gradient(135deg, #4d0012, #ff4060)", color: "#ff4060" },
    "All-Rounder": { emoji: "⚡", bg: "linear-gradient(135deg, #2d0047, #b57bee)", color: "#b57bee" },
    "WK-Batsman": { emoji: "🧤", bg: "linear-gradient(135deg, #4d2a00, #ff8c00)", color: "#ff8c00" },
  };

  const rc = roleConfig[player?.role] || roleConfig["Batsman"];

  if (!player?.id || imgError) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: rc.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.45,
          flexShrink: 0,
          border: `3px solid ${rc.color}`,
          boxShadow: `0 0 20px ${rc.color}40`,
        }}
      >
        {rc.emoji}
      </div>
    );
  }

  return (
    <img
      src={`https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(player.id)}.png`}
      alt={player.name}
      width={size}
      height={size}
      style={{
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        border: `3px solid ${rc.color}`,
        boxShadow: `0 0 20px ${rc.color}40`,
        background: "rgba(212,175,55,0.1)",
      }}
      onError={() => setImgError(true)}
    />
  );
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

  // --- Skipping Logic ---
  const skipVotes = (currentRoom?.auction as any)?.skipVotes || {};
  const skipVoteCount = Object.keys(skipVotes).length;
  const totalPlayers = Object.keys(participants || {}).length;
  const iHaveVoted = !!skipVotes[user?.uid || ""];
  const skipApproved = skipVoteCount >= totalPlayers && totalPlayers > 0;

  useEffect(() => {
    if (!isHost || !skipApproved || phase !== "bidding") return;
    const doSkip = async () => {
      await update(ref(db), { [`rooms/${code}/auction/skipVotes`]: null });
      finalizeUnsold();
    };
    doSkip();
  }, [skipApproved, isHost, phase, code, finalizeUnsold]);

  async function voteToSkip() {
    if (!user || iHaveVoted) return;
    await update(ref(db), { [`rooms/${code}/auction/skipVotes/${user.uid}`]: true });
  }

  async function forceSkip() {
    if (!isHost) return;
    await update(ref(db), { [`rooms/${code}/auction/skipVotes`]: null });
    finalizeUnsold();
  }

  // --- Auto-end & Manual End Logic ---
  const handleAutoEnd = useCallback(async () => {
    if (!isHost) return;
    try {
      await update(ref(db), {
        [`rooms/${code}/meta/status`]: "finished",
        [`rooms/${code}/auction/phase`]: "finished",
      });
      window.location.href = `/room/${code}/playing11`;
    } catch (e: any) {
      console.error("Auto end failed:", e);
    }
  }, [code, isHost]);

  useEffect(() => {
    if (!isHost || currentRoom?.meta?.status !== "auction") return;
    const ps = currentRoom?.participants || {};
    const allFull = Object.values(ps).every((p: any) => (p.squadSize ?? 0) >= 20);
    if (allFull && Object.keys(ps).length > 0) {
      console.log("All squads full — ending auction automatically");
      handleAutoEnd();
    }
  }, [currentRoom?.participants, currentRoom?.meta?.status, isHost, handleAutoEnd]);

  async function handleEndAuction() {
    if (!isHost) return;
    const confirmed = window.confirm(
      "End the auction now? Remaining players will be auto-assigned at base price."
    );
    if (!confirmed) return;

    const updates: Record<string, any> = {};
    const ps = currentRoom?.participants || {};
    const soldIds = new Set<string>();

    Object.values(currentRoom?.teams || {}).forEach((team: any) => {
      Object.keys(team || {}).forEach(id => soldIds.add(id));
    });

    const unsold = pool
      .filter((id) => !soldIds.has(id))
      .map((id) => ALL_PLAYERS.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => a.basePrice - b.basePrice);

    Object.entries(ps).forEach(([uid, p]: any) => {
      const slotsNeeded = 20 - (p.squadSize || 0);
      if (slotsNeeded <= 0) return;

      let budget = p.budget || 0;
      let filled = 0;
      let overseas = p.overseas || 0;

      for (const player of unsold) {
        if (filled >= slotsNeeded) break;
        if (!player) continue;
        if (player.basePrice > budget) continue;
        if (player.nationality === "Overseas" && overseas >= 8) continue;

        updates[`rooms/${code}/teams/${uid}/${player.id}`] = {
          soldFor: player.basePrice,
          addedAt: Date.now(),
          isAutoFilled: true,
        };
        budget -= player.basePrice;
        overseas += player.nationality === "Overseas" ? 1 : 0;
        filled++;
      }

      updates[`rooms/${code}/participants/${uid}/budget`] =
        Math.round(budget * 100) / 100;
      updates[`rooms/${code}/participants/${uid}/squadSize`] =
        (p.squadSize || 0) + filled;
    });

    updates[`rooms/${code}/meta/status`] = "finished";
    updates[`rooms/${code}/auction/phase`] = "finished";

    await update(ref(db), updates);
    window.location.href = `/room/${code}/playing11`;
  }

  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [showFranchises, setShowFranchises] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showMyTeam, setShowMyTeam] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false);

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
    // Only redirect FORWARD to playing11 — never back to waiting room
    if (status === 'finished') {
      window.location.replace(`/room/${code}/playing11`)
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

      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes goldPulse { 0%,100%{box-shadow:0 0 20px rgba(212,175,55,.3)} 50%{box-shadow:0 0 40px rgba(212,175,55,.7)} }
        @keyframes fadeInRight { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* ─── WRAPPER ─── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        background: '#030c18',
        backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.25) 0%, transparent 50%),
                          radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.08) 0%, transparent 50%)`,
      }}>

        {/* ─── NAVBAR ─── */}
        <nav style={{
          flexShrink: 0,
          background: 'rgba(3,12,24,0.98)',
          borderBottom: '1px solid #1a3a5c',
          padding: isMobile ? '8px 12px' : '10px 20px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
          zIndex: 50,
        }}>
          {/* Left — Logo + LIVE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: 'Teko, sans-serif', fontSize: isMobile ? 22 : 30, color: '#D4AF37', letterSpacing: 3 }}>IPL</span>
            {!isMobile && <span style={{ fontFamily: 'Teko, sans-serif', fontSize: 13, color: '#5a8ab0', letterSpacing: 2 }}>AUCTION 2026</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,64,96,0.12)', border: '1px solid rgba(255,64,96,0.3)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff4060', animation: 'pulse 1s ease-in-out infinite' }} />
              <span style={{ color: '#ff4060', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>LIVE</span>
            </div>
          </div>

          {/* Center — Progress */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ color: '#5a8ab0', fontSize: 9, letterSpacing: 1 }}>PLAYER</div>
            <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 18, color: '#ddeeff', lineHeight: 1 }}>
              {currentIndex + 1} / {pool.length}
            </div>
          </div>

          {/* Right — Budget + Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 10, flexShrink: 0 }}>
            {/* Budget pill */}
            <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', textAlign: 'center' }}>
              <div style={{ color: '#5a8ab0', fontSize: 8, letterSpacing: 1 }}>BUDGET</div>
              <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 16, color: '#D4AF37', lineHeight: 1 }}>{formatCr(me?.budget ?? 100)}</div>
            </div>
            {/* My Team */}
            <button
              onClick={() => setShowMyTeam(true)}
              style={{ padding: isMobile ? '6px 9px' : '8px 14px', borderRadius: 8, border: '1px solid rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.08)', color: '#D4AF37', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: isMobile ? 11 : 13, cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap' }}
            >
              👕 My Team
            </button>
            {/* All Teams */}
            <button
              onClick={() => setShowAllTeams(true)}
              style={{ padding: isMobile ? '6px 9px' : '8px 14px', borderRadius: 8, border: '1px solid #1a3a5c', background: 'rgba(255,255,255,0.04)', color: '#5a8ab0', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: isMobile ? 11 : 13, cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap' }}
            >
              👥 All Teams
            </button>
            {/* Leave */}
            <button
              onClick={handleLeave}
              style={{ padding: isMobile ? '6px 9px' : '8px 14px', borderRadius: 8, border: '1px solid rgba(255,64,96,0.2)', background: 'transparent', color: '#ff4060', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: isMobile ? 11 : 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              ← Leave
            </button>
          </div>
        </nav>

        {/* ─── MAIN AUCTION AREA ─── */}
        <div style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxWidth: 760, margin: '0 auto', width: '100%',
          padding: isMobile ? '8px 10px' : '12px 20px',
          gap: 10,
        }}>

          {/* Player Spotlight */}
          <div style={{
            flexShrink: 0,
            padding: isMobile ? '10px 12px' : '14px 20px',
            borderRadius: 14,
            border: '1px solid rgba(212,175,55,0.18)',
            background: 'linear-gradient(180deg, rgba(13,34,64,0.8) 0%, transparent 100%)',
          }}>
            {/* Role + Nationality badges */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 20,
                background: currentPlayer.role === 'Batsman' ? 'rgba(0,200,150,0.12)' : currentPlayer.role === 'Bowler' ? 'rgba(255,64,96,0.12)' : currentPlayer.role === 'All-Rounder' ? 'rgba(155,89,182,0.15)' : 'rgba(255,140,0,0.12)',
                border: `1px solid ${currentPlayer.role === 'Batsman' ? 'rgba(0,200,150,0.35)' : currentPlayer.role === 'Bowler' ? 'rgba(255,64,96,0.3)' : currentPlayer.role === 'All-Rounder' ? 'rgba(155,89,182,0.3)' : 'rgba(255,140,0,0.3)'}`,
              }}>
                <span style={{ fontSize: 14 }}>{currentPlayer.role === 'Batsman' ? '🏏' : currentPlayer.role === 'Bowler' ? '🎯' : currentPlayer.role === 'All-Rounder' ? '⚡' : '🧤'}</span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: currentPlayer.role === 'Batsman' ? '#00c896' : currentPlayer.role === 'Bowler' ? '#ff4060' : currentPlayer.role === 'All-Rounder' ? '#b57bee' : '#ff8c00' }}>{currentPlayer.role}</span>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 20,
                background: currentPlayer.nationality === 'Indian' ? 'rgba(0,136,51,0.12)' : 'rgba(0,123,255,0.12)',
                border: `1px solid ${currentPlayer.nationality === 'Indian' ? 'rgba(0,136,51,0.3)' : 'rgba(0,123,255,0.3)'}`,
              }}>
                <span style={{ fontSize: 14 }}>{currentPlayer.nationality === 'Indian' ? '🇮🇳' : '🌏'}</span>
                <span style={{ color: currentPlayer.nationality === 'Indian' ? '#00c864' : '#4da6ff', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
                  {currentPlayer.nationality === 'Indian' ? 'INDIA' : (currentPlayer.country || 'OVERSEAS').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Player row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: isMobile ? 72 : 90, height: isMobile ? 72 : 90, borderRadius: '50%', background: 'rgba(212,175,55,0.1)', border: '3px solid #D4AF37', overflow: 'hidden', boxShadow: '0 0 24px rgba(212,175,55,0.35)', animation: 'goldPulse 2s ease-in-out infinite' }}>
                  <PlayerAvatar player={currentPlayer} size={isMobile ? 72 : 90} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontFamily: 'Teko, sans-serif', fontSize: isMobile ? 28 : 42, fontWeight: 700, color: '#ffffff', lineHeight: 1, marginBottom: 4 }}>
                  {currentPlayer.name}
                </h2>
                <p style={{ color: '#5a8ab0', fontSize: 12, marginBottom: 8, lineHeight: 1.4 }}>{currentPlayer.stats}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ padding: '3px 12px', borderRadius: 8, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)' }}>
                    <span style={{ color: '#5a8ab0', fontSize: 9, letterSpacing: 2 }}>BASE </span>
                    <span style={{ fontFamily: 'Teko, sans-serif', fontSize: 18, color: '#D4AF37' }}>{formatCr(currentPlayer.basePrice)}</span>
                  </div>
                  {currentPlayer.ipl2025Team && (
                    <div style={{ padding: '3px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid #1a3a5c', color: '#5a8ab0', fontSize: 11, fontWeight: 600 }}>
                      2025: {currentPlayer.ipl2025Team}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #D4AF37, #f5d76e)', width: `${((currentIndex + 1) / Math.max(pool.length, 1)) * 100}%`, transition: 'width 0.6s' }} />
            </div>
          </div>

          {/* Bid Area (scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Current Bid + Timer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isMobile ? '12px 14px' : '16px 20px',
              borderRadius: 14,
              background: 'rgba(13,34,64,0.8)',
              border: '1px solid rgba(212,175,55,0.2)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ color: '#5a8ab0', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 }}>Current Bid</div>
                <div style={{ fontFamily: 'Teko, sans-serif', fontSize: isMobile ? 44 : 60, fontWeight: 700, lineHeight: 1, background: 'linear-gradient(135deg, #D4AF37 0%, #f5d76e 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 0 20px rgba(212,175,55,0.35))' }}>
                  {formatCr(currentBid)}
                </div>
                {leaderId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 12 }}>🏆</span>
                    <img src={participants[leaderId]?.photoURL || ''} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, color: '#00c896', fontSize: 14 }}>{leaderName || participants[leaderId]?.name || 'Leader'}</span>
                    {leaderId === user?.uid && <span style={{ background: 'rgba(0,200,150,0.15)', color: '#00c896', fontSize: 9, padding: '1px 6px', borderRadius: 20, fontWeight: 700, letterSpacing: 1 }}>YOU&apos;RE LEADING!</span>}
                  </div>
                ) : (
                  <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>No bids yet — be the first!</div>
                )}
              </div>
              <CircularTimer seconds={seconds} total={15} />
            </div>

            {/* CASE 1: No bids — Bid or Skip */}
            {!leaderId && phase === 'bidding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={handlePlaceBid}
                  disabled={!canBid}
                  style={{
                    width: '100%', padding: isMobile ? '16px' : '18px', borderRadius: 12,
                    border: 'none',
                    background: canBid ? 'linear-gradient(135deg, #D4AF37, #f5d76e)' : '#1a3a5c',
                    color: canBid ? '#0a0e00' : '#5a8ab0',
                    fontFamily: 'Teko, sans-serif', fontSize: isMobile ? 20 : 26,
                    fontWeight: 700, letterSpacing: 3,
                    cursor: canBid ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                    boxShadow: canBid ? '0 4px 28px rgba(212,175,55,0.45)' : 'none',
                  }}
                  onMouseEnter={e => canBid && (e.currentTarget.style.transform = 'scale(1.02)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
                >
                  {canBid ? `🔨 PLACE BID — ${formatCr(nextBidAmount)}` : getBidBlockReason(me ?? undefined, currentPlayer, nextBidAmount, budgetGuard)}
                </button>
                <button
                  onClick={isHost ? forceSkip : voteToSkip}
                  disabled={!isHost && iHaveVoted}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10,
                    border: `1px solid ${iHaveVoted ? 'rgba(255,255,255,0.1)' : 'rgba(255,140,0,0.3)'}`,
                    background: iHaveVoted ? 'rgba(255,255,255,0.04)' : 'rgba(255,140,0,0.08)',
                    color: iHaveVoted ? '#5a8ab0' : '#ff8c00',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700, fontSize: 14,
                    cursor: iHaveVoted ? 'not-allowed' : 'pointer',
                    letterSpacing: 1,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  {isHost
                    ? '⏭ Force Skip'
                    : iHaveVoted
                    ? `✓ Voted (${skipVoteCount}/${totalPlayers} — need all)`
                    : `⏭ Vote Skip (${skipVoteCount}/${totalPlayers})`
                  }
                </button>
              </div>
            )}

            {/* CASE 2: Someone has bid — Raise or Withdraw */}
            {leaderId && phase === 'bidding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {canBid && leaderId !== user?.uid && (
                  <>
                    <div style={{ color: '#5a8ab0', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center' }}>— Raise Your Bid —</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {quickBidOptions.map((option: { amount: number; label: string }, i: number) => (
                        <button key={i} onClick={() => handleBidAmount(option.amount)} style={{ padding: '12px 6px', borderRadius: 10, border: `1px solid ${i === 0 ? 'rgba(212,175,55,0.5)' : 'rgba(212,175,55,0.25)'}`, background: i === 0 ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.06)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.2)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = i === 0 ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.06)'; e.currentTarget.style.transform = 'none'; }}
                        >
                          <div style={{ color: '#5a8ab0', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>{option.label}</div>
                          <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 20, color: i === 0 ? '#D4AF37' : '#ddeeff', lineHeight: 1 }}>{formatCr(option.amount)}</div>
                          <div style={{ color: '#00c896', fontSize: 9, marginTop: 2 }}>+{formatCr(option.amount - currentBid)}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={handleWithdraw} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,64,96,0.25)', background: 'rgba(255,64,96,0.06)', color: '#ff4060', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', letterSpacing: 1, transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,64,96,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,64,96,0.06)')}
                    >✕ Withdraw / Let Them Have It</button>
                  </>
                )}
                {leaderId === user?.uid && (
                  <div style={{ padding: 16, borderRadius: 12, background: 'rgba(0,200,150,0.08)', border: '2px solid rgba(0,200,150,0.35)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
                    <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 24, color: '#00c896', lineHeight: 1 }}>YOU&apos;RE WINNING!</div>
                    <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 4 }}>Hold on — don&apos;t let anyone outbid you!</div>
                  </div>
                )}
                {!canBid && leaderId !== user?.uid && (
                  <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,64,96,0.06)', border: '1px solid rgba(255,64,96,0.2)', textAlign: 'center', color: '#ff4060', fontSize: 13, fontWeight: 600 }}>
                    {getBidBlockReason(me ?? undefined, currentPlayer, nextBidAmount, budgetGuard)}
                  </div>
                )}
              </div>
            )}

            {/* PAUSED */}
            {phase === 'paused' && (
              <div style={{ padding: 20, borderRadius: 12, background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>⏸️</div>
                <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 24, color: '#ff8c00' }}>AUCTION PAUSED</div>
                <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 4 }}>Waiting for host to resume...</div>
              </div>
            )}

            {/* Host Controls */}
            {isHost && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)', flexShrink: 0 }}>
                <div style={{ color: '#D4AF37', fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>Host Controls</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {phase === 'bidding' && (
                    <button onClick={pauseAuction} style={{ padding: 9, borderRadius: 7, border: '1px solid #1a3a5c', background: 'rgba(255,140,0,0.08)', color: '#ff8c00', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}>⏸ Pause</button>
                  )}
                  {phase === 'paused' && (
                    <button onClick={resumeAuction} style={{ padding: 9, borderRadius: 7, border: '1px solid rgba(0,200,150,0.3)', background: 'rgba(0,200,150,0.08)', color: '#00c896', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}>▶ Resume</button>
                  )}
                  <button onClick={finalizeUnsold} style={{ padding: 9, borderRadius: 7, border: '1px solid #1a3a5c', background: 'transparent', color: '#5a8ab0', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}>⏭ Skip</button>
                  <button onClick={finalizeUnsold} style={{ padding: 9, borderRadius: 7, border: '1px solid rgba(255,64,96,0.25)', background: 'rgba(255,64,96,0.06)', color: '#ff4060', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: 1 }}>🚫 Unsold</button>
                  {leaderId && (
                    <button onClick={finalizeSold} style={{ padding: 9, borderRadius: 7, border: '1px solid rgba(0,200,150,0.3)', background: 'rgba(0,200,150,0.1)', color: '#00c896', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: 1, gridColumn: phase === 'paused' ? 'span 1' : 'span 2' }}>✅ Sell Now to {leaderName || 'Winner'}</button>
                  )}
                  {isHost && (
                    <button
                      onClick={handleEndAuction}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,64,96,0.3)',
                        background: 'rgba(255,64,96,0.08)',
                        color: '#ff4060',
                        fontFamily: 'Rajdhani, sans-serif',
                        fontWeight: 700, fontSize: 14,
                        cursor: 'pointer', letterSpacing: 1,
                        marginTop: 4,
                        gridColumn: '1 / -1'
                      }}
                    >
                      🏁 End Auction Now
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bid History */}
            <div style={{ borderRadius: 10, background: 'rgba(7,24,44,0.6)', border: '1px solid #1a3a5c', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 11, color: '#D4AF37', letterSpacing: 3, textTransform: 'uppercase' }}>Bid History</span>
                <span style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', padding: '1px 7px', borderRadius: 20, fontSize: 10 }}>{bidHistory.length}</span>
              </div>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                {bidHistory.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#5a8ab0', fontSize: 12, fontStyle: 'italic' }}>Be the first to bid!</div>
                ) : (
                  bidHistory.map((bid: BidEntry, i: number) => (
                    <div key={`${bid.userId}-${bid.time}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: i < bidHistory.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i === 0 ? 'rgba(212,175,55,0.06)' : 'transparent', borderLeft: i === 0 ? '3px solid #D4AF37' : '3px solid transparent' }}>
                      <img src={bid.photoURL || ''} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span style={{ flex: 1, fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 12, color: i === 0 ? '#ddeeff' : '#5a8ab0' }}>{bid.name}</span>
                      {i === 0 && <span style={{ fontSize: 8, background: 'rgba(212,175,55,0.2)', color: '#D4AF37', padding: '1px 5px', borderRadius: 20, fontWeight: 700, letterSpacing: 1 }}>HIGHEST</span>}
                      <span style={{ fontFamily: 'Teko, sans-serif', fontSize: 15, color: i === 0 ? '#D4AF37' : '#5a8ab0', flexShrink: 0 }}>{formatCr(bid.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>{/* end Bid Area */}
        </div>{/* end MAIN AUCTION AREA */}

      </div>{/* end WRAPPER */}

      {/* ─── MY TEAM MODAL (right drawer) ─── */}
      {showMyTeam && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowMyTeam(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: Math.min(360, windowWidth - 20), background: '#07182c', borderLeft: '1px solid #1a3a5c', display: 'flex', flexDirection: 'column', animation: 'fadeInRight 0.2s ease-out' }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 14, color: '#D4AF37', letterSpacing: 3, textTransform: 'uppercase' }}>My Squad</div>
                <div style={{ color: '#5a8ab0', fontSize: 11, marginTop: 2 }}>{me?.squadSize ?? 0}/20 players · {me?.overseas ?? 0}/8 OS · {formatCr(me?.budget ?? 100)} left</div>
              </div>
              <button onClick={() => setShowMyTeam(false)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,64,96,0.3)', background: 'rgba(255,64,96,0.08)', color: '#ff4060', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✕ Close</button>
            </div>
            {/* Team List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {myTeam.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#5a8ab0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🏏</div>
                  <div style={{ fontSize: 13 }}>No players yet</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Start bidding!</div>
                </div>
              ) : (
                myTeam.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: 'rgba(13,34,64,0.6)', border: '1px solid #1a3a5c' }}>
                    <PlayerAvatar player={p} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 13, color: '#ddeeff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: p.role === 'Batsman' ? 'rgba(0,200,150,0.15)' : p.role === 'Bowler' ? 'rgba(255,64,96,0.12)' : p.role === 'All-Rounder' ? 'rgba(155,89,182,0.15)' : 'rgba(255,140,0,0.12)', color: p.role === 'Batsman' ? '#00c896' : p.role === 'Bowler' ? '#ff4060' : p.role === 'All-Rounder' ? '#b57bee' : '#ff8c00', fontWeight: 700, letterSpacing: 0.5 }}>{p.role === 'WK-Batsman' ? 'WK' : p.role === 'All-Rounder' ? 'AR' : p.role === 'Batsman' ? 'BAT' : 'BOWL'}</span>
                        {p.nationality === 'Overseas' && <span style={{ fontSize: 10 }}>🌏</span>}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 15, color: '#D4AF37', flexShrink: 0 }}>{formatCr(p.soldFor)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ALL TEAMS MODAL (right drawer) ─── */}
      {showAllTeams && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAllTeams(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: Math.min(400, windowWidth - 20), background: '#07182c', borderLeft: '1px solid #1a3a5c', display: 'flex', flexDirection: 'column', animation: 'fadeInRight 0.2s ease-out' }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 14, color: '#D4AF37', letterSpacing: 3, textTransform: 'uppercase' }}>
                All Franchises ({Object.keys(participants).length})
              </div>
              <button onClick={() => setShowAllTeams(false)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,64,96,0.3)', background: 'rgba(255,64,96,0.08)', color: '#ff4060', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✕ Close</button>
            </div>
            {/* Franchise List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {Object.entries(participants).map(([uid, p]: [string, ParticipantState]) => (
                <div key={uid} style={{ padding: 12, borderRadius: 10, marginBottom: 8, background: uid === user?.uid ? 'rgba(212,175,55,0.06)' : 'rgba(13,34,64,0.5)', border: `1px solid ${uid === user?.uid ? 'rgba(212,175,55,0.25)' : '#1a3a5c'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <img src={p.photoURL || ''} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${uid === currentRoom?.meta?.hostId ? '#D4AF37' : '#1a3a5c'}` }} onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true`; }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 13, color: '#ddeeff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}{uid === user?.uid && <span style={{ color: '#00c896', fontSize: 10, marginLeft: 4 }}>YOU</span>}
                      </div>
                      <div style={{ fontFamily: 'Teko, sans-serif', fontSize: 16, color: '#D4AF37', lineHeight: 1 }}>{formatCr(p.budget)}</div>
                    </div>
                    {uid === currentRoom?.meta?.hostId && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37', fontWeight: 700, letterSpacing: 1 }}>HOST</span>}
                    {uid === leaderId && <span style={{ fontSize: 14 }}>🏆</span>}
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #00c896, #D4AF37)', width: `${(p.budget / 100) * 100}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#5a8ab0' }}>
                    <span>{(p.squadSize ?? 0)}/20 players</span>
                    <span>·</span>
                    <span>{(p.overseas ?? 0)}/8 OS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AudioControls />
      <LiveChat code={code} user={user} roomState={currentRoom as any} isOpen={chatOpen} onToggle={() => setChatOpen(o => !o)} />
      <TradeDrawer roomState={currentRoom as any} user={user} code={code} />
    </AuthGuard>
  );
}
