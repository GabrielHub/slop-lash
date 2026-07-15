import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { useConvexRoomSession } from "./use-convex-room-session";

function SessionProbe({ roomCode }: { roomCode: string }) {
  const session = useConvexRoomSession(roomCode);
  return createElement("span", null, session?.roomCode ?? "none");
}

describe("useConvexRoomSession", () => {
  it("uses a stable null snapshot during server rendering", () => {
    expect(renderToString(createElement(SessionProbe, { roomCode: "ABCD" }))).toContain(">none<");
  });
});
