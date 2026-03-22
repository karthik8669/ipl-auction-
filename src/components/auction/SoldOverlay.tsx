"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { Player } from "@/data/players";
import { formatCr } from "@/lib/budgetGuard";

export function SoldOverlay({
  show,
  player,
  soldFor,
  winnerName,
}: {
  show: boolean;
  player: Player | null;
  soldFor: number;
  winnerName: string;
}) {
  useEffect(() => {
    if (!show) return;
    const end = Date.now() + 1200;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 80, origin: { x: 0 } });
      confetti({ particleCount: 5, angle: 120, spread: 80, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [show]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="text-center">
            <div className="font-display text-8xl text-gold">SOLD!</div>
            <div className="text-xl text-white">{player?.name}</div>
            <div className="font-display text-5xl text-gold">{formatCr(soldFor)}</div>
            <div className="text-green">To {winnerName}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
