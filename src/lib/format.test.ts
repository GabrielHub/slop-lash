import { describe, expect, test } from "vite-plus/test";
import { formatSigned, ordinal } from "./format";

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

describe("formatSigned", () => {
  test("adds a plus to gains only", () => {
    expect([100, -150, 0].map(formatSigned)).toEqual(["+100", "-150", "0"]);
  });
});
