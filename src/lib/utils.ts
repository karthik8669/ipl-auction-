import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Player } from "@/data/players";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCr(amount: number): string {
  if (!amount && amount !== 0) return '—'
  if (amount >= 1) return `₹${amount.toFixed(2)} Cr`
  const lakhs = Math.round(amount * 100)
  return `₹${lakhs}L`
}

export function formatBidIncrement(currentBid: number): number {
  if (currentBid < 1) {
    return 0.05; // ₹5L
  } else if (currentBid < 2) {
    return 0.1; // ₹10L
  } else if (currentBid < 5) {
    return 0.25; // ₹25L
  } else {
    return 0.5; // ₹50L
  }
}

export function nextBid(currentBid: number): number {
  return currentBid + formatBidIncrement(currentBid);
}

export function genCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function calculateBudgetSafety(
  budget: number,
  teamSize: number,
  availablePlayers: Player[],
  slotsNeeded: number,
): {
  isSafetyBreach: boolean;
  minimumNeeded: number;
  canStillFill: boolean;
} {
  if (slotsNeeded <= 0)
    return { isSafetyBreach: false, minimumNeeded: 0, canStillFill: true };

  // Sort available players by base price ascending
  const sortedPlayers = availablePlayers.sort(
    (a: Player, b: Player) => a.basePrice - b.basePrice,
  );

  // Take the cheapest N players where N = slotsNeeded
  const cheapestPlayers = sortedPlayers.slice(0, slotsNeeded);
  const minimumNeeded = cheapestPlayers.reduce(
    (sum: number, player: Player) => sum + player.basePrice,
    0,
  );

  const isSafetyBreach = budget < minimumNeeded;
  const canStillFill = budget >= minimumNeeded;

  return { isSafetyBreach, minimumNeeded, canStillFill };
}

export function getRoleColor(role: string): string {
  switch (role) {
    case "Batsman":
      return "bg-emerald-900/20 text-emerald-400 border-emerald-500/30";
    case "Bowler":
      return "bg-red-900/15 text-red-400 border-red-500/25";
    case "All-Rounder":
      return "bg-purple-900/15 text-purple-400 border-purple-500/25";
    case "WK-Batsman":
      return "bg-orange-900/15 text-orange-400 border-orange-500/25";
    default:
      return "bg-gray-900/20 text-gray-400 border-gray-500/30";
  }
}

export function getSpecialTagColor(tag?: string): string {
  switch (tag) {
    case "MVP":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    case "Rising Star":
      return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
    case "Captain Pick":
      return "bg-gold/15 text-gold border-gold/40";
    case "Finisher":
      return "bg-pink-500/15 text-pink-300 border-pink-500/30";
    default:
      return "";
  }
}

export function getCountryFlag(countryCode: string): string {
  // Simple flag emoji mapping
  const flags: Record<string, string> = {
    IN: "🇮🇳",
    AU: "🇦🇺",
    SA: "🇿🇦",
    NZ: "🇳🇿",
    WI: "🇯🇲",
    ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    AF: "🇦🇫",
    SL: "🇱🇰",
    BAN: "🇧🇩",
    PK: "🇵🇰",
    SG: "🇸🇬",
    IE: "🇮🇪",
  };
  return flags[countryCode] || "🌍";
}

/**
 * Firebase stores arrays as objects. This converts either back to array.
 */
export function firebaseArrayToArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "object") return Object.values(val as Record<string, T>);
  return [];
}

/**
 * Safely converts Firebase data (object OR array) to an array
 */
export function toArray<T = unknown>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "object") return Object.values(val as Record<string, T>);
  return [];
}

/**
 * Safely converts Firebase data to Object.entries format
 */
export function toEntries<T = unknown>(val: unknown): [string, T][] {
  if (!val || typeof val !== "object" || Array.isArray(val)) return [];
  return Object.entries(val as Record<string, T>);
}

/**
 * Safely gets nested property without crashing
 */
export function safeGet<T>(obj: unknown, path: string, fallback: T): T {
  try {
    const keys = path.split(".");
    let current: unknown = obj;
    for (const key of keys) {
      if (current == null || typeof current !== "object") return fallback;
      current = (current as Record<string, unknown>)[key];
    }
    return (current ?? fallback) as T;
  } catch {
    return fallback;
  }
}
