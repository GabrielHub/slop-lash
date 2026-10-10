import { describe, expect, test } from "vite-plus/test";
import { formatDelta, formatPoints, ordinal } from "./format";

describe("ordinal", () => {
  test("uses st, nd, rd, and th, with teens always th", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "111th",
    ]);
  });
});

describe("formatPoints and formatDelta", () => {
  test("group thousands and use a true minus sign", () => {
    expect([1250, -150, -0.3].map(formatPoints)).toEqual(["1,250", "−150", "0"]);
  });

  test("sign gains and losses only", () => {
    expect([2500, -150, 0.2].map(formatDelta)).toEqual(["+2,500", "−150", "0"]);
  });
});
