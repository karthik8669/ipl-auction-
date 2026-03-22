import { NextRequest, NextResponse } from "next/server";

interface TeamPayloadPlayer {
  name: string;
  role: string;
  nationality: string;
  soldFor: number;
}

interface TeamPayload {
  name: string;
  budget: string;
  overseas: number;
  players: TeamPayloadPlayer[];
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY is not set");
    return NextResponse.json(
      { success: false, error: "AI service not configured" },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as { teams?: TeamPayload[] };
    if (!body.teams || !Array.isArray(body.teams)) {
      return NextResponse.json(
        { success: false, error: "Invalid request: teams array required" },
        { status: 400 },
      );
    }

    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const prompt = buildPrompt(body.teams);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let result: unknown;
    try {
      result = JSON.parse(raw);
    } catch {
      console.warn("AI analyze: invalid JSON response");
      return NextResponse.json(
        { success: false, error: "AI returned invalid response" },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, analysis: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "UNKNOWN";
    console.warn("API route error:", error);
    return NextResponse.json({ success: false, error: message, code }, { status: 500 });
  }
}

function buildPrompt(teams: TeamPayload[]) {
  const teamsText = teams
    .map(
      (t) => `
FRANCHISE: ${t.name}
Budget Left: ₹${t.budget}Cr | Players: ${t.players?.length || 0}/20
Players:
${(t.players || [])
  .map((p: TeamPayloadPlayer) => `  • ${p.name} [${p.role}] → ₹${p.soldFor}Cr`)
  .join("\n")}
`,
    )
    .join("\n---\n");

  return `
You are an IPL cricket analyst. Analyze these IPL 2026 auction squads.

${teamsText}

Respond ONLY in this exact JSON format:
{
  "winner": "team owner name",
  "winnerReason": "2-3 sentence explanation",
  "teamRatings": [
    {
      "name": "owner name",
      "rank": 1,
      "overallScore": 87,
      "breakdown": {
        "balance": 88, "overseas": 85, "batting": 90,
        "bowling": 84, "valueForMoney": 91, "starPower": 86
      },
      "strengths": ["strength 1", "strength 2"],
      "weaknesses": ["weakness 1"],
      "bestBuy": "Player — reason",
      "captainChoice": "Player — reason",
      "verdict": "One sentence verdict"
    }
  ],
  "auctionHighlights": {
    "mostExpensive":   { "player": "name", "team": "owner", "price": 0.0 },
    "bestBargain":     { "player": "name", "team": "owner", "price": 0.0, "worth": "why" },
    "mostOverpaid":    { "player": "name", "team": "owner", "price": 0.0, "reason": "why" },
    "bestOverseasPick":{ "player": "name", "team": "owner", "reason": "why" }
  },
  "funFact": "interesting observation"
}
`;
}
