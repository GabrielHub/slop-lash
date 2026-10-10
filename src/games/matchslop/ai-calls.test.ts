import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { aiVote, shuffleCandidates } from "./ai-voting";
import {
  generatePersona,
  replySourceOf,
  writeBotLine,
  writePersonaReply,
  writePostMortem,
  type ReplyInput,
} from "./ai-calls";
import { MATCHSLOP_PERSONA_EXAMPLES } from "./config/persona-examples";
import { MATCHSLOP_PROMPT_VERSION } from "./prompts";
import { levelConsequences, resolveTurn } from "./rules";
import { MATCHSLOP_LEVELS, type MatchSlopProfile } from "./types";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Finish = GenerateResult["finishReason"]["unified"];

const HAIKU = "anthropic/claude-haiku-5.5";
const KEYS = { anthropic: "test-anthropic-key", gateway: "test-gateway-key" };

function result(text: string, finish: Finish = "stop"): GenerateResult {
  return {
    content: text ? [{ type: "text", text }] : [],
    finishReason: { unified: finish, raw: finish },
    usage: {
      inputTokens: { total: 900, noCache: 100, cacheRead: 700, cacheWrite: 100 },
      outputTokens: { total: 40, text: 40, reasoning: 0 },
    },
    warnings: [],
  };
}

const mock = (...results: GenerateResult[]) =>
  new MockLanguageModelV4({ doGenerate: results.length === 1 ? results[0] : results });

const PROFILE: MatchSlopProfile = {
  displayName: "Nora",
  backstory: null,
  appearance: null,
  age: 29,
  location: null,
  bio: "Tarot and anchovies.",
  tagline: null,
  prompts: [
    { id: "p1", prompt: "Typical Sunday", answer: "Farmer's market" },
    { id: "p2", prompt: "We'll get along if", answer: "you like tarot" },
  ],
  details: null,
};

function replyInput(overrides: Partial<ReplyInput["state"]> = {}): ReplyInput {
  const state = { mood: 60, round: 2, totalRounds: 5, comeback: false, ...overrides };
  return {
    seekerIdentity: "MAN",
    personaIdentity: "WOMAN",
    profile: PROFILE,
    textingStyle: "lowercase",
    modelId: HAIKU,
    deadline: null,
    transcript: [
      { speaker: "PLAYERS", text: "hi", authorName: null, level: null, openerPromptText: "Typical Sunday" },
      { speaker: "PERSONA", text: "hey", authorName: null, level: "meh", openerPromptText: null },
      { speaker: "PLAYERS", text: "a joke", authorName: null, level: null, openerPromptText: null },
    ],
    state,
    consequences: levelConsequences(state),
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("persona reply", () => {
  it("returns the judged level for every level, recorded at the reply prompt version", async () => {
    for (const level of MATCHSLOP_LEVELS) {
      const model = mock(result(JSON.stringify({ level, reply: "  sure  ", thought: " hm " })));
      const reply = await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
      expect(reply.output).toEqual({ source: "model", level, text: "sure", thought: "hm" });
      expect(reply.failReason).toBeNull();
      expect(reply.calls).toHaveLength(1);
      expect(reply.calls[0]).toMatchObject({
        task: "matchslop.reply",
        promptVersion: MATCHSLOP_PROMPT_VERSION.reply,
        ok: true,
      });
      expect(reply.calls[0]!.usage.cacheReadTokens).toBe(700);
    }
  });

  it("sends stable instructions, alternating turns and the state in the last user turn", async () => {
    const model = mock(result(JSON.stringify({ level: "good", reply: "ok", thought: null })));
    await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
    const prompt = model.doGenerateCalls[0]!.prompt;
    expect(prompt.map((message) => message.role)).toEqual([
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
    // Anthropic-direct: the static and per-game blocks and the previous turn are cache breakpoints.
    expect(prompt[0]!.providerOptions?.anthropic).toMatchObject({ cacheControl: { type: "ephemeral" } });
    expect(prompt[1]!.providerOptions?.anthropic).toMatchObject({ cacheControl: { type: "ephemeral" } });
    expect(prompt[3]!.providerOptions?.anthropic).toMatchObject({ cacheControl: { type: "ephemeral" } });
    expect(JSON.stringify(prompt[4]!.content)).toContain("<consequences>");
    expect(model.doGenerateCalls[0]!.reasoning).toBe("minimal");
  });

  it("a refusal is declined and never scores", async () => {
    const model = mock(result("", "content-filter"));
    const reply = await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
    expect(reply.output).toEqual({ source: "declined", level: null, text: null, thought: null });
    expect(reply.failReason).toBe("refused");
    expect(resolveTurn({ mood: 60, level: reply.output.level, round: 2, totalRounds: 5, comeback: false }))
      .toMatchObject({ mood: 60, points: 0 });
  });

  it("decodes entities the model echoed back from escaped player text", async () => {
    const model = mock(
      result(JSON.stringify({ level: "cute", reply: "&lt;3 &amp; stuff", thought: "you &gt; him" })),
    );
    const reply = await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
    expect(reply.output).toMatchObject({ source: "model", text: "<3 & stuff", thought: "you > him" });
  });

  it("a blank reply is a recorded failure: canned, unscored, invalid-output", async () => {
    const model = mock(result(JSON.stringify({ level: "good", reply: "   ", thought: null })));
    const reply = await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
    expect(reply.output).toEqual({ source: "fallback", level: null, text: null, thought: null });
    expect(reply.failReason).toBe("invalid-output");
  });

  it("any other failure falls back and never scores", async () => {
    const model = mock(result('{"level":"amazing","reply":"x"}'));
    const reply = await writePersonaReply(replyInput(), { keys: KEYS, languageModel: model });
    expect(reply.output).toEqual({ source: "fallback", level: null, text: null, thought: null });
    expect(reply.failReason).toBe("invalid-output");
    expect(replySourceOf("timeout")).toBe("fallback");
    expect(replySourceOf("provider-error")).toBe("fallback");
    expect(replySourceOf("refused")).toBe("declined");
  });
});

describe("AI votes", () => {
  const responses = [
    { id: "r1", text: "first" },
    { id: "r2", text: "second" },
    { id: "r3", text: "third" },
  ];

  it("shuffles labels per voter and maps the pick back to the line", async () => {
    const orders = new Set(
      ["voter-1", "voter-2", "voter-3", "voter-4", "voter-5"].map((seed) =>
        shuffleCandidates(responses, seed)
          .map((candidate) => candidate.id)
          .join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);

    const seedKey = "game:2:voter-1";
    const labelled = shuffleCandidates(responses, seedKey);
    expect(shuffleCandidates(responses, seedKey)).toEqual(labelled);
    const model = mock(result(JSON.stringify({ result: "B" })));
    const vote = await aiVote(
      { modelId: HAIKU, context: "<context></context>", seedKey, responses, deadline: null },
      { keys: KEYS, languageModel: model },
    );
    expect(vote).toMatchObject({ responseId: labelled[1]!.id, failed: false, failReason: null });
    expect(vote.calls[0]).toMatchObject({ task: "matchslop.vote", ok: true });

    // The candidates are presented under their shuffled labels.
    const userTurn = JSON.stringify(model.doGenerateCalls[0]!.prompt.at(-1)!.content);
    expect(userTurn).toContain(`<candidate-A>${labelled[0]!.text}</candidate-A>`);
    expect(userTurn).toContain(`<candidate-B>${labelled[1]!.text}</candidate-B>`);
    expect(model.doGenerateCalls[0]!.reasoning).toBe("none");
  });

  it("keeps one choice schema whatever the candidate count, and rejects a label not on the ballot", async () => {
    const formats = [];
    for (const count of [2, 3]) {
      const model = mock(result(JSON.stringify({ result: "A" })));
      await aiVote(
        { modelId: HAIKU, context: "", seedKey: "x", responses: responses.slice(0, count), deadline: null },
        { keys: KEYS, languageModel: model },
      );
      formats.push(JSON.stringify(model.doGenerateCalls[0]!.responseFormat));
    }
    expect(formats[0]).toContain('"H"');
    expect(formats[0]).toBe(formats[1]);

    const model = mock(result(JSON.stringify({ result: "H" })));
    const vote = await aiVote(
      { modelId: HAIKU, context: "", seedKey: "x", responses, deadline: null },
      { keys: KEYS, languageModel: model },
    );
    expect(vote).toMatchObject({ responseId: null, failed: true, failReason: "invalid-output" });
  });

  it("a failed vote abstains instead of picking one", async () => {
    const model = mock(result("I like the second one best"));
    const vote = await aiVote(
      { modelId: HAIKU, context: "<context></context>", seedKey: "x", responses, deadline: null },
      { keys: KEYS, languageModel: model },
    );
    expect(vote).toMatchObject({ responseId: null, failed: true, failReason: "invalid-output" });
  });

  it("a voter with one eligible line picks it without a call", async () => {
    const vote = await aiVote(
      { modelId: HAIKU, context: "", seedKey: "x", responses: [responses[0]!], deadline: null },
      { keys: KEYS },
    );
    expect(vote).toEqual({ responseId: "r1", failed: false, failReason: null, calls: [] });
  });
});

describe("profile, bot lines and post-mortem", () => {
  const seed = MATCHSLOP_PERSONA_EXAMPLES[0]!;

  it("writes the profile and the portrait prompt in one call", async () => {
    const model = mock(
      result(
        JSON.stringify({
          displayName: " Ines ",
          age: 41,
          location: "Silver Lake",
          appearance: "short hair",
          backstory: "A sound engineer.",
          textingStyle: "all caps when excited",
          bio: "Records birds.",
          tagline: null,
          prompts: [
            { prompt: "Typical Sunday", answer: "Birds" },
            { prompt: "Green flag", answer: "Quiet" },
            { prompt: "Red flag", answer: "Loud" },
            { prompt: "Extra", answer: "Dropped" },
          ],
          details: { job: "Engineer", school: null, height: null, languages: ["English"] },
          imagePrompt: "Portrait of a woman with short hair",
        }),
      ),
    );
    const persona = await generatePersona(
      { modelId: HAIKU, seekerIdentity: "MAN", personaIdentity: "WOMAN", seed },
      { keys: KEYS, languageModel: model },
    );
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(persona.output).toMatchObject({
      profile: { displayName: "Ines", age: 30, location: "Silver Lake" },
      textingStyle: "all caps when excited",
      imagePrompt: "Portrait of a woman with short hair",
    });
    expect(persona.output!.profile.prompts.map((prompt) => prompt.id)).toEqual(["p1", "p2", "p3"]);
  });

  const botInput = (opener: boolean) => ({
    modelId: HAIKU,
    deadline: null,
    opener,
    profile: PROFILE,
    examples: ["ex"],
    context: "<context></context>",
  });

  it("bot openers pick a real profile prompt by slot key", async () => {
    const model = mock(result(JSON.stringify({ promptId: "P2", line: " i also like tarot " })));
    const line = await writeBotLine(botInput(true), { keys: KEYS, languageModel: model });
    expect(line.output).toEqual({ text: "i also like tarot", openerPromptId: "p2" });
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain('id=\\"P2\\"');

    for (const promptId of ["__photo__", "P3", null]) {
      const invalid = mock(result(JSON.stringify({ promptId, line: "nice pic" })));
      const refused = await writeBotLine(botInput(true), { keys: KEYS, languageModel: invalid });
      expect(refused).toMatchObject({ output: null, failReason: "invalid-output" });
    }
  });

  it("bot lines share one schema across rounds, decode entities, and fail when blank", async () => {
    const opener = mock(result(JSON.stringify({ promptId: "P1", line: "hi" })));
    await writeBotLine(botInput(true), { keys: KEYS, languageModel: opener });
    const followUp = mock(result(JSON.stringify({ promptId: null, line: "&lt;3 you &amp; me" })));
    const line = await writeBotLine(botInput(false), { keys: KEYS, languageModel: followUp });
    expect(line.output).toEqual({ text: "<3 you & me", openerPromptId: null });
    expect(JSON.stringify(opener.doGenerateCalls[0]!.responseFormat)).toContain('"P3"');
    expect(JSON.stringify(opener.doGenerateCalls[0]!.responseFormat)).toBe(
      JSON.stringify(followUp.doGenerateCalls[0]!.responseFormat),
    );

    const blank = mock(result(JSON.stringify({ promptId: null, line: "  " })));
    const failed = await writeBotLine(botInput(false), { keys: KEYS, languageModel: blank });
    expect(failed).toMatchObject({ output: null, failReason: "invalid-output" });
  });

  it("post-mortem names must be players in the room", async () => {
    const input = {
      seekerIdentity: "MAN" as const,
      personaIdentity: "WOMAN" as const,
      profile: PROFILE,
      textingStyle: "lowercase",
      modelId: HAIKU,
      deadline: null,
      verdict: "DATE" as const,
      players: [
        { name: "Amy", wrote: 3, sent: 2 },
        { name: "Gabe", wrote: 3, sent: 1 },
      ],
      transcript: [],
    };
    const good = await writePostMortem(input, {
      keys: KEYS,
      languageModel: mock(
        result(
          JSON.stringify({ verdicts: [{ player: "N2", verdict: "fun &amp; fast" }], parting: "bye &lt;3" }),
        ),
      ),
    });
    expect(good.output).toEqual({
      verdicts: [{ playerName: "Gabe", verdict: "fun & fast" }],
      parting: "bye <3",
    });

    const pastTheRoom = await writePostMortem(input, {
      keys: KEYS,
      languageModel: mock(
        result(JSON.stringify({ verdicts: [{ player: "N3", verdict: "who" }], parting: "bye" })),
      ),
    });
    expect(pastTheRoom).toMatchObject({ output: null, failReason: "invalid-output" });

    const invented = await writePostMortem(input, {
      keys: KEYS,
      languageModel: mock(
        result(JSON.stringify({ verdicts: [{ player: "Zed", verdict: "who" }], parting: "bye" })),
      ),
    });
    expect(invented).toMatchObject({ output: null, failReason: "invalid-output" });
  });
});
