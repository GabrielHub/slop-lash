# MatchSlop Feature Ideas

The strongest MatchSlop features do three things:

- make the persona feel sharper and more specific
- create better reveal / reaction moments for a room full of people
- add replayability without slowing down the write-vote-results loop

This list is curated. Weak ideas from the earlier brainstorm were removed or folded into stronger versions.

## Best Bets

### 1. Persona Reactions Per Response

Before voting, the persona gives a very short reaction to each submitted line: "blocked", "huh", "okay that was good", "you sound insured".

Why it works:

- adds jokes even when a round's responses are weak
- makes the persona feel present every round, not just at the end
- fits the current transcript-driven structure cleanly

Guardrails:

- keep reactions short so they do not replace the reveal moment
- reactions should not reveal the winner too clearly

### 2. Persona Mood Drift

Track a visible mood state across the game: skeptical, amused, intrigued, obsessed, done. Winning lines and persona replies push it up or down.

Why it works:

- gives players a readable model for how to write the next round
- makes the same persona feel different from game to game
- pairs naturally with evolving AI replies

Tweak:

- merge "dynamic persona voice" into this instead of treating it as a separate feature

### 3. Persona Dealbreakers

Each persona has one or two hidden dealbreakers and one visible soft spot. Triggering a dealbreaker gets a roast; hitting the soft spot gets a noticeably warmer reply.

Why it works:

- creates strong jokes tied to persona specificity
- rewards players for reading the profile and transcript
- makes the AI feel less random

Tweak:

- avoid instant elimination on early triggers
- use sharper replies first; reserve hard punishments for repeated misses or the final round

### 4. Read Aloud Mode

Reveal responses one at a time with deliberate pacing on the shared screen, then show all options for voting.

Why it works:

- improves TV / couch play immediately
- gives every line a real comedy beat
- does not change the actual game rules

Tweak:

- pair it with reaction spam from players and spectators during the reveal

### 5. Spectator Mode

Allow non-players to join as spectators, watch the full round flow, and fire off emoji reactions in real time.

Why it works:

- broadens party usability without changing the player cap
- increases room energy during writing downtime and reveals
- technically cheaper than adding deeper progression systems

Tweak:

- keep spectator input cosmetic at first
- if expanded later, add a "crowd favorite" badge rather than score impact

### 6. Rematch With Same Persona

After a game ends, players can run it back with the same persona, but the persona remembers a few facts from the previous match and references them.

Why it works:

- creates instant replay value
- turns good personas into recurring characters
- makes transcripts matter beyond one session

Guardrails:

- persist a tiny memory summary, not the full transcript
- make the callback energy playful, not punitive

### 7. Category Awards / Superlatives

At the end of the game, generate transcript-based awards like "Smoothest Lie", "Most Desperate Recovery", "Most Likely To Get Left On Read".

Why it works:

- gives everyone a last laugh, not just the winner
- uses AI judgment where it is funniest, not where fairness matters most
- easy social-sharing material

Tweak:

- fold "Persona MVP" into this instead of keeping a separate award

### 8. Player-Created Personas

Let the host provide a short seed like "divorced magician who takes Yelp reviews personally" and generate a full persona from it.

Why it works:

- huge replayability upside
- highly streamable and shareable
- aligns with the existing persona-generation direction

Guardrails:

- use a structured seed form, not a totally open box
- keep generated personas within tone and safety bounds

## Good Ideas That Needed a Rewrite

### Response Reactions

Keep this, but treat it as part of reveal mode and spectator mode, not a standalone scoring mechanic.

Best version:

- reactions are fast, dumb, and plentiful
- results screen shows the funniest crowd stats: most skulls, most fire, most mixed response

## New Ideas Worth Adding

### 9. Callback Bonus Badge

If a line smartly references something the persona said earlier, flag it with a small "callback" badge in results or end-of-game awards.

Why it works:

- rewards multi-turn play without adding complicated scoring rules
- teaches players that listening to the persona matters

### 10. Persona Post-Mortem

After the match, the persona gives a short closing monologue about the night: who tried too hard, who almost had a shot, what line they will remember.

Why it works:

- strong ending beat for a party game
- turns the transcript into a payoff, not just history

### 11. Hot Takes Packs

Give personas optional themed prompt packs like wellness demon, startup freak, museum snob, suburban cryptid, or spiritually unemployed.

Why it works:

- replayability without needing full new systems
- easier to ship incrementally than account systems or meta-progression

### 12. Signature Typing Habits

Give personas a few consistent texting quirks: weird punctuation, overuse of ellipses, fake lowercase sincerity, voice-note energy written as text.

Why it works:

- cheap way to make personas feel memorable
- reinforces mood drift and persona identity in every reply

## Suggested Build Order

1. Persona reactions per response
2. Read aloud mode plus lightweight reactions
3. Mood drift plus signature typing habits
4. Dealbreakers and soft spots
5. Superlatives and persona post-mortem
6. Spectators
7. Rematch with same persona
8. Player-created personas
