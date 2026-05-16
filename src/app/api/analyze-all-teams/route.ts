import { NextResponse } from 'next/server'
import { Groq } from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

type TeamPayload = {
  uid: string
  name: string
  captain?: string
  viceCaptain?: string
  players?: Array<{
    name: string
    role?: string
    nationality?: string
    basePrice?: number
    soldFor?: number
    stats?: string
  }>
}

type LeaderboardEntry = {
  uid: string
  name: string
  rank: number
  score: number
  strengths: string[]
  weaknesses: string[]
  verdict: string
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function localFallback(teams: TeamPayload[]) {
  const ranked = teams
    .map((team) => {
      const players = Array.isArray(team.players) ? team.players : []
      const roleCounts = players.reduce(
        (acc, player) => {
          if (player.role === 'Batsman') acc.batsman += 1
          if (player.role === 'Bowler') acc.bowler += 1
          if (player.role === 'All-Rounder') acc.allRounder += 1
          if (player.role === 'WK-Batsman') acc.wicketKeeper += 1
          return acc
        },
        { batsman: 0, bowler: 0, allRounder: 0, wicketKeeper: 0 },
      )

      const totalSpend = players.reduce(
        (sum, player) => sum + toNumber(player.soldFor ?? player.basePrice),
        0,
      )
      const balanceScore =
        Math.min(roleCounts.batsman, 4) +
        Math.min(roleCounts.bowler, 4) +
        Math.min(roleCounts.allRounder, 3) +
        (roleCounts.wicketKeeper > 0 ? 2 : 0)

      return {
        uid: team.uid,
        name: team.name,
        score: Math.max(1, Math.min(10, 4.5 + balanceScore * 0.45 + totalSpend / 50)),
        strengths: [
          `Balanced core with ${players.length} players`,
          roleCounts.wicketKeeper > 0 ? 'Has wicketkeeping coverage' : 'Needs wicketkeeping depth',
        ],
        weaknesses: [
          roleCounts.bowler < 3 ? 'Bowling depth is thin' : 'Could still add more death-bowling control',
        ],
        verdict: `${team.name} shows ${balanceScore >= 8 ? 'excellent' : 'decent'} T20 balance.`,
      }
    })
    .sort((a, b) => b.score - a.score)

  const leaderboard: LeaderboardEntry[] = ranked.map((team, index) => ({
    uid: team.uid,
    name: team.name,
    rank: index + 1,
    score: Number(team.score.toFixed(1)),
    strengths: team.strengths,
    weaknesses: team.weaknesses,
    verdict: team.verdict,
  }))

  return {
    winnerUid: leaderboard[0]?.uid || '',
    winnerName: leaderboard[0]?.name || '',
    summary: leaderboard[0]
      ? `${leaderboard[0].name} edges the field with the strongest playing 11.`
      : 'No leaderboard available yet.',
    leaderboard,
  }
}

export async function POST(req: Request) {
  let body: { teams?: TeamPayload[] } = {}
  try {
    body = (await req.json()) as { teams?: TeamPayload[] }
    const teams = Array.isArray(body.teams) ? body.teams.filter(Boolean) : []

    if (!teams.length) {
      return NextResponse.json({ success: true, analysis: localFallback([]) })
    }

    const prompt = `
You are an elite IPL auction and playing XI analyst.
Rank every submitted team ONLY on playing XI quality, balance, captaincy, role fit, and T20 match impact.

${teams
  .map((team) => {
    const playerLines = (team.players || [])
      .map(
        (player) =>
          `- ${player.name} (${player.role || 'Player'}, ${player.nationality || 'Unknown'})`,
      )
      .join('\n')
    return `Team UID: ${team.uid}\nTeam Name: ${team.name}\nCaptain: ${team.captain || ''}\nVice Captain: ${team.viceCaptain || ''}\nPlayers:\n${playerLines}`
  })
  .join('\n\n')}

Return JSON ONLY in this exact shape:
{
  "winnerUid": "<team uid>",
  "winnerName": "<team name>",
  "summary": "<1 short sentence>",
  "leaderboard": [
    {
      "uid": "<team uid>",
      "name": "<team name>",
      "rank": 1,
      "score": 9.5,
      "strengths": ["<short sentence>", "<short sentence>"],
      "weaknesses": ["<short sentence>"],
      "verdict": "<short sentence>"
    }
  ]
}
Include every team in leaderboard and order it from best to worst.
`

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const cleaned = raw.trim()
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    const jsonText =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? cleaned.slice(jsonStart, jsonEnd + 1)
        : cleaned

    const parsed = JSON.parse(jsonText) as {
      winnerUid?: string
      winnerName?: string
      summary?: string
      leaderboard?: LeaderboardEntry[]
    }

    const leaderboard = Array.isArray(parsed.leaderboard)
      ? parsed.leaderboard
          .map((entry, index) => ({
            uid: String(entry?.uid || teams[index]?.uid || ''),
            name: String(entry?.name || teams[index]?.name || ''),
            rank: Number.isFinite(Number(entry?.rank)) ? Number(entry?.rank) : index + 1,
            score: Number.isFinite(Number(entry?.score)) ? Number(entry?.score) : Math.max(1, 10 - index * 0.3),
            strengths: Array.isArray(entry?.strengths)
              ? entry.strengths.map((item) => String(item))
              : ['Strong playing 11'],
            weaknesses: Array.isArray(entry?.weaknesses)
              ? entry.weaknesses.map((item) => String(item))
              : ['Needs fine-tuning'],
            verdict: String(entry?.verdict || 'Solid squad'),
          }))
          .sort((a, b) => a.rank - b.rank)
      : localFallback(teams).leaderboard

    return NextResponse.json({
      success: true,
      analysis: {
        winnerUid: parsed.winnerUid || leaderboard[0]?.uid || '',
        winnerName: parsed.winnerName || leaderboard[0]?.name || '',
        summary: parsed.summary || leaderboard[0]?.verdict || 'Leaderboard ready.',
        leaderboard,
      },
    })
  } catch (error: any) {
    console.error('Analyze all teams error:', error)
    return NextResponse.json({
      success: true,
      analysis: localFallback(body.teams || []),
    })
  }
}