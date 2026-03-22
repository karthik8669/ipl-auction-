"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

interface TeamRating {
  name: string;
  rank: number;
  overallScore: number;
  verdict: string;
  breakdown: {
    balance: number;
    overseas: number;
    batting: number;
    bowling: number;
    valueForMoney: number;
    starPower: number;
  };
}

export function TeamRatingCard({ team }: { team: TeamRating }) {
  const data = [
    { metric: "Balance", value: team.breakdown.balance },
    { metric: "Overseas", value: team.breakdown.overseas },
    { metric: "Batting", value: team.breakdown.batting },
    { metric: "Bowling", value: team.breakdown.bowling },
    { metric: "Value", value: team.breakdown.valueForMoney },
    { metric: "Stars", value: team.breakdown.starPower },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-white">
      <div className="mb-2 font-label">#{team.rank} {team.name} - {team.overallScore}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#1a3a5c" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#5a8ab0", fontSize: 11 }} />
            <Radar dataKey="value" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-muted">{team.verdict}</p>
    </div>
  );
}
