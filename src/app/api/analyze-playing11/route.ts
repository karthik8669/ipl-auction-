import { NextResponse } from 'next/server'
import { Groq } from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

export async function POST(req: Request) {
  try {
    const { players, captain, viceCaptain } = await req.json()

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
    const analysis = JSON.parse(raw)

    return NextResponse.json({ success: true, analysis })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ success: false, error: e.message })
  }
}
