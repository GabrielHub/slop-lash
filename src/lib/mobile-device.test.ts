import { describe, expect, test } from "vite-plus/test";
import { isMobileDevice } from "./mobile-device";

describe("mobile device detection", () => {
  test("uses the browser's mobile client hint when available", () => {
    expect(
      isMobileDevice({
        maxTouchPoints: 0,
        platform: "Windows",
        userAgent: "desktop browser",
        userAgentData: { mobile: true },
      }),
    ).toBe(true);
    expect(
      isMobileDevice({
        maxTouchPoints: 5,
        platform: "Android",
        userAgent: "Android mobile browser",
        userAgentData: { mobile: false },
      }),
    ).toBe(false);
  });

  test.each([
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5],
    ["Android tablet", "Mozilla/5.0 (Linux; Android 15; Pixel Tablet)", "Linux armv8l", 5],
    ["iPad desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", "MacIntel", 5],
  ])("detects %s without client hints", (_label, userAgent, platform, maxTouchPoints) => {
    expect(isMobileDevice({ maxTouchPoints, platform, userAgent })).toBe(true);
  });

  test("leaves desktop devices out of controller mode", () => {
    expect(
      isMobileDevice({
        maxTouchPoints: 0,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      }),
    ).toBe(false);
  });
});
