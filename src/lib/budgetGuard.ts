import { Player } from "@/data/players";

export type BudgetStatus = "safe" | "warning" | "blocked";

export interface BudgetGuardResult {
  status: BudgetStatus;
  slotsLeft: number;
  minNeeded: number;
  warningThreshold: number;
  message: string;
  canBid: boolean;
}

export function checkBudgetGuard(
  budget: number,
  squadSize: number,
  remainingPool: Player[],
): BudgetGuardResult {
  const slotsLeft = 20 - squadSize;
  if (slotsLeft <= 0) {
    return {
      status: "safe",
      slotsLeft: 0,
      minNeeded: 0,
      warningThreshold: 0,
      message: "Squad complete!",
      canBid: false,
    };
  }
  const sortedPrices = [...remainingPool]
    .map((p) => p.basePrice)
    .sort((a, b) => a - b);
  const minNeeded = sortedPrices
    .slice(0, slotsLeft)
    .reduce((sum, price) => sum + price, 0);
  const avgBase =
    remainingPool.length > 0
      ? remainingPool.reduce((s, p) => s + p.basePrice, 0) / remainingPool.length
      : 0.5;
  const warningThreshold = slotsLeft * avgBase * 2.0;
  if (budget <= minNeeded + 0.01) {
    return {
      status: "blocked",
      slotsLeft,
      minNeeded,
      warningThreshold,
      message: `Budget locked: need ${formatCr(minNeeded)} for ${slotsLeft} slots`,
      canBid: false,
    };
  }
  if (budget <= warningThreshold) {
    return {
      status: "warning",
      slotsLeft,
      minNeeded,
      warningThreshold,
      message: `Careful: only ${formatCr(budget)} left for ${slotsLeft} slots`,
      canBid: true,
    };
  }
  return {
    status: "safe",
    slotsLeft,
    minNeeded,
    warningThreshold,
    message: "",
    canBid: true,
  };
}

export function getNextBidAmount(currentBid: number): number {
  if (currentBid < 1) return Math.round((currentBid + 0.05) * 100) / 100;
  if (currentBid < 2) return Math.round((currentBid + 0.1) * 100) / 100;
  if (currentBid < 5) return Math.round((currentBid + 0.25) * 100) / 100;
  return Math.round((currentBid + 0.5) * 100) / 100;
}

export function formatCr(amount: number): string {
  if (amount >= 1) return `₹${amount.toFixed(2)} Cr`;
  return `₹${Math.round(amount * 100)}L`;
}
