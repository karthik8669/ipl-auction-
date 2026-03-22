"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CircularTimer } from "@/components/auction/CircularTimer";
import { formatCr } from "@/lib/budgetGuard";

export function BidSection({
  currentBid,
  leaderName,
  isMeLeader,
  seconds,
  bidCta,
  disabled,
  onBid,
  isHost,
  onPause,
  onUnsold,
  onSold,
  onResume,
  paused,
}: {
  currentBid: number;
  leaderName: string | null;
  isMeLeader: boolean;
  seconds: number;
  bidCta: string;
  disabled: boolean;
  onBid: () => void;
  isHost: boolean;
  onPause: () => void;
  onUnsold: () => void;
  onSold: () => void;
  onResume: () => void;
  paused: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <motion.div key={currentBid} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.3 }}>
        <div className="font-display text-6xl text-gold">{formatCr(currentBid)}</div>
      </motion.div>
      <div className="mb-3 text-sm text-green">
        {leaderName ? `${leaderName}${isMeLeader ? " (YOU)" : ""}` : "No bids yet - base price"}
      </div>
      <div className="mb-3 flex justify-center">
        <CircularTimer seconds={seconds} />
      </div>
      <Button className="h-16 w-full text-2xl font-display" disabled={disabled} onClick={onBid}>
        {bidCta}
      </Button>
      {isHost && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={paused ? onResume : onPause}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" onClick={onUnsold}>
            Unsold
          </Button>
          <Button className="col-span-2" onClick={onSold}>
            Sell
          </Button>
        </div>
      )}
    </div>
  );
}
