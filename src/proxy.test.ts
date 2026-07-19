import { NextRequest } from "next/server";
import { describe, expect, test } from "vite-plus/test";
import { proxy } from "./proxy";

describe("room bot proxy", () => {
  test.each(["game", "controller", "stage"])(
    "rewrites an exact %s room route to its lightweight invite page",
    (route: string) => {
      const response = proxy(
        new NextRequest(`https://example.com/${route}/ABC234`, {
          headers: { "user-agent": "Discordbot/2.0" },
        }),
      );

      expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/join/ABC234");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );

  test("does not rewrite human requests", () => {
    const response = proxy(
      new NextRequest("https://example.com/game/ABC234", {
        headers: { "user-agent": "Mozilla/5.0" },
      }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("only recognizes exact live routes with valid room codes", () => {
    const request = (path: string) =>
      proxy(
        new NextRequest(`https://example.com${path}`, {
          headers: { "user-agent": "Discordbot/2.0" },
        }),
      );

    expect(request("/game/abc234").headers.get("x-middleware-rewrite")).toBe(
      "https://example.com/join/ABC234",
    );
    for (const path of ["/game/ABCI01", "/game/ABC234/recap", "/join/ABC234"]) {
      expect(request(path).headers.get("x-middleware-rewrite")).toBeNull();
    }
  });
});
