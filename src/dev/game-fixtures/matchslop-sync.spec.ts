import { expect, test, type Page, type TestInfo } from "@playwright/test";

type DebugSnapshot = {
  actionLog: string[];
  clientLabel: string;
  currentRound: number;
  lastAction: string | null;
  outcome: string | null;
  phaseDeadline: string | null;
  revision: number;
  scenarioSlug: string;
  status: string;
  totalRounds: number;
  updatedAt: string;
  version: number;
  votingPromptIndex: number;
  votingRevealing: boolean;
};

async function readDebugSnapshot(page: Page): Promise<DebugSnapshot> {
  const debugJson = page.getByTestId("mock-matchslop-debug-json");
  await expect(debugJson).toBeVisible();
  const text = await debugJson.textContent();
  if (!text) {
    throw new Error(`Missing debug payload for ${page.url()}`);
  }

  return JSON.parse(text) as DebugSnapshot;
}

async function attachDebugSnapshot(
  testInfo: TestInfo,
  page: Page,
  label: string,
) {
  const snapshot = await readDebugSnapshot(page);
  await testInfo.attach(`${label}-debug.json`, {
    body: Buffer.from(JSON.stringify(snapshot, null, 2)),
    contentType: "application/json",
  });
}

async function waitForStatus(page: Page, label: string, status: DebugSnapshot["status"]) {
  await expect
    .poll(async () => {
      const snapshot = await readDebugSnapshot(page);
      return snapshot.status;
    }, {
      message: `${label} did not reach ${status}`,
      timeout: 10_000,
    })
    .toBe(status);
}

test("MatchSlop dev fixture advances and ends in sync across tabs", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const stageA = await context.newPage();
  const stageB = await context.newPage();
  const controller = await context.newPage();
  await controller.addInitScript(() => {
    window.confirm = () => true;
  });
  const pages: Array<[string, Page]> = [
    ["stage-a", stageA],
    ["stage-b", stageB],
    ["host-controller", controller],
  ];

  try {
    await Promise.all([
      stageA.goto("/dev/ui/matchslop-results?client=stage-a"),
      stageB.goto("/dev/ui/matchslop-results?client=stage-b"),
      controller.goto("/dev/ui/matchslop-results/controller?client=host-controller"),
    ]);

    await Promise.all(pages.map(([label, page]) => waitForStatus(page, label, "ROUND_RESULTS")));
    await Promise.all(pages.map(([label, page]) => attachDebugSnapshot(testInfo, page, `${label}-initial`)));

    await expect(controller.getByRole("button", { name: "Next Round" })).toBeVisible();
    await controller.getByRole("button", { name: "Next Round" }).click();

    await Promise.all(pages.map(([label, page]) => waitForStatus(page, label, "WRITING")));
    await Promise.all(pages.map(([label, page]) => attachDebugSnapshot(testInfo, page, `${label}-after-next`)));

    await expect(controller.getByRole("button", { name: "End Game" })).toBeVisible();
    await controller.getByRole("button", { name: "End Game" }).click();

    await Promise.all(pages.map(([label, page]) => waitForStatus(page, label, "FINAL_RESULTS")));
    await Promise.all(pages.map(([label, page]) => attachDebugSnapshot(testInfo, page, `${label}-after-end`)));

    for (const [label, page] of pages) {
      const snapshot = await readDebugSnapshot(page);
      expect(snapshot.lastAction, `${label} should record the final host action`).toBe("end");
      expect(snapshot.outcome, `${label} should match production's early-end outcome`).toBe(
        "TURN_LIMIT",
      );
      expect(snapshot.revision, `${label} should have seen at least two shared updates`).toBeGreaterThanOrEqual(2);
    }
  } catch (error) {
    await Promise.all(
      pages.map(([label, page]) =>
        attachDebugSnapshot(testInfo, page, `${label}-failure`).catch(() => undefined),
      ),
    );
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
});
