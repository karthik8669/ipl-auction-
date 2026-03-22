"use client";

import { formatCr } from "@/lib/budgetGuard";

interface Entry {
  userId: string;
  name: string;
  photoURL: string;
  amount: number;
  time: number;
}

export function BidHistory({ bids }: { bids: Entry[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-label text-sm">Bid History</h3>
        <span className="text-xs text-muted">{bids.length}</span>
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {bids.length === 0 && <p className="text-sm text-muted">Be the first to bid!</p>}
        {bids.map((bid, idx) => (
          <div
            key={`${bid.userId}-${bid.time}`}
            className={`rounded px-2 py-1 text-sm ${idx === 0 ? "border-l-2 border-gold bg-card2" : "bg-card2/30"}`}
          >
            <div className="text-white">{bid.name}</div>
            <div className="text-xs text-muted">{formatCr(bid.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
