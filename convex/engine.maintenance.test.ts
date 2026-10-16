// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { roomPresence } from "./components";
import { setup, view, type Backend } from "./test.harness";

const TAB = "0123456789abcdef0123";

async function createRoom(t: Backend, displayHost = false) {
  return t.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostSecret: "secret",
    ...(displayHost ? {} : { hostName: "Host" }),
    timersDisabled: true,
  });
}

async function beat(t: Backend, capability: string, tabId = TAB) {
  return t.mutation(api.presence.heartbeat, { capability, tabId, interval: 5_000 });
}

async function maintenance(t: Backend, gameId: Id<"games">) {
  return t.run((ctx) =>
    ctx.db
      .query("roomMaintenance")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .unique(),
  );
}

async function pendingEngineJobs(t: Backend) {
  return t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").take(100)).filter(
      (job) => job.name.startsWith("engine:") && job.state.kind === "pending",
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("HOST_SECRET", "secret");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("occupied-room maintenance", () => {
  test("throttles all room tabs together without writing the subscribed game or scheduling jobs", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const id = (await view(t, host.capability)).room.id;
    const original = await t.run((ctx) => ctx.db.get("games", id));
    const startedAt = Date.now();

    await beat(t, host.capability);
    await beat(t, ana.capability, "1123456789abcdef0123");
    const first = await maintenance(t, id);
    vi.setSystemTime(startedAt + 5_000);
    await beat(t, ana.capability, "1123456789abcdef0123");
    await beat(t, host.capability);
    expect(await maintenance(t, id)).toEqual(first);

    vi.setSystemTime(startedAt + 15_000);
    await beat(t, host.capability);
    expect(await maintenance(t, id)).toMatchObject({ checkedAt: startedAt + 15_000 });
    expect(await t.run((ctx) => ctx.db.get("games", id))).toEqual(original);
    expect(await pendingEngineJobs(t)).toEqual([]);
  });

  test("a remaining player's heartbeats transfer host controls after the away grace", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const startedAt = Date.now();
    const hostTab = await beat(t, host.capability);
    await beat(t, ana.capability, "1123456789abcdef0123");
    await t.mutation(api.presence.disconnect, { sessionToken: hostTab.sessionToken });

    vi.setSystemTime(startedAt + 29_000);
    await beat(t, ana.capability, "1123456789abcdef0123");
    expect((await view(t, ana.capability)).me?.isHost).toBe(false);
    vi.setSystemTime(startedAt + 44_000);
    await beat(t, ana.capability, "1123456789abcdef0123");
    expect((await view(t, ana.capability)).me?.isHost).toBe(true);
    // The creating capability retains its powers when its tab returns.
    await beat(t, host.capability);
    expect((await view(t, host.capability)).me?.isHost).toBe(true);
  });

  test("failed housekeeping does not roll back a successful presence heartbeat", async () => {
    const t = setup();
    const host = await createRoom(t);
    await beat(t, host.capability);
    vi.setSystemTime(Date.now() + 15_000);
    const failure = new Error("room roster temporarily unavailable");
    const list = vi.spyOn(roomPresence, "listRoom").mockRejectedValueOnce(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await beat(t, host.capability);
    expect(result.sessionToken).toBeTruthy();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat maintenance failed"),
      failure,
    );
    list.mockRestore();
    const current = await view(t, host.capability);
    expect(current.players.find((player) => player.id === host.playerId)?.online).toBe(true);
  });

  test("a heartbeat releases a phase waiting only on a disconnected player", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await beat(t, host.capability);
    await beat(t, ana.capability, "1123456789abcdef0123");
    const boTab = await beat(t, bo.capability, "2123456789abcdef0123");
    await t.mutation(api.engine.start, { capability: host.capability });
    for (const capability of [host.capability, ana.capability]) {
      const { mode } = await view(t, capability);
      if (mode.kind !== "SLOPLASH" || !mode.writing) throw new Error("not writing");
      for (const prompt of mode.writing.prompts) {
        await t.mutation(api.sloplash.play.submitResponse, {
          capability,
          promptId: prompt.id,
          text: "A completed answer",
        });
      }
    }
    expect((await view(t, host.capability)).room.phase).toBe("WRITING");
    await t.mutation(api.presence.disconnect, { sessionToken: boTab.sessionToken });
    vi.setSystemTime(Date.now() + 16_000);
    await beat(t, host.capability);
    expect((await view(t, host.capability)).room.phase).not.toBe("WRITING");
  });

  test.each([
    { awayMs: 20_000, displayHost: false, voterReturns: true },
    { awayMs: 20_000, displayHost: false, voterReturns: false },
    { awayMs: 60_000, displayHost: false, voterReturns: true },
    { awayMs: 60_000, displayHost: false, voterReturns: false },
    { awayMs: 20_000, displayHost: true, voterReturns: true },
    { awayMs: 20_000, displayHost: true, voterReturns: false },
  ])(
    "a returning party gets grace: away=$awayMs, display host=$displayHost, voter returns=$voterReturns",
    async ({ awayMs, displayHost, voterReturns }) => {
      const t = setup();
      const host = await createRoom(t, displayHost);
      const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
      const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
      const third = displayHost
        ? await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Cy" })
        : host;
      const seats = [third, ana, bo];
      if (displayHost) await beat(t, host.capability);
      const tabs = [];
      for (const [index, seat] of seats.entries()) {
        tabs.push(await beat(t, seat.capability, String(index).padStart(16, "0")));
      }
      await t.mutation(api.engine.start, { capability: host.capability });
      for (const seat of seats) {
        const { mode } = await view(t, seat.capability);
        if (mode.kind !== "SLOPLASH" || !mode.writing) throw new Error("not writing");
        for (const prompt of mode.writing.prompts) {
          await t.mutation(api.sloplash.play.submitResponse, {
            capability: seat.capability,
            promptId: prompt.id,
            text: "A completed answer",
          });
        }
      }
      const current = await view(t, host.capability);
      const sloplash = current.mode;
      if (sloplash.kind !== "SLOPLASH") throw new Error("wrong mode");
      const prompt = sloplash.round!.prompts.find((item) => item.id === sloplash.currentPromptId)!;
      const author = seats.find((seat) => prompt.assigneeIds.includes(seat.playerId!))!;
      const voter = seats.find((seat) => !prompt.assigneeIds.includes(seat.playerId!))!;
      for (const tab of tabs) {
        await t.mutation(api.presence.disconnect, { sessionToken: tab.sessionToken });
      }

      const leftAt = Date.now();
      if (displayHost) {
        vi.setSystemTime(leftAt + 15_000);
        await beat(t, host.capability);
        expect((await view(t, host.capability)).room.phase).toBe("VOTING");
      }
      vi.setSystemTime(leftAt + awayMs);
      await beat(t, author.capability, "3123456789abcdef0123");
      expect((await view(t, author.capability)).room.phase).toBe("VOTING");
      expect((await maintenance(t, current.room.id))?.checkedAt).toBe(Date.now());
      if (voterReturns) {
        vi.setSystemTime(Date.now() + 5_000);
        await beat(t, voter.capability, "1123456789abcdef0123");
        await t.mutation(api.sloplash.play.castVote, {
          capability: voter.capability,
          promptId: prompt.id,
          responseId: prompt.answers[0]!.id,
        });
      } else {
        if (displayHost) {
          vi.setSystemTime(leftAt + awayMs + 14_000);
          await beat(t, host.capability);
          expect((await view(t, author.capability)).room.phase).toBe("VOTING");
        }
        vi.setSystemTime(leftAt + awayMs + 15_000);
        await beat(t, author.capability, "3123456789abcdef0123");
      }
      expect((await view(t, author.capability)).room.phase).toBe("REVEAL");
    },
  );

  test("departure leaves no maintenance chain; returning resumes and cleanup removes the throttle", async () => {
    const t = setup();
    const host = await createRoom(t);
    const id = (await view(t, host.capability)).room.id;
    const hostTab = await beat(t, host.capability);
    const first = await maintenance(t, id);
    await t.mutation(api.presence.disconnect, { sessionToken: hostTab.sessionToken });
    vi.setSystemTime(Date.now() + 60 * 60_000);
    await t.mutation(internal.engine.sweep, {});
    expect(await pendingEngineJobs(t)).toEqual([]);
    expect(await maintenance(t, id)).toEqual(first);

    await beat(t, host.capability);
    expect((await maintenance(t, id))?.checkedAt).toBe(Date.now());
    await t.mutation(internal.cleanup.deleteGame, { gameId: id });
    expect(await maintenance(t, id)).toBeNull();
  });

  test("the safety sweep only schedules overdue deadlines, excluding idle and finished rooms", async () => {
    const t = setup();
    const host = await createRoom(t);
    const id = (await view(t, host.capability)).room.id;
    const overdueId = await t.run(async (ctx) => {
      const original = (await ctx.db.get("games", id))!;
      const { _id: _gameId, _creationTime: _createdAt, ...fields } = original;
      const now = Date.now();
      await ctx.db.insert("games", { ...fields, roomCode: "NODL", status: "PLAYING" });
      await ctx.db.insert("games", {
        ...fields,
        roomCode: "WAIT",
        status: "PLAYING",
        phaseDeadline: now + 60_000,
      });
      await ctx.db.insert("games", {
        ...fields,
        roomCode: "DONE",
        status: "FINISHED",
        finishedAt: now,
      });
      return ctx.db.insert("games", {
        ...fields,
        roomCode: "LATE",
        status: "PLAYING",
        phaseDeadline: now - 11_000,
      });
    });

    await t.mutation(internal.engine.sweep, {});
    const jobs = await pendingEngineJobs(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: "engine:tick",
      args: [{ gameId: overdueId, phaseGeneration: 0 }],
    });
  });
});
