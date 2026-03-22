"use client";

import { motion } from "framer-motion";
import { Player, getEspnId } from "@/data/players";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { formatCr } from "@/lib/budgetGuard";

export function PlayerSpotlight({
  player,
  index,
  total,
}: {
  player: Player | null;
  index: number;
  total: number;
}) {
  if (!player) return null;
  return (
    <motion.div
      key={player.id}
      variants={{ hidden: { y: 30, opacity: 0 }, show: { y: 0, opacity: 1 } }}
      initial="hidden"
      animate="show"
      className="rounded-xl border border-border bg-card p-6"
    >
      <div className="mb-4 flex justify-between text-sm text-muted">
        <span>{player.role}</span>
        <span>{player.nationality === "Indian" ? "India" : player.country}</span>
      </div>
      <PlayerImage
        player={{ name: player.name, espnId: getEspnId(player.id) }}
        size={140}
        className="mx-auto border-4 border-gold"
      />
      <h2 className="mt-4 text-center font-display text-5xl">{player.name}</h2>
      <p className="text-center text-sm text-muted">{player.stats}</p>
      <div className="mt-3 text-center text-gold">{formatCr(player.basePrice)}</div>
      <div className="mt-4 h-2 overflow-hidden rounded bg-card2">
        <div
          className="h-full bg-gold"
          style={{ width: `${Math.min(100, ((index + 1) / Math.max(total, 1)) * 100)}%` }}
        />
      </div>
    </motion.div>
  );
}
