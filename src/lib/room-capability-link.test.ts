import { describe, expect, test } from "vite-plus/test";
import {
  buildRoomCapabilityLink,
  clearRoomCapabilityFromUrl,
  readRoomCapabilityFragment,
} from "./room-capability-link";

describe("room capability links", () => {
  test("keeps bearer capabilities out of the HTTP query string", () => {
    const link = buildRoomCapabilityLink("https://example.com/stage/ABC234", "session.secret");
    const url = new URL(link);
    expect(url.search).toBe("");
    expect(readRoomCapabilityFragment(url.hash)).toBe("session.secret");
  });

  test("clears query and fragment capabilities while preserving unrelated URL state", () => {
    const url = clearRoomCapabilityFromUrl(
      new URL("https://example.com/stage/ABC234?capability=old&view=tv#capability=new&theme=dark"),
    );
    expect(url.toString()).toBe("https://example.com/stage/ABC234?view=tv#theme=dark");
  });
});
