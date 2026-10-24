import { NextRequest, NextResponse } from "next/server";
import { BracketingFormatId } from "@/types/boxscore";

const DEFAULT_GEMINI_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
  "";

export interface GeminiTournamentRequest {
  action: "recommend_format" | "analyze_bracket" | "custom_prompt" | "sports_news_recap";
  leagueName: string;
  ruleSetId: string;
  startDate?: string;
  endDate?: string;
  courts?: string[];
  teamNames: string[];
  currentFormatId?: BracketingFormatId;
  customPrompt?: string;
  gameData?: {
    gameNumber?: number;
    homeTeamName: string;
    awayTeamName: string;
    homeScore: number;
    awayScore: number;
    leadChanges?: number;
    timesTied?: number;
    biggestLeadHome?: number;
    biggestLeadAway?: number;
    quarterScores?: {
      home: number[];
      away: number[];
    };
    allHomePlayersStats?: {
      name: string;
      jersey: number;
      min: string;
      pts: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      fg: string;
    }[];
    allAwayPlayersStats?: {
      name: string;
      jersey: number;
      min: string;
      pts: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      fg: string;
    }[];
    topPerformers?: {
      name: string;
      team: string;
      points: number;
      rebounds: number;
      assists: number;
    }[];
    nextOpponentHome?: string;
    nextOpponentAway?: string;
    nextGameDate?: string;
    otherLeagueGamesSummary?: string[];
    notablePlays?: string[];
  };
}

export interface GeminiTournamentResponse {
  recommendedFormatId: BracketingFormatId;
  recommendedPoolsCount: 1 | 2 | 4;
  recommendedSeriesBestOf: 3 | 5 | 7;
  recommendedStepladderVariant: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
  headline: string;
  analysisMarkdown: string;
  scheduleTips: string[];
  source: "gemini-live" | "gemini-engine";
}

function computeDeterministicRecommendation(
  body: GeminiTournamentRequest
): GeminiTournamentResponse {
  if (body.action === "sports_news_recap" && body.gameData) {
    const {
      homeTeamName,
      awayTeamName,
      homeScore,
      awayScore,
      leadChanges,
      timesTied,
      biggestLeadHome,
      biggestLeadAway,
      quarterScores,
      allHomePlayersStats,
      allAwayPlayersStats,
      topPerformers,
      nextOpponentHome,
      nextOpponentAway,
      otherLeagueGamesSummary,
    } = body.gameData;

    const winner = homeScore > awayScore ? homeTeamName : awayScore > homeScore ? awayTeamName : "Tie";
    const loser = winner === homeTeamName ? awayTeamName : homeTeamName;
    const winScore = Math.max(homeScore, awayScore);
    const loseScore = Math.min(homeScore, awayScore);
    const margin = winScore - loseScore;

    const winnerPlayers = winner === homeTeamName ? allHomePlayersStats : allAwayPlayersStats;
    const loserPlayers = winner === homeTeamName ? allAwayPlayersStats : allHomePlayersStats;

    // Top performers for each team
    const winStar = winnerPlayers && winnerPlayers.length > 0
      ? [...winnerPlayers].sort((a, b) => b.pts - a.pts)[0]
      : null;
    const winSecondStar = winnerPlayers && winnerPlayers.length > 1
      ? [...winnerPlayers].sort((a, b) => (b.pts + b.reb + b.ast) - (a.pts + a.reb + a.ast))[1]
      : null;
    const loseStar = loserPlayers && loserPlayers.length > 0
      ? [...loserPlayers].sort((a, b) => b.pts - a.pts)[0]
      : null;

    // Quarter progression
    const hQ = quarterScores?.home || [0, 0, 0, 0];
    const aQ = quarterScores?.away || [0, 0, 0, 0];
    const q4Win = winner === homeTeamName ? (hQ[3] || 0) : (aQ[3] || 0);
    const q4Lose = winner === homeTeamName ? (aQ[3] || 0) : (hQ[3] || 0);

    // Headline styling
    const headline = margin >= 15
      ? `${winner.toUpperCase()} CRUISE PAST ${loser.toUpperCase()} ${winScore}–${loseScore} IN COMMANDING ROUT`
      : margin <= 5
      ? `${winner.toUpperCase()} OUTLAST ${loser.toUpperCase()} ${winScore}–${loseScore} IN CLUTCH FINAL SECONDS`
      : `${winner.toUpperCase()} PULL AWAY IN 4TH QUARTER TO STIFLE ${loser.toUpperCase()} ${winScore}–${loseScore}`;

    // Rich narrative assembly
    const leadChangeText = (leadChanges && leadChanges > 0)
      ? `A fierce back-and-forth duel that witnessed **${leadChanges} lead changes** and **${timesTied || 0} deadlocks**`
      : `A hard-nosed defensive grind`;

    const biggestLeadText = (biggestLeadHome && biggestLeadAway)
      ? `Neither squad surrendered ground easily, with ${homeTeamName} mounting a ${biggestLeadHome}-point cushion while ${awayTeamName} counterpunched with a ${biggestLeadAway}-point surge of their own.`
      : `Momentum swung wildly across all four quarters before the closing minutes settled the ledger.`;

    const starHighlight = winStar
      ? `**${winStar.name}** ignited ${winner} with a vintage display, racking up **${winStar.pts} points** (shooting ${winStar.fg}), pulling down **${winStar.reb} rebounds**, and dealing **${winStar.ast} assists** in ${winStar.min} minutes of relentless floor action.`
      : `${winner} leaned on balanced scoring and crisp ball movement down the stretch.`;

    const secondStarHighlight = winSecondStar
      ? `Complementing the charge was **${winSecondStar.name}**, who provided crucial secondary scoring and rim defense with **${winSecondStar.pts} points** and **${winSecondStar.reb} boards**.`
      : "";

    const loserHighlight = loseStar
      ? `In the defeat, ${loser} was paced by **${loseStar.name}**, who poured in **${loseStar.pts} points** alongside **${loseStar.reb} rebounds**, keeping his squad within striking distance until the final horn.`
      : "";

    const fourthQuarterBreakdown = q4Win >= q4Lose
      ? `The decisive blow came in the fourth quarter, where ${winner} tightened their perimeter rotations and outscored ${loser} ${q4Win}–${q4Lose} to seal the outcome.`
      : `Despite a furious fourth-quarter push by ${loser} (${q4Lose}–${q4Win}), ${winner} converted timely free throws to protect their hard-earned lead.`;

    // Next game context
    const nextGameHomeOpp = nextOpponentHome ? `face off against **${nextOpponentHome}**` : `await their next bracket opponent`;
    const nextGameAwayOpp = nextOpponentAway ? `battle **${nextOpponentAway}**` : `recalibrate for their upcoming tournament fixture`;

    const nextScheduleContext = `Looking ahead in the ${body.leagueName} schedule, **${homeTeamName}** will ${nextGameHomeOpp}, while **${awayTeamName}** must quickly regroup as they prepare to ${nextGameAwayOpp}.`;

    const otherGamesContext = otherLeagueGamesSummary && otherLeagueGamesSummary.length > 0
      ? `\n\nAround the association, today's results further tightened the standings race:\n${otherLeagueGamesSummary.slice(0, 3).map((g) => `- ${g}`).join("\n")}`
      : "";

    const analysisMarkdown = `${leadChangeText} concluded with **${winner}** clinching a gritty **${winScore}–${loseScore}** victory over **${loser}** in front of an electric courtside crowd at the ${body.leagueName}.

${biggestLeadText}

${starHighlight} ${secondStarHighlight}

${loserHighlight}

${fourthQuarterBreakdown}

${nextScheduleContext}${otherGamesContext}`;

    return {
      recommendedFormatId: body.currentFormatId || "MULTI_STAGE",
      recommendedPoolsCount: 2,
      recommendedSeriesBestOf: 3,
      recommendedStepladderVariant: "PAGE_MCINTYRE_TOP4",
      headline,
      analysisMarkdown,
      scheduleTips: [
        `${winner} showcased championship poise down the stretch in critical possessions.`,
        `${loser} will look to clean up turnovers and second-chance conversion heading into their next matchup.`,
        `Next up: ${homeTeamName} takes on ${nextOpponentHome || "their next rival"}, while ${awayTeamName} matches up against ${nextOpponentAway || "their upcoming foe"}.`,
      ],
      source: "gemini-engine",
    };
  }

  const numTeams = body.teamNames.length;
  const courtsList =
    (body.courts && body.courts.length > 0) ? body.courts.join(", ") : "Main Tournament Court";
  const promptLower = (body.customPrompt ?? "").toLowerCase();

  let recommendedFormatId: BracketingFormatId = body.currentFormatId || "MULTI_STAGE";
  let recommendedPoolsCount: 1 | 2 | 4 = numTeams >= 6 ? 2 : 1;
  let recommendedSeriesBestOf: 3 | 5 | 7 = 3;
  let recommendedStepladderVariant: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB" =
    "PAGE_MCINTYRE_TOP4";

  if (promptLower.includes("double") || promptLower.includes("loser")) {
    recommendedFormatId = "DOUBLE_ELIMINATION";
  } else if (promptLower.includes("single") || promptLower.includes("knockout")) {
    recommendedFormatId = "SINGLE_ELIMINATION";
  } else if (
    promptLower.includes("page") ||
    promptLower.includes("mcintyre") ||
    promptLower.includes("stepladder")
  ) {
    recommendedFormatId = "PAGE_MCINTYRE";
    if (promptLower.includes("climb") || promptLower.includes("stepladder")) {
      recommendedStepladderVariant = "STEPLADDER_CLIMB";
    }
  } else if (promptLower.includes("series") || promptLower.includes("best")) {
    recommendedFormatId = "SERIES_PLAYOFF";
    if (promptLower.includes("5")) recommendedSeriesBestOf = 5;
    if (promptLower.includes("7")) recommendedSeriesBestOf = 7;
  } else if (promptLower.includes("round") || promptLower.includes("pool only")) {
    recommendedFormatId = "ROUND_ROBIN";
  } else if (body.action === "recommend_format") {
    if (numTeams >= 8) {
      recommendedFormatId = "MULTI_STAGE";
      recommendedPoolsCount = 2;
    } else if (numTeams >= 5) {
      recommendedFormatId = "ROUND_ROBIN";
      recommendedPoolsCount = 1;
    } else if (numTeams === 4) {
      recommendedFormatId = "PAGE_MCINTYRE";
    } else {
      recommendedFormatId = "SINGLE_ELIMINATION";
    }
  }

  const half = Math.ceil(numTeams / 2);
  const bracketATeams = body.teamNames.slice(0, half);
  const bracketBTeams = body.teamNames.slice(half);

  const poolGamesCount =
    recommendedPoolsCount === 2
      ? (bracketATeams.length * (bracketATeams.length - 1)) / 2 +
        (bracketBTeams.length * (bracketBTeams.length - 1)) / 2
      : (numTeams * Math.max(0, numTeams - 1)) / 2;

  const formatSummaries: Record<BracketingFormatId, string> = {
    SINGLE_ELIMINATION: `**Single-Elimination (Knockout Bracket)** — *"Win or go home."* With **${numTeams} teams** in **${body.leagueName}**, this format requires only **${Math.max(1, numTeams - 1)} total games** at **${courtsList}**, making it the fastest way to crown a champion within ${body.startDate || "your start date"} to ${body.endDate || "your end date"}.`,
    DOUBLE_ELIMINATION: `**Double-Elimination Bracket** — Every franchise in **${body.leagueName}** is guaranteed at least **2 games**. Teams losing in the **Winners' Bracket** drop into the **Losers' (Consolation) Bracket** for a second-chance path to the Grand Championship Final.`,
    ROUND_ROBIN: `**Round-Robin (Pool Play / Group Stage)** — Divided into **${recommendedPoolsCount === 2 ? "Bracket A & Bracket B" : "a Single League Pool"}** (${poolGamesCount} group games). Advancement and rankings are decided by W-L record and FIBA point differential (\`+/-\`).`,
    MULTI_STAGE: `**Multi-Stage (Hybrid / Pool-to-Knockout)** — The gold standard for **${numTeams}-team** basketball tournaments like **${body.leagueName}**:\n- **Stage 1 (Group Stage)**: **Bracket A** (${bracketATeams.join(", ") || "TBD"}) & **Bracket B** (${bracketBTeams.join(", ") || "TBD"}) play a ${poolGamesCount}-game Round-Robin.\n- **Stage 2 (Knockout Playoffs)**: Top qualifiers cross over (\`Bracket A #1 vs Bracket B #2\`, \`Bracket B #1 vs Bracket A #2\`) into sudden-death Semifinals and Finals at **${courtsList}**.`,
    SERIES_PLAYOFF: `**Series Playoff Bracket (Best-of-${recommendedSeriesBestOf})** — NBA/PBA-style multi-game series where matchups are decided over a **Best-of-${recommendedSeriesBestOf}** slate (first team to **${Math.ceil(recommendedSeriesBestOf / 2)} wins** advances).`,
    PAGE_MCINTYRE: `**Page-McIntyre / Stepladder System** — Rewards top regular-season seeds with structural bracket protection:\n- **1v2 Major Semifinal (Qualifier)**: Winner advances directly to the **Grand Final**; Loser gets a second life in the **Preliminary Final**.\n- **3v4 Minor Semifinal (Elimination)**: Sudden-death knockout; Winner meets the 1v2 Loser in the **Preliminary Final**.`,
  };

  return {
    recommendedFormatId,
    recommendedPoolsCount,
    recommendedSeriesBestOf,
    recommendedStepladderVariant,
    headline: `Gemini AI Tournament Plan for ${body.leagueName} (${numTeams} Teams • ${body.ruleSetId} Rules)`,
    analysisMarkdown: formatSummaries[recommendedFormatId],
    scheduleTips: [
      `Assign 5 daily time slots (09:00 AM, 11:00 AM, 01:30 PM, 03:30 PM, 05:30 PM) across ${courtsList} to prevent back-to-back player fatigue.`,
      numTeams >= 6
        ? `Serpentine-seed your ${numTeams} teams into Bracket A (${bracketATeams.length} teams) and Bracket B (${bracketBTeams.length} teams) for competitive balance.`
        : `Use ${body.ruleSetId} point-differential tiebreakers (+/-) for all group-stage standings.`,
      `Use the "Seed Playoffs from Pool Standings" button in the Bracket tab once group play concludes to auto-populate the Knockout Tree.`,
    ],
    source: "gemini-engine",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GeminiTournamentRequest;
    const baseFallback = computeDeterministicRecommendation(body);

    let systemPrompt = "";

    if (body.action === "sports_news_recap" && body.gameData) {
      systemPrompt = `You are an elite, award-winning basketball beat reporter, sports journalist, and AP Style game recap writer.
League: "${body.leagueName}"
Ruleset: ${body.ruleSetId}
Matchup: ${body.gameData.homeTeamName} vs ${body.gameData.awayTeamName}
Final Score: ${body.gameData.homeTeamName} ${body.gameData.homeScore} — ${body.gameData.awayScore} ${body.gameData.awayTeamName}
Game Context:
- Lead Changes: ${body.gameData.leadChanges ?? "N/A"}
- Times Tied: ${body.gameData.timesTied ?? "N/A"}
- ${body.gameData.homeTeamName} Biggest Lead: ${body.gameData.biggestLeadHome ?? "N/A"}
- ${body.gameData.awayTeamName} Biggest Lead: ${body.gameData.biggestLeadAway ?? "N/A"}
Quarter Breakdown:
  ${body.gameData.homeTeamName}: ${JSON.stringify(body.gameData.quarterScores?.home || [])}
  ${body.gameData.awayTeamName}: ${JSON.stringify(body.gameData.quarterScores?.away || [])}
All ${body.gameData.homeTeamName} Player Stats: ${JSON.stringify(body.gameData.allHomePlayersStats || [])}
All ${body.gameData.awayTeamName} Player Stats: ${JSON.stringify(body.gameData.allAwayPlayersStats || [])}
Key Performers: ${JSON.stringify(body.gameData.topPerformers || [])}
Next Scheduled Opponent for ${body.gameData.homeTeamName}: ${body.gameData.nextOpponentHome || "TBD"}
Next Scheduled Opponent for ${body.gameData.awayTeamName}: ${body.gameData.nextOpponentAway || "TBD"}
Recent Tournament Context / Other League Games: ${JSON.stringify(body.gameData.otherLeagueGamesSummary || [])}
Notable Plays / Run: ${JSON.stringify(body.gameData.notablePlays?.slice(-12) || [])}

Write a deeply human, captivating, dramatic, and authentic sports journalism game story recapping this match. Mention specific players by name, jersey, and their real box score contributions (scoring runs, rim protection, clutch three-pointers, defensive stops). Detail how the game swung back and forth, how the fourth quarter was won, and in the conclusion describe what both teams face in their next upcoming schedule games. Do not use generic repetitive boilerplate.
CRITICAL FORMATTING INSTRUCTIONS FOR analysisMarkdown:
- Write in clean, newspaper AP sports journalism prose.
- Do NOT output raw markdown asterisks (like ***, **, or *) and do NOT use raw hash headers (like ### or ##) in the body of analysisMarkdown. Instead, write natural, flowing journalistic paragraphs with standard capitalization, punctuation, and clear paragraph breaks (\n\n).
- If listing recent tournament games or upcoming matchups, write them as clean bullet lines (e.g. • Game #2: Team A 45 - Team B 40) or natural prose.

Respond strictly in valid JSON matching this schema:
{
  "recommendedFormatId": "MULTI_STAGE",
  "recommendedPoolsCount": 2,
  "recommendedSeriesBestOf": 3,
  "recommendedStepladderVariant": "PAGE_MCINTYRE_TOP4",
  "headline": "PUNCHY AP-STYLE HEADLINE IN UPPERCASE",
  "analysisMarkdown": "Rich multi-paragraph Markdown sports news article recap",
  "scheduleTips": [
    "Key takeaway 1 about winning team's execution",
    "Key takeaway 2 about losing team's adjustments",
    "Tournament impact / playoff outlook"
  ]
}`;
    } else {
      systemPrompt = `You are the Gemini AI Basketball Tournament Commissioner & Bracketing Architect for the Box Score platform.
League: "${body.leagueName}"
Rulebook: ${body.ruleSetId}
Dates: ${body.startDate} to ${body.endDate}
Courts: ${(body.courts || []).join(", ") || "Main Court"}
Registered Teams (${body.teamNames.length}): ${body.teamNames.join(", ")}
Current Bracketing Format: ${body.currentFormatId}
User Request / Action: ${body.customPrompt || body.action}

The 6 supported Bracketing Format IDs are:
1. SINGLE_ELIMINATION (Single-Elimination Knockout Bracket - "Win or go home")
2. DOUBLE_ELIMINATION (Double-Elimination - Winners' Bracket + Losers' Consolation Bracket)
3. ROUND_ROBIN (Round-Robin Pool Play / Group Stage - Bracket A, Bracket B standings)
4. MULTI_STAGE (Multi-Stage Hybrid Pool-to-Knockout - Pool Play -> Quarterfinals -> Semifinals -> Finals)
5. SERIES_PLAYOFF (Series Playoff Bracket - Best-of-3, Best-of-5, or Best-of-7)
6. PAGE_MCINTYRE (Page-McIntyre Top-4 or Stepladder Climb Bracket)

Respond strictly in valid JSON with the following keys:
{
  "recommendedFormatId": "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "MULTI_STAGE" | "SERIES_PLAYOFF" | "PAGE_MCINTYRE",
  "recommendedPoolsCount": 1 | 2 | 4,
  "recommendedSeriesBestOf": 3 | 5 | 7,
  "recommendedStepladderVariant": "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB",
  "headline": "Short authoritative headline",
  "analysisMarkdown": "Concise 2-4 sentence markdown recommendation tailored to the exact teams, courts, and dates",
  "scheduleTips": ["Tip 1", "Tip 2", "Tip 3"]
}`;
    }

    const endpoints = [
      `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(DEFAULT_GEMINI_KEY)}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(DEFAULT_GEMINI_KEY)}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawText: string =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (rawText) {
            const cleaned = rawText
              .replace(/^```json\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            const parsed = JSON.parse(cleaned);
            return NextResponse.json({
              recommendedFormatId:
                parsed.recommendedFormatId || baseFallback.recommendedFormatId,
              recommendedPoolsCount:
                parsed.recommendedPoolsCount ||
                baseFallback.recommendedPoolsCount,
              recommendedSeriesBestOf:
                parsed.recommendedSeriesBestOf ||
                baseFallback.recommendedSeriesBestOf,
              recommendedStepladderVariant:
                parsed.recommendedStepladderVariant ||
                baseFallback.recommendedStepladderVariant,
              headline: parsed.headline || baseFallback.headline,
              analysisMarkdown:
                parsed.analysisMarkdown || baseFallback.analysisMarkdown,
              scheduleTips: Array.isArray(parsed.scheduleTips)
                ? parsed.scheduleTips
                : baseFallback.scheduleTips,
              source: "gemini-live",
            } satisfies GeminiTournamentResponse);
          }
        }
      } catch {
        // Try next endpoint or fallback
      }
    }

    return NextResponse.json(baseFallback);
  } catch {
    return NextResponse.json(
      computeDeterministicRecommendation({
        action: "recommend_format",
        leagueName: "Basketball League",
        ruleSetId: "FIBA",
        startDate: "",
        endDate: "",
        courts: [],
        teamNames: [],
        currentFormatId: "MULTI_STAGE",
      })
    );
  }
}
