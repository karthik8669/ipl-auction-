"use client";

import { players } from "@/data/players";
import { formatCr } from "@/lib/budgetGuard";

export function MySquadPanel({
  team,
  budget,
  overseas,
  squadSize,
}: {
  team: Record<string, { soldFor: number; isAutoFilled: boolean }>;
  budget: number;
  overseas: number;
  squadSize: number;
}) {
  const roster = Object.entries(team)
    .map(([id, v]) => ({ player: players.find((p) => p.id === id), soldFor: v.soldFor }))
    .filter((x) => x.player);
  return (
    <aside className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-label">My Squad ({squadSize}/20)</h3>
      <p className="font-display text-3xl text-gold">{formatCr(budget)}</p>
      <p className="text-xs text-muted">Slots: {squadSize}/20 | Overseas: {overseas}/8</p>
      <div className="mt-3 max-h-96 space-y-1 overflow-y-auto text-sm">
        {roster.length === 0 && <p className="text-muted">No players yet - start bidding!</p>}
        {roster.map((r) => (
          <div key={r.player!.id} className="flex items-center justify-between rounded bg-card2/40 p-2">
            <span>{r.player!.name}</span>
            <span className="text-muted">{formatCr(r.soldFor)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
