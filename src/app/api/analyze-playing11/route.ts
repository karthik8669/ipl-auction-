import { NextResponse } from 'next/server'
import { Groq } from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

export async function POST(req: Request) {
  try {
    const { players, captain, viceCaptain, teams } = await req.json()

    if (Array.isArray(teams) && teams.length > 0) {
      const prompt = `
      Act as an expert IPL T20 cricket analyst.
      Compare these submitted playing 11 squads and return the best overall team.

      ${teams.map((t: any) => {
        const playerLines = (t.players || [])
          .map((p: any) => `- ${p.name} (${p.role}, ${p.nationality})`)
          .join('\n')
        return `\nTeam UID: ${t.uid}\nTeam Name: ${t.name}\nCaptain: ${t.captain}\nVice Captain: ${t.viceCaptain}\nPlayers:\n${playerLines}`
      }).join('\n\n')}

      Reply with a JSON string ONLY (no markdown, no extra words).
      Format exactly:
      {
        "winnerUid": "<team uid>",
        "winnerName": "<team name>",
        "winnerReason": "<2 short sentences>",
        "summary": "<1 punchy sentence>",
        "teamInsights": [
          {
            "uid": "<team uid>",
            "name": "<team name>",
            "rating": <number 1-10>,
            "strengths": "<1 short sentence>",
            "weaknesses": "<1 short sentence>",
            "verdict": "<1 short sentence>"
          }
        ]
      }
      Ensure all teams are included in teamInsights.
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

      const analysis = JSON.parse(jsonText)
      return NextResponse.json({ success: true, analysis })
    }

    const prompt = `
      Act as an expert cricket analyst like Harsha Bhogle.
      Analyze this IPL T20 playing 11:
      ${players.map((p: any) => `- ${p.name} (${p.role}, ${p.nationality})`).join('\n')}
      Captain: ${captain}
      Vice Captain: ${viceCaptain}

      Reply with a JSON string ONLY (no markdown or extra words).
      Format exactly:
      {
        "rating": <number 1-10 out of 10>,
        "strengths": "<2 short sentences>",
        "weaknesses": "<2 short sentences>",
        "summary": "<1 punchy sentence verdict>"
      }
    `

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const cleaned = raw.trim()
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    const jsonText =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? cleaned.slice(jsonStart, jsonEnd + 1)
        : cleaned
    const analysis = JSON.parse(jsonText)

    return NextResponse.json({ success: true, analysis })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ success: false, error: e.message })
  }
}
