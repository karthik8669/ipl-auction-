"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Player } from "@/data/players";

export function UnsoldOverlay({ show, player }: { show: boolean; player: Player | null }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div animate={{ x: [-10, 10, -10, 10, 0] }} transition={{ duration: 0.45 }}>
            <div className="text-center">
              <div className="font-display text-8xl text-red">UNSOLD</div>
              <div className="text-xl text-white">{player?.name}</div>
              <div className="text-sm text-muted">No bids - player returns to unsold pool</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
