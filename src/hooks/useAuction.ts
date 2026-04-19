import { useCallback, useMemo } from "react";
import { ref, runTransaction, update } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { players } from "@/data/players";
import { getNextBidAmount } from "@/lib/budgetGuard";
import { checkBudgetGuard } from "@/lib/budgetGuard";
import { BidEntry, RoomState } from "@/types/room";
import { firebaseArrayToArray } from "@/lib/utils";

export function useAuction(currentRoom: RoomState | null, roomCode: string | null) {
  const { user } = useAuth();

  const safeParticipants = useMemo(() => currentRoom?.participants || {}, [currentRoom]);
  const safeTeams = useMemo(() => currentRoom?.teams || {}, [currentRoom]);
  const safeAuction = (currentRoom?.auction || {}) as Partial<RoomState["auction"]> & {
    pool?: unknown;
    currentIndex?: number;
    phase?: string;
    currentBid?: number;
    leaderId?: string | null;
    leaderName?: string | null;
    leaderPhoto?: string | null;
    timerEnd?: number;
    bidHistory?: unknown;
    withdrawals?: unknown;
  };
  const safeUnsoldPlayers = firebaseArrayToArray<string>(currentRoom?.unsoldPlayers);

  const pool = useMemo(
    () => firebaseArrayToArray<string>(safeAuction.pool),
    [safeAuction.pool],
  );
  const currentIndex = safeAuction.currentIndex ?? 0;
  const phase = safeAuction.phase || "waiting";
  const currentBid = safeAuction.currentBid ?? 0;
  const leaderId = safeAuction.leaderId || null;
  const leaderName = safeAuction.leaderName || null;
  const leaderPhoto = safeAuction.leaderPhoto || null;
  const timerEnd = safeAuction.timerEnd || null;
  const bidHistory = useMemo(
    () => firebaseArrayToArray<BidEntry>(safeAuction.bidHistory),
    [safeAuction.bidHistory],
  );
  const withdrawals = useMemo(
    () => (safeAuction.withdrawals as Record<string, boolean> | undefined) || {},
    [safeAuction.withdrawals],
  );

  const currentPlayer = useMemo(() => {
    const id = pool[currentIndex];
    return players.find((p) => p.id === id) ?? null;
  }, [pool, currentIndex]);

  const remainingPool = useMemo(() => {
    if (!currentRoom) return [];
    const soldOrUnsoldIds = new Set<string>();
    const teams = safeTeams || {};
    Object.values(teams).forEach((teamMap) => {
      Object.keys((teamMap as Record<string, unknown>) || {}).forEach((id) =>
        soldOrUnsoldIds.add(id),
      );
    });
    const unsold = safeUnsoldPlayers;
    unsold.forEach((id) => soldOrUnsoldIds.add(id));

    return pool
      .slice(currentIndex)
      .filter((id) => !soldOrUnsoldIds.has(id))
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is (typeof players)[number] => Boolean(p));
  }, [currentRoom, currentIndex, pool, safeTeams, safeUnsoldPlayers]);

  const myState = useMemo(
    () => (user ? safeParticipants[user.uid] : undefined),
    [safeParticipants, user],
  );

  const nextBidAmount = useMemo(
    () => getNextBidAmount(currentBid),
    [currentBid],
  );

  const budgetGuard = useMemo(
    () =>
      myState
        ? checkBudgetGuard(myState.budget, myState.squadSize, remainingPool)
        : null,
    [myState, remainingPool],
  );

  const placeBid = useCallback(
    async (amount: number) => {
      if (!user || !roomCode || !currentRoom || !myState || !currentPlayer) {
        return false;
      }
      const overseasBlock =
        currentPlayer.nationality === "Overseas" && myState.overseas >= 8;
      const hasWithdrawnForPlayer = !!withdrawals[user.uid];
      if (
        phase !== "bidding" ||
        leaderId === user.uid ||
        hasWithdrawnForPlayer ||
        myState.squadSize >= 20 ||
        overseasBlock ||
        !budgetGuard?.canBid ||
        amount > myState.budget
      ) {
        return false;
      }
      const auctionRef = ref(realtimeDb, `rooms/${roomCode}/auction`);
      const tx = await runTransaction(auctionRef, (current) => {
        if (!current || current.phase !== "bidding") return current;
        const txWithdrawals = (current.withdrawals || {}) as Record<string, boolean>;
        if (txWithdrawals[user.uid]) return current;
        if (amount <= current.currentBid) return;
        return {
          ...current,
          currentBid: amount,
          leaderId: user.uid,
          leaderName: myState.name,
          leaderPhoto: myState.photoURL,
          timerEnd: Date.now() + 15000,
          bidHistory: [
            {
              userId: user.uid,
              name: myState.name,
              photoURL: myState.photoURL,
              amount,
              time: Date.now(),
            },
            ...firebaseArrayToArray<BidEntry>(current.bidHistory).slice(0, 19),
          ],
        };
      });
      return tx.committed;
    },
    [budgetGuard?.canBid, currentPlayer, currentRoom, leaderId, myState, phase, roomCode, user, withdrawals],
  );

  const moveToNext = useCallback(
    async () => {
      if (!roomCode || !currentRoom) return;
      const nextIndex = currentIndex + 1;
      if (nextIndex >= pool.length) {
        await update(ref(realtimeDb, `rooms/${roomCode}`), {
          "meta/status": "finished",
          "auction/phase": "finished",
          "auction/timerEnd": 0,
        });
        return true;
      }
      await update(ref(realtimeDb, `rooms/${roomCode}/auction`), {
        phase: "bidding",
        currentIndex: nextIndex,
        currentBid: 0,
        leaderId: null,
        leaderName: null,
        leaderPhoto: null,
        bidHistory: [],
        withdrawals: null,
        timerEnd: Date.now() + 15000,
      });
      return true;
    },
    [currentIndex, currentRoom, pool.length, roomCode],
  );

  const finalizeSold = useCallback(async () => {
    if (!roomCode || !currentRoom || !currentPlayer) return false;
    const winnerId = leaderId;
    const price = currentBid;
    if (!winnerId || price <= 0) return false;
    await update(ref(realtimeDb, `rooms/${roomCode}`), {
      [`teams/${winnerId}/${currentPlayer.id}`]: {
        soldFor: price,
        isAutoFilled: false,
        addedAt: Date.now(),
      },
      [`participants/${winnerId}/budget`]:
        (safeParticipants[winnerId]?.budget ?? 0) - price,
      [`participants/${winnerId}/squadSize`]:
        (safeParticipants[winnerId]?.squadSize ?? 0) + 1,
      [`participants/${winnerId}/overseas`]:
        (safeParticipants[winnerId]?.overseas ?? 0) +
        (currentPlayer.nationality === "Overseas" ? 1 : 0),
      "auction/phase": "sold",
      "auction/timerEnd": 0,
    });
    await moveToNext();
    return true;
  }, [currentBid, currentPlayer, currentRoom, leaderId, moveToNext, roomCode, safeParticipants]);

  const finalizeUnsold = useCallback(async () => {
    if (!roomCode || !currentRoom || !currentPlayer) return false;
    await update(ref(realtimeDb, `rooms/${roomCode}`), {
      unsoldPlayers: [...safeUnsoldPlayers, currentPlayer.id],
      "auction/phase": "unsold",
      "auction/timerEnd": 0,
    });
    await moveToNext();
    return true;
  }, [currentPlayer, currentRoom, moveToNext, roomCode, safeUnsoldPlayers]);

  const pauseAuction = useCallback(async () => {
    if (!roomCode) return;
    await update(ref(realtimeDb, `rooms/${roomCode}/auction`), {
      phase: "paused",
      timerEnd: 0,
    });
  }, [roomCode]);

  const resumeAuction = useCallback(async () => {
    if (!roomCode) return;
    await update(ref(realtimeDb, `rooms/${roomCode}/auction`), {
      phase: "bidding",
      timerEnd: Date.now() + 15000,
    });
  }, [roomCode]);

  return {
    auction: {
      ...safeAuction,
      pool,
      currentIndex,
      phase,
      currentBid,
      leaderId,
      leaderName,
      leaderPhoto,
      timerEnd,
      bidHistory,
    },
    currentPlayer,
    remainingPool,
    nextBidAmount,
    budgetGuard,
    myState,
    placeBid,
    finalizeSold,
    finalizeUnsold,
    pauseAuction,
    resumeAuction,
  };
}
