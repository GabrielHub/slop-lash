import { generateText, createGateway } from "ai";
import { prisma } from "@/lib/db";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { extractUsage, escapeXml, getLowReasoningProviderOptions } from "./ai";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

/* ─── Rate-limit state (best-effort in-process; does not coordinate across Vercel instances) ─── */

/** Per-AI cooldown: maps `${gameId}:${playerId}` to last reply timestamp */
const aiCooldowns = new Map<string, number>();
/** Global cap: maps `gameId` to total AI chat message count */
const aiChatCounts = new Map<string, number>();

const COOLDOWN_MS = 15_000;
const MAX_AI_CHAT_MESSAGES_PER_GAME = 30;

const ALLOWED_PHASES = new Set(["WRITING", "VOTING", "ROUND_RESULTS"]);

/* ─── Detection ─── */

interface AiPlayerInfo {
  id: string;
  name: string;
  modelId: string;
}

export function detectMentionedAiPlayers(content: string, aiPlayers: AiPlayerInfo[]): AiPlayerInfo[] {
  const lower = content.toLowerCase();
  return aiPlayers.filter((p) => lower.includes(p.name.toLowerCase()));
}

/* ─── System prompt ─── */

const REPLY_SYSTEM_PROMPT = `You are an AI contestant in ChatSlop, a live comedy game show. Someone just mentioned you in the chat. Fire back with a short, snarky, playful reply. Stay in character as a competitive comedian.
Rules:
- Keep reply under 150 characters
- Be witty, snarky, or playful — not mean
- Reference the game context if relevant (scores, standings)
- No preamble, no quotes — just the reply text`;

/* ─── Cooldown check ─── */

async function findAvailableReplier(
  gameId: string,
  mentioned: AiPlayerInfo[],
  aiPlayerIds: string[],
): Promise<{ replier: AiPlayerInfo; currentCount: number } | null> {
  const memoryCount = aiChatCounts.get(gameId) ?? 0;
  if (memoryCount >= MAX_AI_CHAT_MESSAGES_PER_GAME) return null;

  // Cross-instance guardrails: enforce limits from persisted chat history, not only process memory.
  const [dbAiReplyCount, recentlyReplied] = await Promise.all([
    prisma.chatMessage.count({
      where: {
        gameId,
        playerId: { in: aiPlayerIds },
        replyToId: { not: null },
      },
    }),
    prisma.chatMessage.findMany({
      where: {
        gameId,
        playerId: { in: mentioned.map((p) => p.id) },
        createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
  ]);

  if (dbAiReplyCount >= MAX_AI_CHAT_MESSAGES_PER_GAME) return null;

  const recentlyRepliedIds = new Set(recentlyReplied.map((m) => m.playerId));
  const now = Date.now();
  for (const ai of mentioned) {
    if (recentlyRepliedIds.has(ai.id)) continue;

    const key = `${gameId}:${ai.id}`;
    const lastReply = aiCooldowns.get(key) ?? 0;
    if (now - lastReply >= COOLDOWN_MS) {
      aiCooldowns.set(key, now);
      return {
        replier: ai,
        currentCount: Math.max(memoryCount, dbAiReplyCount),
      };
    }
  }
  return null;
}

/* ─── Main entry point ─── */

export async function generateAiChatReply(
  gameId: string,
  triggerMessageId: string,
  content: string,
): Promise<void> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        status: true,
        currentRound: true,
        totalRounds: true,
        players: {
          select: { id: true, name: true, type: true, modelId: true, score: true },
        },
      },
    });

    if (!game || !ALLOWED_PHASES.has(game.status)) return;

    const aiPlayers: AiPlayerInfo[] = game.players
      .filter((p): p is typeof p & { modelId: string } => p.type === "AI" && p.modelId !== null)
      .map((p) => ({ id: p.id, name: p.name, modelId: p.modelId }));

    const mentioned = detectMentionedAiPlayers(content, aiPlayers);
    if (mentioned.length === 0) return;

    const available = await findAvailableReplier(
      gameId,
      mentioned,
      aiPlayers.map((p) => p.id),
    );
    if (!available) return;
    const { replier, currentCount } = available;

    // Fetch recent chat context
    const recentMessages = await prisma.chatMessage.findMany({
      where: { gameId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { playerId: true, content: true },
    });

    const playerMap = new Map(game.players.map((p) => [p.id, p]));

    const scoreboard = game.players
      .filter((p) => p.type !== "SPECTATOR")
      .sort((a, b) => b.score - a.score)
      .map((p) => `<p name="${escapeXml(p.name)}" score="${p.score}" type="${p.type}"/>`)
      .join("\n");

    const chatContext = [...recentMessages].reverse()
      .map((m) => {
        const name = playerMap.get(m.playerId)?.name ?? "Unknown";
        return `<msg from="${escapeXml(name)}">${escapeXml(m.content)}</msg>`;
      })
      .join("\n");

    const prompt = `<identity>You are ${escapeXml(replier.name)}</identity>
<game status="${game.status}" round="${game.currentRound}/${game.totalRounds}"/>
<scoreboard>
${scoreboard}
</scoreboard>
<chat>
${chatContext}
</chat>
<trigger>${escapeXml(content)}</trigger>`;

    const result = await generateText({
      model: gateway(replier.modelId),
      system: REPLY_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 60,
      providerOptions: getLowReasoningProviderOptions(replier.modelId),
    });

    const replyText = result.text.trim().replace(/^["']|["']$/g, "");
    if (!replyText) return;

    await prisma.chatMessage.create({
      data: {
        gameId,
        playerId: replier.id,
        roundNumber: game.currentRound > 0 ? game.currentRound : null,
        content: replyText.slice(0, 200),
        replyToId: triggerMessageId,
      },
    });

    // Only count after successful DB write
    aiChatCounts.set(gameId, currentCount + 1);

    const usage = extractUsage(replier.modelId, result.usage);
    await accumulateUsage(gameId, [usage]);

    console.log(`[chatslop:aiChatReply] ${replier.name} replied to "${content.slice(0, 40)}" → "${replyText.slice(0, 60)}"`);
  } catch (err) {
    // Let cooldown stand on transient failures to prevent retry storms during gateway outages.
    console.error(`[chatslop:aiChatReply] Failed:`, err);
  }
}
