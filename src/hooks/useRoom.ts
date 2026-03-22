import { useState, useEffect, useCallback } from "react";
import { ref, onValue, set, update, remove, get } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { AuctionState, RoomState } from "@/types/room";
import { useAuth } from "@/hooks/useAuth";
import { genCode } from "@/lib/utils";

const DEFAULT_AUCTION: AuctionState = {
  pool: [],
  currentIndex: 0,
  phase: "waiting",
  timerEnd: 0,
  currentBid: 0,
  leaderId: null,
  leaderName: null,
  leaderPhoto: null,
  bidHistory: [],
};

export function useRoom() {
  const { user } = useAuth();
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(
    async () => {
      if (!user) {
        setError("User must be authenticated to create a room");
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        let code = "";
        for (let i = 0; i < 10; i += 1) {
          const maybeCode = genCode();
          const exists = await get(ref(realtimeDb, `rooms/${maybeCode}`));
          if (!exists.exists()) {
            code = maybeCode;
            break;
          }
        }
        if (!code) throw new Error("Could not generate room code");
        const roomState: RoomState = {
          meta: {
            hostId: user.uid,
            hostName: user.displayName || "Host",
            hostPhoto: user.photoURL || "",
            status: "waiting",
            createdAt: Date.now(),
          },
          participants: {
            [user.uid]: {
              name: user.displayName || "Anonymous",
              email: user.email || "",
              photoURL: user.photoURL || "",
              budget: 100,
              overseas: 0,
              squadSize: 0,
              isReady: true,
              joinedAt: Date.now(),
            },
          },
          teams: {
            [user.uid]: {},
          },
          auction: DEFAULT_AUCTION,
          unsoldPlayers: [],
          aiAnalysis: null,
        };
        await set(ref(realtimeDb, `rooms/${code}`), roomState);
        setRoomCode(code);
        return { code };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create room";
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  const joinRoom = useCallback(
    async (inputCode: string) => {
      if (!user) {
        setError("User must be authenticated to join a room");
        return false;
      }
      setLoading(true);
      setError(null);
      try {
        const code = inputCode.trim().toUpperCase();
        const roomRef = ref(realtimeDb, `rooms/${code}`);
        const snap = await get(roomRef);
        if (!snap.exists()) throw new Error("Room not found");
        const room = snap.val() as RoomState;
        if (!room.participants[user.uid]) {
          await update(roomRef, {
            [`participants/${user.uid}`]: {
              name: user.displayName || "Anonymous",
              email: user.email || "",
              photoURL: user.photoURL || "",
              budget: 100,
              overseas: 0,
              squadSize: 0,
              isReady: true,
              joinedAt: Date.now(),
            },
            [`teams/${user.uid}`]: {},
          });
        }
        setRoomCode(code);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to join room";
        setError(errorMessage);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  const leaveRoom = useCallback(async () => {
    if (!user || !roomCode || !currentRoom) return;
    const roomRef = ref(realtimeDb, `rooms/${roomCode}`);
    const remaining = Object.keys(currentRoom?.participants || {}).filter(
      (id) => id !== user.uid,
    );
    if (remaining.length === 0) {
      await remove(roomRef);
      setCurrentRoom(null);
      setRoomCode(null);
      return;
    }
    const nextHostId =
      currentRoom.meta.hostId === user.uid ? remaining[0] : currentRoom.meta.hostId;
    const nextHost = currentRoom?.participants?.[nextHostId];
    await update(roomRef, {
      [`participants/${user.uid}`]: null,
      [`teams/${user.uid}`]: null,
      "meta/hostId": nextHostId,
      "meta/hostName": nextHost?.name || "Host",
      "meta/hostPhoto": nextHost?.photoURL || "",
    });
    setCurrentRoom(null);
    setRoomCode(null);
  }, [currentRoom, roomCode, user]);

  const saveSelectedPool = useCallback(
    async (pool: string[]) => {
      if (!roomCode) return;
      await update(ref(realtimeDb, `rooms/${roomCode}/auction`), {
        pool,
        currentIndex: 0,
        phase: "waiting",
        timerEnd: 0,
        currentBid: 0,
        leaderId: null,
        leaderName: null,
        leaderPhoto: null,
        bidHistory: [],
      });
    },
    [roomCode],
  );

  const startAuction = useCallback(async () => {
    if (!roomCode || !currentRoom || !user) return;
    if (currentRoom.meta.hostId !== user.uid) return;
    const firstId = currentRoom.auction.pool[0];
    if (!firstId) throw new Error("Select player pool first");
    await update(ref(realtimeDb, `rooms/${roomCode}`), {
      "meta/status": "auction",
      "auction/phase": "bidding",
      "auction/currentIndex": 0,
      "auction/currentBid": 0,
      "auction/leaderId": null,
      "auction/leaderName": null,
      "auction/leaderPhoto": null,
      "auction/bidHistory": [],
      "auction/timerEnd": Date.now() + 15000,
    });
  }, [currentRoom, roomCode, user]);

  useEffect(() => {
    if (!roomCode) return;
    const roomRef = ref(realtimeDb, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setCurrentRoom(snapshot.val() as RoomState);
      } else {
        setCurrentRoom(null);
      }
    });
    return () => unsubscribe();
  }, [roomCode]);

  return {
    currentRoom,
    roomCode,
    loading,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    saveSelectedPool,
    startAuction,
    setRoomCode,
  };
}
