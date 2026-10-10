import { describe, expect, it } from "vite-plus/test";
import { capAnswer, dropEchoedPrompt } from "./answer";
import { SLOPLASH_MAX_ANSWER, TAGLINE_MAX } from "./game-constants";

describe("capAnswer", () => {
  it("keeps text at or under the cap", () => {
    const exact = "x".repeat(SLOPLASH_MAX_ANSWER);
    expect(capAnswer(exact, SLOPLASH_MAX_ANSWER)).toBe(exact);
    expect(capAnswer("Two more years and the house is mine", 80)).toBe(
      "Two more years and the house is mine",
    );
  });

  it("trims at the last word boundary without trailing punctuation", () => {
    const text =
      "My cat has been quietly planning a hostile takeover of the household, starting with the fridge, then the couch";
    const capped = capAnswer(text, SLOPLASH_MAX_ANSWER);
    expect(capped.length).toBeLessThanOrEqual(SLOPLASH_MAX_ANSWER);
    expect(capped).toBe(
      "My cat has been quietly planning a hostile takeover of the household, starting",
    );
    expect(capAnswer("one two three, four", 15)).toBe("one two three");
    expect(capAnswer("alpha beta — gamma delta", 13)).toBe("alpha beta");
  });

  it("hard-cuts when the last space is before half the cap", () => {
    expect(capAnswer("a bcdefghijklmnopqrstuvwxyz", 10)).toBe("a bcdefghi");
    expect(capAnswer("x".repeat(100), 80)).toBe("x".repeat(80));
  });

  it("collapses whitespace and newlines", () => {
    expect(capAnswer("  so\n\nmany\t  spaces  ", 80)).toBe("so many spaces");
  });

  it("returns empty for blank input", () => {
    expect(capAnswer("   \n ", 80)).toBe("");
  });

  it("caps a tagline at 100", () => {
    const tagline = `${"Six rounds, zero mercy. ".repeat(6)}GG`;
    const capped = capAnswer(tagline, TAGLINE_MAX);
    expect(capped.length).toBeLessThanOrEqual(TAGLINE_MAX);
    expect(capped.endsWith(" ")).toBe(false);
    expect(tagline.startsWith(capped)).toBe(true);
  });

  it("never cuts an emoji in half", () => {
    const capped = capAnswer(`a${"😀".repeat(60)}`, 80);
    expect(capped.isWellFormed()).toBe(true);
    expect(capped).toBe(`a${"😀".repeat(39)}`);
    const joined = capAnswer(`${"x".repeat(78)}👩\u200D🚀`, 80);
    expect(joined.isWellFormed()).toBe(true);
    expect(joined.endsWith("\u200D")).toBe(false);
  });

  it("drops a lone surrogate left by an earlier cut", () => {
    expect(capAnswer("hi \uD83D", 80)).toBe("hi");
    expect(capAnswer("\uDE00ok", 80)).toBe("ok");
  });
});

describe("dropEchoedPrompt", () => {
  it("drops a lead-in the answer repeats word for word", () => {
    expect(
      dropEchoedPrompt(
        "My greatest regret is investing my entire life savings into ______",
        "My greatest regret is investing my entire life savings into Beanie Babies",
      ),
    ).toBe("Beanie Babies");
    expect(
      dropEchoedPrompt("The one thing keeping me alive is ______", "the one thing keeping me alive is my cat's disappointed sigh"),
    ).toBe("My cat's disappointed sigh");
  });

  it("leaves real answers alone", () => {
    expect(dropEchoedPrompt("A yoga pose that sounds like a felony", "Downward Dog Theft")).toBe(
      "Downward Dog Theft",
    );
    expect(dropEchoedPrompt("The one thing keeping me alive is ______", "Spite and iced coffee")).toBe(
      "Spite and iced coffee",
    );
    // Nothing left after the echo: keep what the model wrote.
    expect(dropEchoedPrompt("My secret talent is ______", "My secret talent is")).toBe(
      "My secret talent is",
    );
    // Too short a lead-in to call it an echo.
    expect(dropEchoedPrompt("Why ______?", "Why not")).toBe("Why not");
  });
});

describe("cleanLine", () => {
  it("strips a wrapping pair of quotes but keeps a closing inner quote", async () => {
    const { cleanLine } = await import("./ai");
    expect(cleanLine('"Beanie Babies"', 80)).toBe("Beanie Babies");
    expect(cleanLine("my dad's Wi-Fi password is still 'password123'", 80)).toBe(
      "my dad's Wi-Fi password is still 'password123'",
    );
    expect(cleanLine("“Speaker 3: nodding”", 80)).toBe("Speaker 3: nodding");
  });

  it("leaves lines alone whose outer quotes do not pair up", async () => {
    const { cleanLine } = await import("./ai");
    expect(cleanLine('"No," said Dad, "absolutely not."', 80)).toBe(
      '"No," said Dad, "absolutely not."',
    );
    expect(cleanLine("'Tis the season, said 'nobody'", 80)).toBe(
      "'Tis the season, said 'nobody'",
    );
    expect(cleanLine("'don't touch the thermostat'", 80)).toBe("don't touch the thermostat");
  });
});
