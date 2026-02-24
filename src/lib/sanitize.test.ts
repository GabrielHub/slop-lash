import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize("<b>bold</b>", 100)).toBe("bold");
    expect(sanitize('<script>alert("xss")</script>', 100)).toBe('alert("xss")');
    expect(sanitize("a<br/>b", 100)).toBe("ab");
  });

  it("strips control characters", () => {
    expect(sanitize("hello\x00world", 100)).toBe("helloworld");
    expect(sanitize("a\x08b\x1Fc", 100)).toBe("abc");
  });

  it("preserves newlines and tabs", () => {
    expect(sanitize("line1\nline2", 100)).toBe("line1\nline2");
    expect(sanitize("col1\tcol2", 100)).toBe("col1\tcol2");
  });

  it("trims whitespace", () => {
    expect(sanitize("  hello  ", 100)).toBe("hello");
    expect(sanitize("\n  spaced  \n", 100)).toBe("spaced");
  });

  it("limits length", () => {
    expect(sanitize("abcdefghij", 5)).toBe("abcde");
    expect(sanitize("short", 100)).toBe("short");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(sanitize("", 100)).toBe("");
    expect(sanitize("   ", 100)).toBe("");
  });

  it("handles combined scenarios", () => {
    expect(sanitize("  <b>Hello\x00</b> World!  ", 10)).toBe("Hello Worl");
  });
});
