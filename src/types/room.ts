export interface RoomMeta {
  hostId: string;
  hostName: string;
  hostPhoto: string;
  status: "waiting" | "auction" | "finished";
  createdAt: number;
}

export interface ParticipantState {
  name: string;
  email: string;
  photoURL: string;
  budget: number;
  overseas: number;
  squadSize: number;
  isReady: boolean;
  joinedAt: number;
}

export interface TeamPlayerState {
  soldFor: number;
  isAutoFilled: boolean;
  addedAt: number;
  isTrade?: boolean;
}

export interface TradeOffer {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserPhoto: string;
  toUserId: string;
  toUserName: string;
  playerId: string;
  playerName: string;
  offerAmount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: number;
  respondedAt?: number;
}

export interface Franchise {
  name: string;
  color: string;
  logo: string;
  createdAt: number;
}

export interface ChatMessage {
  id?: string;
  userId: string;
  name: string;
  photoURL: string;
  text: string;
  emoji: string | null;
  type: 'message' | 'reaction' | 'system';
  franchiseName?: string;
  franchiseColor?: string;
  franchiseLogo?: string;
  createdAt: number;
}

export interface RTMState {
  used: boolean;
  usedOn: string | null;
  usedAt: number | null;
}

export interface RTMWindow {
  active: boolean;
  playerId: string;
  playerName: string;
  amount: number;
  originalWinnerId: string;
  originalWinnerName: string;
  expiresAt: number;
}

export interface BidEntry {
  userId: string;
  name: string;
  photoURL: string;
  amount: number;
  time: number;
}

export interface AuctionState {
  pool: string[];
  currentIndex: number;
  phase: "waiting" | "bidding" | "sold" | "unsold" | "paused";
  timerEnd: number;
  currentBid: number;
  leaderId: string | null;
  leaderName: string | null;
  leaderPhoto: string | null;
  bidHistory: BidEntry[];
}

export interface RoomState {
  meta: RoomMeta;
  participants: Record<string, ParticipantState>;
  teams: Record<string, Record<string, TeamPlayerState>>;
  auction: AuctionState;
  unsoldPlayers: string[];
  aiAnalysis: string | null;
  trades?: Record<string, TradeOffer>;
  franchises?: Record<string, Franchise>;
  chat?: Record<string, ChatMessage>;
  rtm?: Record<string, RTMState>;
  rtmWindow?: RTMWindow;
}
