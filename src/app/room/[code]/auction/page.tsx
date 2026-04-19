"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { useAuction } from "@/hooks/useAuction";
import { useTimer } from "@/hooks/useTimer";
import { players as ALL_PLAYERS, getEspnId } from "@/data/players";
import { ref, push, update } from "firebase/database";
import { realtimeDb as db } from "@/lib/firebase";
import { CircularTimer } from "@/components/auction/CircularTimer";
import { AudioControls } from "@/components/shared/AudioControls";
import { audioManager } from "@/lib/audioManager";
import { toast, Toaster } from "react-hot-toast";
import { firebaseArrayToArray } from "@/lib/utils";
import { formatCr } from "@/lib/budgetGuard";
import { TradeDrawer } from "@/components/trade/TradeDrawer";
import { LiveChat } from "@/components/auction/LiveChat";
import type {
  BidEntry,
  ParticipantState,
  RoomState,
  TeamPlayerState,
} from "@/types/room";
import type { BudgetGuardResult } from "@/lib/budgetGuard";
import type { Player } from "@/data/players";

// ─── Helper: Bid block reason ───
function getBidBlockReason(
  me: ParticipantState | null | undefined,
  player: Player | null,
  nextBid: number,
  guard: BudgetGuardResult | null,
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

function getSmartIncrement(bidsPlaced: number): number {
  if (bidsPlaced < 5) return 0.1;
  if (bidsPlaced < 10) return 0.2;
  if (bidsPlaced < 15) return 0.5;
  if (bidsPlaced < 20) return 1.0;
  return 2.0;
}

type PlayerAvatarProps = {
  player: Player | null | undefined;
  size?: number;
};

type AvatarRoleConfig = {
  emoji: string;
  bg: string;
  color: string;
};

// --- Player Avatar with Emoji Fallback ---
function PlayerAvatar({ player, size = 100 }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const roleConfig: Record<string, AvatarRoleConfig> = {
    Batsman: {
      emoji: "🏏",
      bg: "linear-gradient(135deg, #004d2e, #00c896)",
      color: "#00c896",
    },
    Bowler: {
      emoji: "🎯",
      bg: "linear-gradient(135deg, #4d0012, #ff4060)",
      color: "#ff4060",
    },
    "All-Rounder": {
      emoji: "⚡",
      bg: "linear-gradient(135deg, #2d0047, #b57bee)",
      color: "#b57bee",
    },
    "WK-Batsman": {
      emoji: "🧤",
      bg: "linear-gradient(135deg, #4d2a00, #ff8c00)",
      color: "#ff8c00",
    },
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
  const code = String(params.code || "")
    .trim()
    .toUpperCase();
  const { currentRoom, roomCode, joinRoom, setRoomCode, leaveRoom } = useRoom();
  const {
    auction,
    currentPlayer: hookCurrentPlayer,
    myState: me,
    budgetGuard,
    placeBid,
    finalizeSold,
    finalizeUnsold,
  } = useAuction(currentRoom, roomCode);
  const { seconds } = useTimer(auction?.timerEnd ?? 0);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(900);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setViewportHeight(window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSec = useRef(-1);
  const prevPhaseRef = useRef<string>("");
  const prevBidCountRef = useRef(0);
  const prevBudgetRef = useRef<number>(100);
  const prevPlayerIdRef = useRef<string | null>(null);

  const participants = currentRoom?.participants || {};
  const isHost = (currentRoom?.meta?.hostId || "") === user?.uid;
  const pool = firebaseArrayToArray<string>(currentRoom?.auction?.pool);
  const currentIndex = currentRoom?.auction?.currentIndex ?? 0;
  const currentPlayerId = pool[currentIndex] || null;
  const currentPlayer = currentPlayerId
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
  const bidHistory = firebaseArrayToArray<BidEntry>(auction?.bidHistory);
  const rawBidHistory = currentRoom?.auction?.bidHistory as
    | BidEntry[]
    | Record<string, BidEntry>
    | undefined;
  const bidCount = Array.isArray(rawBidHistory)
    ? rawBidHistory.length
    : Object.keys(rawBidHistory || {}).length;
  const increment = getSmartIncrement(bidCount);
  const openingBid = currentPlayer?.basePrice ?? 0;
  const bidAnchor = currentBid > 0 ? currentBid : openingBid;
  const nextBid =
    Math.round((bidAnchor + (currentBid > 0 ? increment : 0)) * 100) / 100;
  const auctionExtras = currentRoom?.auction as
    | (RoomState["auction"] & {
        withdrawals?: Record<string, boolean>;
        skipVotes?: Record<string, boolean>;
      })
    | undefined;
  const withdrawals = auctionExtras?.withdrawals || {};
  const hasWithdrawn = !!withdrawals[user?.uid || ""];
  const withdrawCount = Object.keys(withdrawals).length;
  const isLeading = leaderId === user?.uid;
  const myBudget = me?.budget ?? 100;
  const isLowBudget = myBudget <= 10 && myBudget > 0;
  const isCriticalBudget = myBudget <= 5 && myBudget > 0;
  const canAfford = !!me && me.budget >= nextBid;
  const overseasFull =
    !!currentPlayer &&
    currentPlayer.nationality === "Overseas" &&
    (me?.overseas ?? 0) >= 8;
  const squadFull = (me?.squadSize ?? 0) >= 20;
  const budgetBlocked =
    !budgetGuard?.canBid || budgetGuard?.status === "blocked";
  const bidBlockReason = getBidBlockReason(
    me ?? undefined,
    currentPlayer,
    nextBid,
    budgetGuard,
  );
  const canBid =
    !!me &&
    !!currentPlayer &&
    !!user &&
    phase === "bidding" &&
    !hasWithdrawn &&
    !isLeading &&
    canAfford &&
    !overseasFull &&
    !squadFull &&
    !budgetBlocked;
  const bidButtonDisabled =
    !user ||
    !me ||
    !currentPlayer ||
    hasWithdrawn ||
    isLeading ||
    !canAfford ||
    overseasFull ||
    squadFull ||
    budgetBlocked ||
    phase !== "bidding";
  const displayHistory = isMobile
    ? bidHistory.slice(0, 4)
    : bidHistory.slice(0, 8);
  const displaySeconds = Math.max(0, Math.min(15, seconds));
  const isShortMobile = isMobile && viewportHeight <= 760;
  const mobileTimerSize = isShortMobile ? 72 : 80;
  const mobileTimerRadius = isShortMobile ? 30 : 34;
  const mobileTimerCirc = Math.PI * 2 * mobileTimerRadius;
  const leaderPhoto = leaderId ? participants[leaderId]?.photoURL || "" : "";

  const roleConfig: Record<
    string,
    {
      emoji: string;
      label: string;
      gradient: string;
      color: string;
      glow: string;
      badgeBg: string;
    }
  > = {
    Batsman: {
      emoji: "🏏",
      label: "BATSMAN",
      gradient: "linear-gradient(135deg, #003d2b 0%, #006644 100%)",
      color: "#00c896",
      glow: "rgba(0,200,150,0.3)",
      badgeBg: "rgba(0,200,150,0.15)",
    },
    Bowler: {
      emoji: "🎯",
      label: "BOWLER",
      gradient: "linear-gradient(135deg, #3d0010 0%, #660022 100%)",
      color: "#ff4060",
      glow: "rgba(255,64,96,0.3)",
      badgeBg: "rgba(255,64,96,0.15)",
    },
    "All-Rounder": {
      emoji: "⚡",
      label: "ALL-ROUNDER",
      gradient: "linear-gradient(135deg, #1e0033 0%, #3d0066 100%)",
      color: "#b57bee",
      glow: "rgba(155,89,182,0.3)",
      badgeBg: "rgba(155,89,182,0.15)",
    },
    "WK-Batsman": {
      emoji: "🧤",
      label: "WICKET KEEPER",
      gradient: "linear-gradient(135deg, #3d2000 0%, #663300 100%)",
      color: "#ff8c00",
      glow: "rgba(255,140,0,0.3)",
      badgeBg: "rgba(255,140,0,0.15)",
    },
  };
  const rc = roleConfig[currentPlayer?.role || "Batsman"] || roleConfig.Batsman;

  const handleLeave = useCallback(async () => {
    await leaveRoom();
    router.push("/lobby");
  }, [leaveRoom, router]);

  const handlePlaceBid = useCallback(async () => {
    if (bidButtonDisabled) return;
    await audioManager.resume();
    const ok = await placeBid(nextBid);
    if (ok) {
      audioManager.playBid();
      toast.success(`You bid ${formatCr(nextBid)}`);
    }
  }, [bidButtonDisabled, nextBid, placeBid]);

  async function handleWithdraw() {
    if (!user || hasWithdrawn || isLeading) return;
    const confirmed = window.confirm(
      `Withdraw from bidding on ${currentPlayer?.name}?\n\nYou CANNOT bid on this player again!`,
    );
    if (!confirmed) return;

    const { update: fbUpdate } = await import("firebase/database");
    await fbUpdate(ref(db), {
      [`rooms/${code}/auction/withdrawals/${user.uid}`]: true,
    });
  }

  // --- Skipping Logic ---
  const skipVotes = auctionExtras?.skipVotes || {};
  const skipVoteCount = Object.keys(skipVotes).length;
  const totalPlayers = Object.keys(participants || {}).length;
  const iHaveVotedSkip = user?.uid ? !!skipVotes[user.uid] : false;
  const allVotedSkip = skipVoteCount >= totalPlayers && totalPlayers > 0;

  useEffect(() => {
    if (!isHost) return;
    if (!allVotedSkip) return;
    if (phase !== "bidding") return;
    const doSkip = async () => {
      const { update: fbUpdate } = await import("firebase/database");
      await fbUpdate(ref(db), { [`rooms/${code}/auction/skipVotes`]: null });
      finalizeUnsold();
    };
    doSkip();
  }, [allVotedSkip, isHost, phase, code, finalizeUnsold]);

  useEffect(() => {
    if (!currentPlayerId) return;

    if (
      isHost &&
      prevPlayerIdRef.current &&
      prevPlayerIdRef.current !== currentPlayerId
    ) {
      update(ref(db), {
        [`rooms/${code}/auction/skipVotes`]: null,
      });
    }

    prevPlayerIdRef.current = currentPlayerId;
  }, [code, currentPlayerId, isHost]);

  async function voteToSkip() {
    if (!user || iHaveVotedSkip || phase !== "bidding") return;
    const { update: fbUpdate } = await import("firebase/database");
    await fbUpdate(ref(db), {
      [`rooms/${code}/auction/skipVotes/${user.uid}`]: true,
    });
  }

  async function forceSkip() {
    if (!isHost || phase !== "bidding") return;
    const { update: fbUpdate } = await import("firebase/database");
    await fbUpdate(ref(db), { [`rooms/${code}/auction/skipVotes`]: null });
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
    } catch (e: unknown) {
      console.error("Auto end failed:", e);
    }
  }, [code, isHost]);

  useEffect(() => {
    if (!isHost || currentRoom?.meta?.status !== "auction") return;
    const ps: Record<string, ParticipantState> =
      currentRoom?.participants || {};
    const allFull = Object.values(ps).every((p) => (p.squadSize ?? 0) >= 20);
    if (allFull && Object.keys(ps).length > 0) {
      console.log("All squads full — ending auction automatically");
      handleAutoEnd();
    }
  }, [
    currentRoom?.participants,
    currentRoom?.meta?.status,
    isHost,
    handleAutoEnd,
  ]);

  async function handleEndAuction() {
    if (!isHost) return;
    const confirmed = window.confirm(
      "End the auction now? Remaining players will be auto-assigned at base price.",
    );
    if (!confirmed) return;

    const updates: Record<string, unknown> = {};
    const ps: Record<string, ParticipantState> =
      currentRoom?.participants || {};
    const teams: Record<
      string,
      Record<string, TeamPlayerState>
    > = currentRoom?.teams || {};
    const soldIds = new Set<string>();

    Object.values(teams).forEach((team) => {
      Object.keys(team || {}).forEach((id) => soldIds.add(id));
    });

    const unsold = pool
      .filter((id) => !soldIds.has(id))
      .map((id) => ALL_PLAYERS.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => a.basePrice - b.basePrice);

    Object.entries(ps).forEach(([uid, p]) => {
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

  const [chatOpen, setChatOpen] = useState(false);
  const [showMyTeam, setShowMyTeam] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false);

  const postSystemMessage = useCallback(
    async (text: string) => {
      if (!code) return;
      await push(ref(db, `rooms/${code}/chat`), {
        userId: "system",
        name: "System",
        photoURL: "",
        text,
        type: "system",
        createdAt: Date.now(),
      });
    },
    [code],
  );

  useEffect(() => {
    if (code) {
      setRoomCode(code);
      joinRoom(code);
    }
  }, [code, joinRoom, setRoomCode]);

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
      if (prevPhaseRef.current === "waiting" && phase === "bidding") {
        postSystemMessage("🚀 Auction has started! Good luck everyone!");
      } else if (phase === "sold" && currentPlayer && leaderName) {
        const f = currentRoom?.franchises?.[leaderId!];
        const fname = f?.name || leaderName;
        const flogo = f?.logo || "🏏";
        postSystemMessage(
          `🔨 ${currentPlayer.name} SOLD to ${flogo} ${fname} for ${formatCr(currentBid)}!`,
        );

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
      } else if (phase === "unsold" && currentPlayer) {
        postSystemMessage(`😔 ${currentPlayer.name} went UNSOLD`);
      }
    }

    prevPhaseRef.current = phase;
    if (phase === "sold") audioManager.playSold();
    else if (phase === "unsold") audioManager.playUnsold();
    else if (phase === "bidding") audioManager.playNewPlayer();
  }, [
    phase,
    isHost,
    currentPlayer,
    leaderName,
    leaderId,
    currentBid,
    currentRoom?.franchises,
    code,
    postSystemMessage,
  ]);

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
    if (seconds <= 3 && seconds > 0 && seconds !== prevSec.current) {
      audioManager.playTimerCritical();
    } else if (seconds <= 5 && seconds > 3 && seconds !== prevSec.current) {
      audioManager.playTimerWarning();
    }
    prevSec.current = seconds;
  }, [seconds, phase]);

  useEffect(() => {
    const status = currentRoom?.meta?.status;
    if (!status) return;
    // Only redirect FORWARD to playing11 — never back to waiting room
    if (status === "finished") {
      window.location.replace(`/room/${code}/playing11`);
    }
  }, [currentRoom?.meta?.status, code]);

  // Auth redirect — must be in useEffect, never in render body
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.replace("/");
    }
  }, [user, authLoading]);

  useEffect(() => {
    const budget = me?.budget ?? 100;

    if (prevBudgetRef.current > 10 && budget <= 10 && budget > 0) {
      toast(`⚠️ Low budget! Only ${formatCr(budget)} left!`, {
        icon: "💰",
        duration: 5000,
        style: {
          background: "#07182c",
          border: "1px solid rgba(255,140,0,0.4)",
          color: "#ff8c00",
          fontFamily: "Rajdhani, sans-serif",
          fontWeight: 700,
        },
      });
    }

    if (prevBudgetRef.current > 5 && budget <= 5 && budget > 0) {
      toast.error(`🚨 CRITICAL! Only ${formatCr(budget)} remaining!`, {
        duration: 6000,
      });
    }

    prevBudgetRef.current = budget;
  }, [me?.budget]);

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

  if (authLoading || !user)
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
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "3px solid rgba(212,175,55,0.15)",
            borderTopColor: "#D4AF37",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  if (!currentRoom || !auction)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030c18",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "3px solid rgba(212,175,55,0.15)",
            borderTopColor: "#D4AF37",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <div
          style={{
            fontFamily: "Teko, sans-serif",
            fontSize: 20,
            color: "#D4AF37",
            letterSpacing: 4,
          }}
        >
          LOADING AUCTION...
        </div>
      </div>
    );
  if (!currentPlayer) {
    return (
      <AuthGuard>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#030c18",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 56 }}>⏳</div>
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 28,
              color: "#D4AF37",
              letterSpacing: 4,
            }}
          >
            AUCTION STARTING...
          </div>
          <div style={{ color: "#5a8ab0", fontSize: 14 }}>
            Waiting for host to begin
          </div>
          <button
            onClick={() => (window.location.href = `/room/${code}`)}
            style={{
              marginTop: 16,
              padding: "10px 24px",
              borderRadius: 10,
              border: "1px solid #1a3a5c",
              background: "transparent",
              color: "#5a8ab0",
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ← Back to Waiting Room
          </button>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Toaster />

      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes goldPulse { 0%,100%{box-shadow:0 0 20px rgba(212,175,55,.3)} 50%{box-shadow:0 0 40px rgba(212,175,55,.7)} }
        @keyframes fadeInRight { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-1px)} 75%{transform:translateX(1px)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounceIn { 0%{opacity:0;transform:scale(0.7)} 60%{opacity:1;transform:scale(1.08)} 100%{transform:scale(1)} }
        @keyframes countUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ─── WRAPPER ─── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "#030c18",
          backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.25) 0%, transparent 50%),
                          radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.08) 0%, transparent 50%)`,
        }}
      >
        {isMobile ? (
          <>
            <nav
              style={{
                background: "rgba(3,12,24,0.98)",
                borderBottom: "1px solid rgba(212,175,55,0.15)",
                padding: isShortMobile ? "6px 10px" : "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "sticky",
                top: 0,
                zIndex: 50,
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 20,
                  background: "rgba(255,64,96,0.15)",
                  border: "1px solid rgba(255,64,96,0.4)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#ff4060",
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    color: "#ff4060",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 2,
                    fontFamily: "Rajdhani, sans-serif",
                  }}
                >
                  LIVE
                </span>
              </div>

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 14,
                    color: "#5a8ab0",
                    lineHeight: 1,
                  }}
                >
                  PLAYER {(currentIndex ?? 0) + 1}/{pool.length}
                </div>
              </div>

              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: isCriticalBudget
                    ? "rgba(255,64,96,0.15)"
                    : isLowBudget
                      ? "rgba(255,140,0,0.12)"
                      : "rgba(212,175,55,0.1)",
                  border: `1px solid ${
                    isCriticalBudget
                      ? "rgba(255,64,96,0.4)"
                      : isLowBudget
                        ? "rgba(255,140,0,0.4)"
                        : "rgba(212,175,55,0.3)"
                  }`,
                }}
              >
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 15,
                    color: isCriticalBudget
                      ? "#ff4060"
                      : isLowBudget
                        ? "#ff8c00"
                        : "#D4AF37",
                    lineHeight: 1,
                  }}
                >
                  {formatCr(myBudget)}
                </div>
              </div>

              <button
                onClick={() => setShowMyTeam(true)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(212,175,55,0.25)",
                  background: "rgba(212,175,55,0.06)",
                  color: "#D4AF37",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                  letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                👕 Team
              </button>

              <button
                onClick={() => {
                  window.location.href = "/lobby";
                }}
                style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,64,96,0.2)",
                  background: "transparent",
                  color: "#ff4060",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </nav>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: isShortMobile
                  ? "calc(100vh - 48px)"
                  : "calc(100vh - 52px)",
                overflow: "hidden",
                maxWidth: isMobile ? "100%" : "680px",
                margin: "0 auto",
                padding: isShortMobile ? "6px 10px 8px" : "10px 12px 12px",
                gap: isShortMobile ? 8 : 10,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  borderRadius: isShortMobile ? 16 : 20,
                  overflow: "hidden",
                  border: `1px solid ${rc.color}40`,
                  boxShadow: `0 8px 32px ${rc.glow}`,
                  background: "#07182c",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    background: rc.gradient,
                    padding: isShortMobile
                      ? "12px 12px 18px"
                      : "16px 16px 24px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: isShortMobile ? 10 : 12,
                    }}
                  >
                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: rc.badgeBg,
                        border: `1px solid ${rc.color}60`,
                        color: rc.color,
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{rc.emoji}</span>
                      <span>{rc.label}</span>
                    </div>
                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: "rgba(255,255,255,0.1)",
                        color: "#ddeeff",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: 1,
                      }}
                    >
                      {currentPlayer?.nationality === "Indian"
                        ? "🇮🇳 INDIA"
                        : "🌏 OVERSEAS"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        width: isShortMobile ? 64 : 72,
                        height: isShortMobile ? 64 : 72,
                        borderRadius: "50%",
                        background: `${rc.color}25`,
                        border: `3px solid ${rc.color}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isShortMobile ? 32 : 36,
                        flexShrink: 0,
                        boxShadow: `0 0 20px ${rc.glow}`,
                      }}
                    >
                      {rc.emoji}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "Teko, sans-serif",
                          fontSize: isShortMobile ? 24 : 28,
                          fontWeight: 700,
                          color: "#ffffff",
                          lineHeight: 1,
                          letterSpacing: 1,
                          textShadow: `0 0 20px ${rc.color}60`,
                        }}
                      >
                        {currentPlayer?.name}
                      </div>
                      {currentPlayer?.stats && (
                        <div
                          style={{
                            color: "rgba(255,255,255,0.6)",
                            fontSize: 12,
                            marginTop: 4,
                            fontFamily: "Rajdhani, sans-serif",
                          }}
                        >
                          {currentPlayer.stats}
                        </div>
                      )}
                      {currentPlayer?.ipl2025Team && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 6,
                            padding: "3px 10px",
                            borderRadius: 20,
                            background: "rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.7)",
                            fontSize: 11,
                            fontFamily: "Rajdhani, sans-serif",
                            fontWeight: 600,
                          }}
                        >
                          📅 {currentPlayer.ipl2025Team}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: isShortMobile ? "6px 12px" : "8px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      color: "#5a8ab0",
                      fontSize: 11,
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    BASE PRICE
                  </span>
                  <span
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: 18,
                      color: "#D4AF37",
                    }}
                  >
                    {formatCr(currentPlayer?.basePrice)}
                  </span>
                  <span
                    style={{
                      color: "#5a8ab0",
                      fontSize: 11,
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    Player {(currentIndex ?? 0) + 1} of {pool.length}
                  </span>
                </div>
              </div>

              <div
                style={{
                  padding: isShortMobile ? "12px" : "16px",
                  background: "rgba(7,24,44,0.9)",
                  borderRadius: 16,
                  border: "1px solid #1a3a5c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: "#5a8ab0",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: 3,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    CURRENT BID
                  </div>
                  <div
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: isShortMobile ? 42 : 48,
                      color: "#D4AF37",
                      lineHeight: 1,
                      filter: "drop-shadow(0 0 12px rgba(212,175,55,0.4))",
                    }}
                  >
                    {currentBid > 0
                      ? formatCr(currentBid)
                      : formatCr(currentPlayer?.basePrice ?? 0)}
                  </div>
                  {leaderId ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <img
                        src={leaderPhoto || ""}
                        alt="leader"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "1px solid #D4AF37",
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(leaderName || "?")}&background=1a3a5c&color=D4AF37&bold=true&size=20`;
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 700,
                          fontSize: 13,
                          color: leaderId === user?.uid ? "#00c896" : "#ddeeff",
                        }}
                      >
                        {leaderId === user?.uid
                          ? "🏆 YOU ARE LEADING!"
                          : `${leaderName} is leading`}
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: 12,
                        marginTop: 4,
                        fontStyle: "italic",
                      }}
                    >
                      No bids yet - be the first! 🔥
                    </div>
                  )}
                </div>

                <div
                  style={{
                    position: "relative",
                    width: mobileTimerSize,
                    height: mobileTimerSize,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width={mobileTimerSize}
                    height={mobileTimerSize}
                    style={{ transform: "rotate(-90deg)" }}
                  >
                    <circle
                      cx={mobileTimerSize / 2}
                      cy={mobileTimerSize / 2}
                      r={mobileTimerRadius}
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth={5}
                    />
                    <circle
                      cx={mobileTimerSize / 2}
                      cy={mobileTimerSize / 2}
                      r={mobileTimerRadius}
                      fill="none"
                      stroke={
                        displaySeconds <= 3
                          ? "#ff4060"
                          : displaySeconds <= 7
                            ? "#ff8c00"
                            : "#00c896"
                      }
                      strokeWidth={5}
                      strokeDasharray={mobileTimerCirc}
                      strokeDashoffset={
                        mobileTimerCirc * (1 - displaySeconds / 15)
                      }
                      strokeLinecap="round"
                      style={{
                        transition:
                          "stroke-dashoffset 0.1s linear, stroke 0.3s",
                      }}
                    />
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: isShortMobile ? 24 : 28,
                        lineHeight: 1,
                        color:
                          displaySeconds <= 3
                            ? "#ff4060"
                            : displaySeconds <= 7
                              ? "#ff8c00"
                              : "#fff",
                        animation:
                          displaySeconds <= 3
                            ? "shake 0.3s ease-in-out infinite"
                            : "none",
                      }}
                    >
                      {displaySeconds}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: "#5a8ab0",
                        letterSpacing: 1,
                        fontWeight: 600,
                      }}
                    >
                      SEC
                    </div>
                  </div>
                </div>
              </div>

              {isLowBudget && (
                <div
                  style={{
                    padding: isMobile ? "10px 14px" : "12px 16px",
                    borderRadius: 12,
                    background: isCriticalBudget
                      ? "rgba(255,64,96,0.12)"
                      : "rgba(255,140,0,0.1)",
                    border: `1px solid ${
                      isCriticalBudget
                        ? "rgba(255,64,96,0.4)"
                        : "rgba(255,140,0,0.4)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                    animation: isCriticalBudget
                      ? "goldPulse 1s ease-in-out infinite"
                      : "none",
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>
                    {isCriticalBudget ? "🚨" : "⚠️"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: isMobile ? "13px" : "14px",
                        color: isCriticalBudget ? "#ff4060" : "#ff8c00",
                        letterSpacing: 0.5,
                      }}
                    >
                      {isCriticalBudget
                        ? `🚨 CRITICAL — Only ${formatCr(myBudget)} left!`
                        : `⚠️ Low Budget — Only ${formatCr(myBudget)} remaining`}
                    </div>
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: isMobile ? "11px" : "12px",
                        marginTop: 2,
                      }}
                    >
                      {isCriticalBudget
                        ? "Bid very carefully — you need budget for remaining slots!"
                        : "Be careful with your remaining bids!"}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handlePlaceBid}
                disabled={bidButtonDisabled}
                style={{
                  width: "100%",
                  padding: isShortMobile ? "16px 14px" : "20px 16px",
                  borderRadius: 16,
                  border: "none",
                  backgroundImage: bidButtonDisabled
                    ? "none"
                    : isLeading
                      ? "linear-gradient(135deg, #00c896, #00a87a)"
                      : "linear-gradient(135deg, #D4AF37 0%, #f5d76e 50%, #D4AF37 100%)",
                  backgroundColor: bidButtonDisabled
                    ? "#0d2240"
                    : "transparent",
                  color: bidButtonDisabled
                    ? "#5a8ab0"
                    : isLeading
                      ? "#fff"
                      : "#111",
                  fontFamily: "Teko, sans-serif",
                  fontWeight: 700,
                  fontSize: isShortMobile ? 24 : 26,
                  letterSpacing: 2,
                  cursor: bidButtonDisabled ? "not-allowed" : "pointer",
                  boxShadow: bidButtonDisabled
                    ? "none"
                    : isLeading
                      ? "0 6px 24px rgba(0,200,150,0.4)"
                      : "0 6px 28px rgba(212,175,55,0.5)",
                  transition: "all 0.2s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  flexShrink: 0,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {!bidButtonDisabled && !isLeading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 2s linear infinite",
                    }}
                  />
                )}

                <span style={{ position: "relative", zIndex: 1 }}>
                  {hasWithdrawn
                    ? "🚫 WITHDRAWN"
                    : isLeading
                      ? "✅ YOU ARE LEADING"
                      : !canAfford
                        ? "💰 INSUFFICIENT BUDGET"
                        : squadFull
                          ? "✅ SQUAD FULL (20/20)"
                          : canBid
                            ? `🔨 BID ${formatCr(nextBid)}`
                            : bidBlockReason}
                </span>

                {canBid && !isLeading && !hasWithdrawn && (
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      fontSize: 12,
                      opacity: 0.8,
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    +
                    {increment >= 1
                      ? `₹${increment}Cr`
                      : `₹${Math.round(increment * 100)}L`}{" "}
                    increment · Bid #{bidCount + 1}
                  </span>
                )}
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: hasWithdrawn ? "1fr" : "1fr 1fr",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {!hasWithdrawn ? (
                  <button
                    onClick={handleWithdraw}
                    style={{
                      padding: isShortMobile ? "10px" : "12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,64,96,0.3)",
                      background: "rgba(255,64,96,0.08)",
                      color: "#ff4060",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 700,
                      fontSize: isShortMobile ? 12 : 13,
                      cursor: "pointer",
                      letterSpacing: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    🚫 Withdraw
                  </button>
                ) : (
                  <div
                    style={{
                      padding: isShortMobile ? "10px" : "12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      color: "#5a8ab0",
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 600,
                      fontSize: isShortMobile ? 11 : 12,
                      textAlign: "center",
                    }}
                  >
                    🚫 Withdrawn - Next player soon ({withdrawCount} total)
                  </div>
                )}

                <button
                  onClick={isHost ? forceSkip : voteToSkip}
                  disabled={!isHost && iHaveVotedSkip}
                  style={{
                    width: "100%",
                    padding: isMobile ? "11px" : "12px",
                    borderRadius: 12,
                    border: `1px solid ${
                      iHaveVotedSkip
                        ? "rgba(255,255,255,0.08)"
                        : allVotedSkip
                          ? "rgba(255,64,96,0.4)"
                          : "rgba(255,140,0,0.3)"
                    }`,
                    background: allVotedSkip
                      ? "rgba(255,64,96,0.1)"
                      : iHaveVotedSkip
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(255,140,0,0.08)",
                    color: allVotedSkip
                      ? "#ff4060"
                      : iHaveVotedSkip
                        ? "#5a8ab0"
                        : "#ff8c00",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: isMobile ? "13px" : "14px",
                    cursor: !isHost && iHaveVotedSkip ? "not-allowed" : "pointer",
                    letterSpacing: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                >
                  {isHost
                    ? "⏭ Force Skip Player"
                    : iHaveVotedSkip
                      ? `✓ You voted skip · ${skipVoteCount}/${totalPlayers} voted`
                      : allVotedSkip
                        ? `⏭ Skipping... (${skipVoteCount}/${totalPlayers})`
                        : `⏭ Vote to Skip · ${skipVoteCount}/${totalPlayers} voted`}
                </button>
              </div>

              {!isHost && !allVotedSkip && skipVoteCount > 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "#5a8ab0",
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  Need all {totalPlayers} players to vote skip
                </div>
              )}

              {isHost && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={handleEndAuction}
                    style={{
                      padding: isShortMobile ? "9px" : "10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,64,96,0.25)",
                      background: "rgba(255,64,96,0.06)",
                      color: "#ff4060",
                      fontFamily: "Rajdhani,sans-serif",
                      fontWeight: 700,
                      fontSize: isShortMobile ? 11 : 12,
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}
                  >
                    🏁 End Auction
                  </button>
                </div>
              )}

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  minHeight: 0,
                  borderRadius: 12,
                  border: "1px solid #1a3a5c",
                  background: "rgba(7,24,44,0.65)",
                  padding: isShortMobile ? 8 : 10,
                }}
              >
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: 9,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    marginBottom: isShortMobile ? 6 : 8,
                  }}
                >
                  BID HISTORY
                </div>

                {bidHistory.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "16px",
                      color: "#5a8ab0",
                      fontSize: 12,
                      fontStyle: "italic",
                    }}
                  >
                    No bids yet
                  </div>
                ) : (
                  bidHistory.slice(0, 4).map((bid: BidEntry, i: number) => (
                    <div
                      key={`${bid.userId}-${bid.time}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: isShortMobile ? "7px 8px" : "8px 10px",
                        borderRadius: 10,
                        marginBottom: 4,
                        background:
                          i === 0
                            ? "rgba(212,175,55,0.08)"
                            : "rgba(13,34,64,0.4)",
                        border: `1px solid ${
                          i === 0
                            ? "rgba(212,175,55,0.2)"
                            : "rgba(255,255,255,0.04)"
                        }`,
                      }}
                    >
                      <img
                        src={bid.photoURL || ""}
                        alt={bid.name || "bidder"}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          border: `1px solid ${i === 0 ? "#D4AF37" : "#1a3a5c"}`,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(bid.name || "?")}&background=1a3a5c&color=D4AF37&bold=true&size=28`;
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "Rajdhani, sans-serif",
                            fontWeight: 700,
                            fontSize: 13,
                            color:
                              bid.userId === user?.uid ? "#D4AF37" : "#ddeeff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {bid.userId === user?.uid ? "You" : bid.name}
                          {i === 0 && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 9,
                                padding: "1px 7px",
                                borderRadius: 20,
                                background: "rgba(212,175,55,0.15)",
                                color: "#D4AF37",
                                fontWeight: 700,
                              }}
                            >
                              LEADING
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "Teko, sans-serif",
                          fontSize: 16,
                          color: "#D4AF37",
                          flexShrink: 0,
                        }}
                      >
                        {formatCr(bid.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ─── NAVBAR ─── */}
            <nav
              style={{
                flexShrink: 0,
                background: "rgba(3,12,24,0.92)",
                borderBottom: "1px solid rgba(212,175,55,0.18)",
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                zIndex: 50,
                backdropFilter: "blur(14px)",
              }}
            >
              {/* Left — Logo + LIVE */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: isMobile ? 22 : 30,
                    color: "#D4AF37",
                    letterSpacing: 3,
                  }}
                >
                  IPL
                </span>
                {!isMobile && (
                  <span
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: 13,
                      color: "#5a8ab0",
                      letterSpacing: 2,
                    }}
                  >
                    AUCTION 2026
                  </span>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: 20,
                    background: "rgba(255,64,96,0.12)",
                    border: "1px solid rgba(255,64,96,0.3)",
                  }}
                >
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#ff4060",
                      animation: "pulse 1s ease-in-out infinite",
                    }}
                  />
                  <span
                    style={{
                      color: "#ff4060",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 2,
                    }}
                  >
                    LIVE
                  </span>
                </div>
              </div>

              {/* Center — Progress */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div
                  style={{ color: "#5a8ab0", fontSize: 9, letterSpacing: 1 }}
                >
                  PLAYER
                </div>
                <div
                  style={{
                    fontFamily: "Teko, sans-serif",
                    fontSize: 18,
                    color: "#ddeeff",
                    lineHeight: 1,
                  }}
                >
                  {currentIndex + 1} / {pool.length}
                </div>
              </div>

              {/* Right — Budget + Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                {/* Budget pill */}
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: isCriticalBudget
                      ? "rgba(255,64,96,0.15)"
                      : isLowBudget
                        ? "rgba(255,140,0,0.12)"
                        : "rgba(212,175,55,0.1)",
                    border: `1px solid ${
                      isCriticalBudget
                        ? "rgba(255,64,96,0.4)"
                        : isLowBudget
                          ? "rgba(255,140,0,0.4)"
                          : "rgba(212,175,55,0.3)"
                    }`,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{ color: "#5a8ab0", fontSize: 8, letterSpacing: 1 }}
                  >
                    BUDGET
                  </div>
                  <div
                    style={{
                      fontFamily: "Teko, sans-serif",
                      fontSize: 16,
                      color: isCriticalBudget
                        ? "#ff4060"
                        : isLowBudget
                          ? "#ff8c00"
                          : "#D4AF37",
                      lineHeight: 1,
                    }}
                  >
                    {formatCr(myBudget)}
                  </div>
                </div>
                {/* My Team */}
                <button
                  onClick={() => setShowMyTeam(true)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(212,175,55,0.3)",
                    background: "rgba(212,175,55,0.08)",
                    color: "#D4AF37",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    letterSpacing: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  👕 My Team
                </button>
                {/* All Teams */}
                <button
                  onClick={() => setShowAllTeams(true)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid #1a3a5c",
                    background: "rgba(255,255,255,0.04)",
                    color: "#5a8ab0",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    letterSpacing: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  👥 All Teams
                </button>
                {/* Leave */}
                <button
                  onClick={handleLeave}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,64,96,0.2)",
                    background: "transparent",
                    color: "#ff4060",
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ← Leave
                </button>
              </div>
            </nav>

            {/* ─── MAIN AUCTION AREA ─── */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                height: "calc(100vh - 76px)",
                overflow: "hidden",
                maxWidth: "900px",
                margin: "0 auto",
                width: "100%",
                padding: "18px 24px 20px",
                gap: 14,
              }}
            >
              {/* Player Spotlight */}
              <div
                style={{
                  flexShrink: 0,
                  padding: "18px 20px",
                  borderRadius: 20,
                  border: `1px solid ${rc.color}55`,
                  boxShadow: `0 10px 30px ${rc.glow}`,
                  background: `linear-gradient(145deg, ${rc.glow} 0%, rgba(7,24,44,0.92) 46%, rgba(7,24,44,0.85) 100%)`,
                }}
              >
                {/* Role + Nationality badges */}
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
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 12px",
                      borderRadius: 20,
                      background:
                        currentPlayer.role === "Batsman"
                          ? "rgba(0,200,150,0.12)"
                          : currentPlayer.role === "Bowler"
                            ? "rgba(255,64,96,0.12)"
                            : currentPlayer.role === "All-Rounder"
                              ? "rgba(155,89,182,0.15)"
                              : "rgba(255,140,0,0.12)",
                      border: `1px solid ${currentPlayer.role === "Batsman" ? "rgba(0,200,150,0.35)" : currentPlayer.role === "Bowler" ? "rgba(255,64,96,0.3)" : currentPlayer.role === "All-Rounder" ? "rgba(155,89,182,0.3)" : "rgba(255,140,0,0.3)"}`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>
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
                        fontSize: 11,
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
                      gap: 5,
                      padding: "4px 12px",
                      borderRadius: 20,
                      background:
                        currentPlayer.nationality === "Indian"
                          ? "rgba(0,136,51,0.12)"
                          : "rgba(0,123,255,0.12)",
                      border: `1px solid ${currentPlayer.nationality === "Indian" ? "rgba(0,136,51,0.3)" : "rgba(0,123,255,0.3)"}`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>
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
                        fontSize: 11,
                        letterSpacing: 1,
                      }}
                    >
                      {currentPlayer.nationality === "Indian"
                        ? "INDIA"
                        : (currentPlayer.country || "OVERSEAS").toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Player row */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div
                      style={{
                        width: isMobile ? 60 : 100,
                        height: isMobile ? 60 : 100,
                        borderRadius: "50%",
                        background: "rgba(212,175,55,0.1)",
                        border: "3px solid #D4AF37",
                        overflow: "hidden",
                        boxShadow: "0 0 24px rgba(212,175,55,0.35)",
                        animation: "goldPulse 2s ease-in-out infinite",
                      }}
                    >
                      <PlayerAvatar
                        player={currentPlayer}
                        size={isMobile ? 60 : 100}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: isMobile ? 24 : 40,
                        fontWeight: 700,
                        color: "#ffffff",
                        lineHeight: 1,
                        marginBottom: 4,
                      }}
                    >
                      {currentPlayer.name}
                    </h2>
                    <p
                      style={{
                        color: "#5a8ab0",
                        fontSize: 12,
                        marginBottom: 8,
                        lineHeight: 1.4,
                      }}
                    >
                      {currentPlayer.stats}
                    </p>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div
                        style={{
                          padding: "3px 12px",
                          borderRadius: 8,
                          background: "rgba(212,175,55,0.1)",
                          border: "1px solid rgba(212,175,55,0.3)",
                        }}
                      >
                        <span
                          style={{
                            color: "#5a8ab0",
                            fontSize: 9,
                            letterSpacing: 2,
                          }}
                        >
                          BASE{" "}
                        </span>
                        <span
                          style={{
                            fontFamily: "Teko, sans-serif",
                            fontSize: 18,
                            color: "#D4AF37",
                          }}
                        >
                          {formatCr(currentPlayer.basePrice)}
                        </span>
                      </div>
                      {currentPlayer.ipl2025Team && (
                        <div
                          style={{
                            padding: "3px 10px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid #1a3a5c",
                            color: "#5a8ab0",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          2025: {currentPlayer.ipl2025Team}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    marginTop: 10,
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
                      background: "linear-gradient(90deg, #D4AF37, #f5d76e)",
                      width: `${((currentIndex + 1) / Math.max(pool.length, 1)) * 100}%`,
                      transition: "width 0.6s",
                    }}
                  />
                </div>
                <div
                  style={{
                    color: "#5a8ab0",
                    fontSize: isMobile ? 11 : 13,
                    marginTop: 6,
                    textAlign: "right",
                  }}
                >
                  Player {currentIndex + 1} of {pool.length}
                </div>
              </div>

              {/* Bid Area (scrollable) */}
              <div
                style={{
                  flex: 1,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Current Bid + Timer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "18px 22px",
                    borderRadius: 16,
                    background: "rgba(7,24,44,0.9)",
                    border: `1px solid ${rc.color}45`,
                    boxShadow: `0 6px 24px ${rc.glow}`,
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#5a8ab0",
                        fontSize: 10,
                        letterSpacing: 3,
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      Current Bid
                    </div>
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 60,
                        fontWeight: 700,
                        lineHeight: 1,
                        background:
                          "linear-gradient(135deg, #D4AF37 0%, #f5d76e 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        filter: "drop-shadow(0 0 20px rgba(212,175,55,0.35))",
                      }}
                    >
                      {currentBid > 0
                        ? formatCr(currentBid)
                        : formatCr(currentPlayer?.basePrice ?? 0)}
                    </div>
                    {leaderId ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 4,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>🏆</span>
                        <img
                          src={participants[leaderId]?.photoURL || ""}
                          alt=""
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "Rajdhani, sans-serif",
                            fontWeight: 700,
                            color: "#00c896",
                            fontSize: isMobile ? 12 : 15,
                          }}
                        >
                          {leaderName ||
                            participants[leaderId]?.name ||
                            "Leader"}
                        </span>
                        {leaderId === user?.uid && (
                          <span
                            style={{
                              background: "rgba(0,200,150,0.15)",
                              color: "#00c896",
                              fontSize: 9,
                              padding: "1px 6px",
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
                          fontSize: 12,
                          marginTop: 4,
                          fontStyle: "italic",
                        }}
                      >
                        No bids yet — be the first!
                      </div>
                    )}
                  </div>
                  <CircularTimer
                    seconds={seconds}
                    total={15}
                    size={112}
                    numberFontSize={44}
                  />
                </div>

                {/* Smart Bid Controls */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      padding: "8px",
                      color: "#5a8ab0",
                      fontSize: isMobile ? "12px" : "13px",
                      marginBottom: 8,
                    }}
                  >
                    {bidCount === 0
                      ? `Base price: ${formatCr(currentPlayer?.basePrice)}`
                      : `Bid #${bidCount + 1} · Increment: ${increment >= 1 ? `₹${increment}Cr` : `₹${Math.round(increment * 100)}L`}`}
                  </div>

                  {isLowBudget && (
                    <div
                      style={{
                        padding: isMobile ? "10px 14px" : "12px 16px",
                        borderRadius: 12,
                        background: isCriticalBudget
                          ? "rgba(255,64,96,0.12)"
                          : "rgba(255,140,0,0.1)",
                        border: `1px solid ${
                          isCriticalBudget
                            ? "rgba(255,64,96,0.4)"
                            : "rgba(255,140,0,0.4)"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexShrink: 0,
                        animation: isCriticalBudget
                          ? "goldPulse 1s ease-in-out infinite"
                          : "none",
                      }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0 }}>
                        {isCriticalBudget ? "🚨" : "⚠️"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: "Rajdhani, sans-serif",
                            fontWeight: 700,
                            fontSize: isMobile ? "13px" : "14px",
                            color: isCriticalBudget ? "#ff4060" : "#ff8c00",
                            letterSpacing: 0.5,
                          }}
                        >
                          {isCriticalBudget
                            ? `🚨 CRITICAL — Only ${formatCr(myBudget)} left!`
                            : `⚠️ Low Budget — Only ${formatCr(myBudget)} remaining`}
                        </div>
                        <div
                          style={{
                            color: "#5a8ab0",
                            fontSize: isMobile ? "11px" : "12px",
                            marginTop: 2,
                          }}
                        >
                          {isCriticalBudget
                            ? "Bid very carefully — you need budget for remaining slots!"
                            : "Be careful with your remaining bids!"}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePlaceBid}
                    disabled={bidButtonDisabled}
                    style={{
                      width: "100%",
                      padding: "20px",
                      borderRadius: 14,
                      border: "none",
                      backgroundImage: bidButtonDisabled
                        ? "none"
                        : isLeading
                          ? "linear-gradient(135deg, #00c896, #00a87a)"
                          : "linear-gradient(135deg, #D4AF37 0%, #f5d76e 50%, #D4AF37 100%)",
                      backgroundColor: bidButtonDisabled
                        ? "#1a3a5c"
                        : "transparent",
                      color: bidButtonDisabled
                        ? "#5a8ab0"
                        : isLeading
                          ? "#fff"
                          : "#111",
                      fontFamily: "Teko, sans-serif",
                      fontWeight: 700,
                      fontSize: "28px",
                      letterSpacing: 2,
                      cursor: bidButtonDisabled ? "not-allowed" : "pointer",
                      boxShadow: bidButtonDisabled
                        ? "none"
                        : isLeading
                          ? "0 6px 24px rgba(0,200,150,0.4)"
                          : "0 6px 28px rgba(212,175,55,0.5)",
                      transition: "all 0.2s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {!bidButtonDisabled && !isLeading && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundImage:
                            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                          backgroundSize: "200% 100%",
                          animation: "shimmer 2s linear infinite",
                        }}
                      />
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>
                      {isLeading
                        ? "✅ YOU ARE LEADING"
                        : hasWithdrawn
                          ? "🚫 WITHDRAWN"
                          : canBid
                            ? `🔨 BID ${formatCr(nextBid)}`
                            : bidBlockReason}
                    </span>
                    {canBid && !isLeading && (
                      <span
                        style={{
                          position: "relative",
                          zIndex: 1,
                          fontSize: "13px",
                          opacity: 0.7,
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 600,
                          letterSpacing: 1,
                        }}
                      >
                        +
                        {increment >= 1
                          ? `₹${increment}Cr`
                          : `₹${Math.round(increment * 100)}L`}{" "}
                        from current bid
                      </span>
                    )}
                  </button>

                  {!hasWithdrawn && !isLeading && phase === "bidding" && (
                    <button
                      onClick={handleWithdraw}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,64,96,0.25)",
                        background: "rgba(255,64,96,0.06)",
                        color: "#ff4060",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                        fontSize: isMobile ? "13px" : "14px",
                        cursor: "pointer",
                        letterSpacing: 1,
                        transition: "all 0.15s",
                        marginTop: 8,
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
                      🚫 Withdraw — Pass on {currentPlayer?.name}
                    </button>
                  )}

                  {hasWithdrawn && (
                    <div
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                        color: "#5a8ab0",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 600,
                        fontSize: isMobile ? "13px" : "14px",
                        textAlign: "center",
                        marginTop: 8,
                      }}
                    >
                      🚫 You have withdrawn — waiting for next player (
                      {withdrawCount} withdrawn)
                    </div>
                  )}

                  {phase === "bidding" && (
                    <>
                      <button
                        onClick={isHost ? forceSkip : voteToSkip}
                        disabled={!isHost && iHaveVotedSkip}
                        style={{
                          width: "100%",
                          padding: isMobile ? "11px" : "12px",
                          borderRadius: 12,
                          border: `1px solid ${
                            iHaveVotedSkip
                              ? "rgba(255,255,255,0.08)"
                              : allVotedSkip
                                ? "rgba(255,64,96,0.4)"
                                : "rgba(255,140,0,0.3)"
                          }`,
                          background: allVotedSkip
                            ? "rgba(255,64,96,0.1)"
                            : iHaveVotedSkip
                              ? "rgba(255,255,255,0.03)"
                              : "rgba(255,140,0,0.08)",
                          color: allVotedSkip
                            ? "#ff4060"
                            : iHaveVotedSkip
                              ? "#5a8ab0"
                              : "#ff8c00",
                          fontFamily: "Rajdhani, sans-serif",
                          fontWeight: 700,
                          fontSize: isMobile ? "13px" : "14px",
                          cursor: !isHost && iHaveVotedSkip
                            ? "not-allowed"
                            : "pointer",
                          letterSpacing: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          transition: "all 0.15s",
                          marginTop: 8,
                        }}
                      >
                        {isHost
                          ? "⏭ Force Skip Player"
                          : iHaveVotedSkip
                            ? `✓ You voted skip · ${skipVoteCount}/${totalPlayers} voted`
                            : allVotedSkip
                              ? `⏭ Skipping... (${skipVoteCount}/${totalPlayers})`
                              : `⏭ Vote to Skip · ${skipVoteCount}/${totalPlayers} voted`}
                      </button>

                      {!isHost && !allVotedSkip && skipVoteCount > 0 && (
                        <div
                          style={{
                            textAlign: "center",
                            color: "#5a8ab0",
                            fontSize: 11,
                            marginTop: 4,
                          }}
                        >
                          Need all {totalPlayers} players to vote skip
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* PAUSED */}
                {phase === "paused" && (
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      background: "rgba(255,140,0,0.08)",
                      border: "1px solid rgba(255,140,0,0.3)",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 6 }}>⏸️</div>
                    <div
                      style={{
                        fontFamily: "Teko, sans-serif",
                        fontSize: 24,
                        color: "#ff8c00",
                      }}
                    >
                      AUCTION PAUSED
                    </div>
                    <div
                      style={{ color: "#5a8ab0", fontSize: 12, marginTop: 4 }}
                    >
                      Waiting for host to resume...
                    </div>
                  </div>
                )}

                {/* Bid History */}
                <div
                  style={{
                    borderRadius: 10,
                    background: "rgba(7,24,44,0.6)",
                    border: "1px solid #1a3a5c",
                    overflow: "hidden",
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "8px 14px",
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
                        fontSize: 11,
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
                        padding: "1px 7px",
                        borderRadius: 20,
                        fontSize: 10,
                      }}
                    >
                      {bidHistory.length}
                    </span>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      maxHeight: isMobile ? "120px" : "200px",
                    }}
                  >
                    {bidHistory.length === 0 ? (
                      <div
                        style={{
                          padding: 16,
                          textAlign: "center",
                          color: "#5a8ab0",
                          fontSize: 12,
                          fontStyle: "italic",
                        }}
                      >
                        Be the first to bid!
                      </div>
                    ) : (
                      displayHistory.map((bid: BidEntry, i: number) => (
                        <div
                          key={`${bid.userId}-${bid.time}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: isMobile ? "6px 8px" : "8px 12px",
                            borderBottom:
                              i < displayHistory.length - 1
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
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              fontFamily: "Rajdhani, sans-serif",
                              fontWeight: 600,
                              fontSize: isMobile ? 12 : 14,
                              color: i === 0 ? "#ddeeff" : "#5a8ab0",
                            }}
                          >
                            {bid.name}
                          </span>
                          {i === 0 && (
                            <span
                              style={{
                                fontSize: 8,
                                background: "rgba(212,175,55,0.2)",
                                color: "#D4AF37",
                                padding: "1px 5px",
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
                              fontSize: isMobile ? 16 : 20,
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

                {isHost && (
                  <div
                    style={{
                      display: "flex",
                      gap: 0,
                      padding: isMobile ? "8px 0" : "10px 0",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={handleEndAuction}
                      style={{
                        flex: 1,
                        padding: isMobile ? "8px" : "10px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,64,96,0.25)",
                        background: "rgba(255,64,96,0.06)",
                        color: "#ff4060",
                        fontFamily: "Rajdhani,sans-serif",
                        fontWeight: 700,
                        fontSize: isMobile ? "12px" : "13px",
                        cursor: "pointer",
                        letterSpacing: 1,
                      }}
                    >
                      🏁 End Auction
                    </button>
                  </div>
                )}
              </div>
              {/* end Bid Area */}
            </div>
            {/* end MAIN AUCTION AREA */}
          </>
        )}
      </div>
      {/* end WRAPPER */}

      {phase === "sold" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeInUp 0.3s ease-out",
          }}
        >
          <div
            style={{
              fontSize: 80,
              marginBottom: 8,
              animation: "bounceIn 0.5s ease-out",
            }}
          >
            🔨
          </div>
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 72,
              color: "#D4AF37",
              letterSpacing: 8,
              lineHeight: 1,
              textShadow: "0 0 40px rgba(212,175,55,0.6)",
              animation: "countUp 0.4s ease-out",
            }}
          >
            SOLD!
          </div>
          <div
            style={{
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: "#ddeeff",
              marginTop: 12,
            }}
          >
            {currentPlayer?.name}
          </div>
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 44,
              color: "#D4AF37",
              marginTop: 4,
            }}
          >
            {formatCr(currentBid)}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 16,
              color: "#00c896",
              fontWeight: 600,
            }}
          >
            🏏 Goes to {leaderName || "winning bidder"}
          </div>
        </div>
      )}

      {phase === "unsold" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 80, marginBottom: 8 }}>😔</div>
          <div
            style={{
              fontFamily: "Teko, sans-serif",
              fontSize: 64,
              color: "#ff4060",
              letterSpacing: 6,
            }}
          >
            UNSOLD
          </div>
          <div
            style={{
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 20,
              color: "#5a8ab0",
              marginTop: 8,
            }}
          >
            {currentPlayer?.name} - No takers
          </div>
        </div>
      )}

      {/* ─── MY TEAM MODAL (right drawer) ─── */}
      {showMyTeam && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowMyTeam(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(360px, calc(100vw - 20px))",
              background: "#07182c",
              borderLeft: "1px solid #1a3a5c",
              display: "flex",
              flexDirection: "column",
              animation: "fadeInRight 0.2s ease-out",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #1a3a5c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#D4AF37",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  My Squad
                </div>
                <div style={{ color: "#5a8ab0", fontSize: 11, marginTop: 2 }}>
                  {me?.squadSize ?? 0}/20 players · {me?.overseas ?? 0}/8 OS ·{" "}
                  {formatCr(me?.budget ?? 100)} left
                </div>
              </div>
              <button
                onClick={() => setShowMyTeam(false)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,64,96,0.3)",
                  background: "rgba(255,64,96,0.08)",
                  color: "#ff4060",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✕ Close
              </button>
            </div>
            {/* Team List */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {myTeam.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: "#5a8ab0",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🏏</div>
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
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      marginBottom: 6,
                      background: "rgba(13,34,64,0.6)",
                      border: "1px solid #1a3a5c",
                    }}
                  >
                    <PlayerAvatar player={p} size={30} />
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
                        fontSize: 15,
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
        </div>
      )}

      {/* ─── ALL TEAMS MODAL (right drawer) ─── */}
      {showAllTeams && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowAllTeams(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(400px, calc(100vw - 20px))",
              background: "#07182c",
              borderLeft: "1px solid #1a3a5c",
              display: "flex",
              flexDirection: "column",
              animation: "fadeInRight 0.2s ease-out",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #1a3a5c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#D4AF37",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                All Franchises ({Object.keys(participants).length})
              </div>
              <button
                onClick={() => setShowAllTeams(false)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,64,96,0.3)",
                  background: "rgba(255,64,96,0.08)",
                  color: "#ff4060",
                  fontFamily: "Rajdhani, sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✕ Close
              </button>
            </div>
            {/* Franchise List */}
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
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
                      border: `1px solid ${uid === user?.uid ? "rgba(212,175,55,0.25)" : "#1a3a5c"}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <img
                        src={p.photoURL || ""}
                        alt=""
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          objectFit: "cover",
                          flexShrink: 0,
                          border: `1px solid ${uid === currentRoom?.meta?.hostId ? "#D4AF37" : "#1a3a5c"}`,
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true`;
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
                            fontSize: 8,
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
                        marginBottom: 4,
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
                        fontSize: 10,
                        color: "#5a8ab0",
                      }}
                    >
                      <span>{p.squadSize ?? 0}/20 players</span>
                      <span>·</span>
                      <span>{p.overseas ?? 0}/8 OS</span>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      <AudioControls />
      <LiveChat
        code={code}
        user={user}
        roomState={currentRoom}
        isOpen={chatOpen}
        onToggle={() => setChatOpen((o) => !o)}
      />
      <TradeDrawer roomState={currentRoom} user={user} code={code} />
    </AuthGuard>
  );
}
