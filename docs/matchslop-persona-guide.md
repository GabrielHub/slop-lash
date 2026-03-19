# MatchSlop Persona Design Guide

A reference for creating persona seed examples that teach the LLM how to generate
consistent, funny dating-app characters. Each persona is a fully fleshed-out fake
person — backstory first, everything else derived from that.

---

## Architecture

ONE example is randomly selected per game, filtered by the persona's identity
(MAN / WOMAN / NON_BINARY / OTHER). This prevents the model from fixating on a
single style. The example teaches the LLM the *level of detail* and *tone* expected.

## Fields (in order of importance)

### 1. BACKSTORY (the character bible — 3-5 sentences)

This is the most important field. It defines who this person really is: their
personality, contradictions, specific obsessions, how they talk, what annoys them.
The backstory is fed to the LLM but **never shown to players**. It drives the
persona's behavior in multi-round conversations.

Write it like a character description for an improv actor. Be specific and a
little absurd. Include:

- Core personality and contradictions
- Specific obsessions and opinions
- How they talk / their energy
- What they care about vs. what annoys them
- Anything that makes them feel like a real person

**Good:** "Randa is a 29-year-old tech writer and surfer from the Outer Sunset who
treats her dating profile like performance art. Every prompt is an escalating cry
for help from someone 'trapped inside the app.' She's trilingual (English, Arabic,
Spanish), genuinely funny, and committed to the bit at all times. In real life she's
a chill surfer who disappears for weekend wave trips. She'll keep the hostage bit
going as long as possible but occasionally breaks character to say something
surprisingly sincere."

**Bad:** "A fun girl who likes surfing and writing."

### 2. NAME

A real first name that fits the character. This becomes the displayName in the
profile and keeps the example consistent.

### 3. IDENTITY

MAN, WOMAN, NON_BINARY, or OTHER. Used to filter examples by the game's persona
gender.

### 4. TITLE (under 60 chars)

A punchy dating-app headline. Think of what someone would screenshot and send to
the group chat.

Good: "Cemetery Picnic Planner", "Burger Scientist"
Bad:  "Cool Guy", "Fun Girl"

### 5. BIO (under 220 chars)

One or two sentences. Should feel like it was derived from the backstory. Specific
details > generic vibes. Steal cadence from real Hinge/Bumble profiles.

### 6. DETAILS (profile badge data)

These are the Hinge-style badges shown on the dating card:
- **job**: Their occupation (specific: "pediatric dentist" not "doctor")
- **school**: Where they went to school (can be null)
- **height**: Format like `5'8"` or `6'1"`
- **languages**: Array, at least 1

### 7. APPEARANCE (for image generation only)

Structured description of what they look like. Follow this template:

```
"[Gender], [age range], [skin tone], [hair style/color],
 [distinguishing features], [build], [clothing summary],
 [expression/pose], [setting hint]"
```

Be specific: "long box braids with blonde ends" not "braids".
Name real garments: "cream cable-knit sweater" not "nice top".

### 8. IMAGE PROMPT (80–200 words, fal.ai Z-Image Turbo format)

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

### 9. PROMPT EXAMPLES (exactly 3 strings)

Real dating-app prompt stubs. Should feel consistent with the backstory. Mix types:
- Openers: "I go crazy for", "The best way to ask me out is by"
- Personality: "My most irrational fear", "A hill I will die on"
- Vibes: "My simple pleasures", "Typical Sunday"

### 10. TONE TAGS (2–3 strings)

Adjectives for the persona's voice. "deadpan" not "funny", "chaotic-good" not
"random".

### 11. RED FLAGS / GREEN FLAGS (2 each)

Funny, specific, slightly absurd. The best ones are weirdly specific observations.

Good: "keeps loose walnuts in pockets"
Bad:  "bad communicator"
