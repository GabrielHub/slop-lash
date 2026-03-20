# MatchSlop Persona Design Guide

A reference for creating persona seed examples that teach the LLM how to generate
consistent, funny dating-app characters. Each persona is a fully fleshed-out fake
person — backstory first, everything else derived from that.

---

## Architecture

ONE example is randomly selected per game, filtered by the persona's identity
(MAN / WOMAN / NON_BINARY / OTHER). This prevents the model from fixating on a
single style. The example teaches the LLM the *level of detail* and *tone* expected.

## Design Philosophy

Personas are the **straight man** in MatchSlop — the humor comes from players
sending unhinged messages, not from wacky characters. Every persona should feel
like someone your friend would actually date: grounded, relatable, maybe a bit
quirky but never cartoonish.

The most important thing is that personas **text like real people**. Every persona
has a distinct texting style baked into their backstory and defined in a dedicated
`textingStyle` field. This prevents the AI from falling into generic chatbot
patterns ("That's such a great question!", "I appreciate that!") and makes each
conversation feel unique.

## Fields (in order of importance)

### 1. BACKSTORY (the character bible — 3-5 sentences)

This is the most important field. It defines who this person really is: their
personality, what they care about, their vibe, and **how they text**. The backstory
is fed to the LLM but **never shown to players**. It drives the persona's behavior
in multi-round conversations.

Write it like a character description for an improv actor. Be specific and
grounded — these should feel like real people, not comedy characters. Include:

- Core personality and what they care about
- Specific interests and opinions
- What they're looking for / what annoys them
- **How they text** — this is critical. The last sentence of the backstory should
  describe their texting style (lowercase? abbreviations? full sentences? emojis?
  rapid-fire? dry one-liners?). Every persona should text differently.

**Good:** "Randa is a 26-year-old tech writer and surfer from the Outer Sunset.
She's trilingual (English, Arabic, Spanish), easygoing, and spends most weekends
chasing waves. She's funny in a dry, understated way and values people who can
hold a conversation. She moved to SF for work but stays for the ocean. She texts
in lowercase, keeps things short, and uses 'lol' more than she'd admit."

**Bad:** "A fun girl who likes surfing and writing."

### 2. TEXTING STYLE (1-2 sentences)

A concise description of how this persona texts. This field is shown to the LLM
alongside the backstory during profile generation and directly shapes how the
persona writes messages in conversation.

Every persona should have a distinct texting style. Think about:
- Capitalization (lowercase? proper? ALL CAPS for emphasis?)
- Abbreviations (lol, tbh, ngl, rn, ur, idk, etc.)
- Punctuation habits (minimal? enthusiastic!! em dashes? trailing off...)
- Message length (one-word replies? rapid-fire? longer thoughtful messages?)
- Verbal tics or filler words (like, literally, honestly, listen, ok but)
- Any unique habits (sends follow-ups, drops in another language, etc.)

**Good:** "Lowercase, dry. Uses 'lmao' and 'lol' as punctuation. Occasionally
cryptic — says a lot with very few words."

**Good:** "ALL CAPS for emphasis, rapid-fire messages, 'omg' and 'ok but', tells
stories the way she'd tell them out loud."

**Bad:** "Casual and friendly." (too vague — every persona would sound the same)

### 3. NAME

A real first name that fits the character. This becomes the displayName in the
profile and keeps the example consistent.

### 4. IDENTITY

MAN, WOMAN, NON_BINARY, or OTHER. Used to filter examples by the game's persona
gender.

### 5. TITLE (under 60 chars)

A punchy dating-app headline. Think of what someone would screenshot and send to
the group chat.

Good: "Cemetery Picnic Planner", "Burger Scientist"
Bad:  "Cool Guy", "Fun Girl"

### 6. BIO (under 220 chars)

One or two sentences. Should feel like it was derived from the backstory. Specific
details > generic vibes. Steal cadence from real Hinge/Bumble profiles.

### 7. DETAILS (profile badge data)

These are the Hinge-style badges shown on the dating card:
- **job**: Their occupation (specific: "pediatric dentist" not "doctor")
- **school**: Where they went to school (can be null)
- **height**: Format like `5'8"` or `6'1"`
- **languages**: Array, at least 1

### 8. APPEARANCE (for image generation only)

Structured description of what they look like. Follow this template:

```
"[Gender], [age range], [skin tone], [hair style/color],
 [distinguishing features], [build], [clothing summary],
 [expression/pose], [setting hint]"
```

Be specific: "long box braids with blonde ends" not "braids".
Name real garments: "cream cable-knit sweater" not "nice top".

### 9. IMAGE PROMPT (80–200 words, fal.ai Z-Image Turbo format)

Structure — order matters:

```
[Shot type & subject]     "Close-up portrait of an adult woman in her mid 20s"
[Appearance details]      skin, hair, features — match the appearance field
[Clothing]                explicit & modest — "faded black band tee", not "casual"
[Pose / expression]       "relaxed half-smile", "leaning against a brick wall"
[Environment]             one simple setting — "sunlit greenhouse", "city sidewalk"
[Lighting]                "soft natural daylight", "warm tungsten indoor light"
[Mood / color tone]       "muted cool tones", "warm earthy tones"
[Style + technical]       "realistic photography, 85mm lens, shallow depth of field"
[Safety tail]             ALWAYS end with:
                          "sharp focus, fully clothed, no text, no watermark, safe for work"
```

**Key rules (fal.ai Z-Image Turbo):**
- Turbo ignores negative prompts — embed ALL constraints as positive instructions
- Always say "adult [gender]" to prevent ambiguous ages
- Name specific clothing; avoid loaded tokens like "model" or "influencer"
- Specify a real lens (35mm, 50mm, 85mm) for consistent framing
- Keep backgrounds simple — one location, lightly described

**Key rules (OpenAI prompt guidance):**
- Lead with the most important visual information (subject first)
- Be precise — "wavy brown hair pushed back" beats "nice hair"
- Separate persistent traits from per-shot controls

### 10. PROMPT EXAMPLES (exactly 3 strings)

Real dating-app prompt stubs. Should feel consistent with the backstory. Mix types:
- Openers: "I go crazy for", "The best way to ask me out is by"
- Personality: "My most irrational fear", "A hill I will die on"
- Vibes: "My simple pleasures", "Typical Sunday"

### 11. TONE TAGS (2–3 strings)

Adjectives for the persona's voice. "deadpan" not "funny", "chaotic-good" not
"random".

### 12. RED FLAGS / GREEN FLAGS (2 each)

Funny, specific, slightly absurd. The best ones are weirdly specific observations.

Good: "keeps loose walnuts in pockets"
Bad:  "bad communicator"
