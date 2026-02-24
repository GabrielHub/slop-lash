# Slop-Lash Feature Roadmap

A prioritized list of missing features and improvements identified from a full codebase audit (Feb 2025). Organized by impact and effort.

---

## High-Impact Features

### 1. Spectator Mode

**Problem:** No way for extra people to watch a game without joining as a player. At parties with 8+ people, extras are left out.

**Proposal:**
- Add a `SPECTATOR` value to `PlayerType` enum
- Spectators join via a `/watch` route (or a toggle on the join page)
- Spectators receive the same polling data but are excluded from prompt assignment, response submission, and voting
- Show a spectator count badge in the lobby and game UI
- Spectators can see all responses and vote results in real-time

**Effort:** Medium

---

### 2. Custom Prompts

**Problem:** The 562-prompt bank is great but hosts can't personalize games. Inside jokes and group-specific prompts are core to Quiplash's replay value.

**Proposal:**
- Add an optional `customPrompts` text field in the lobby (host-only)
- Accept one prompt per line, validate against the same character limits
- Mix custom prompts into the pool (or use exclusively if enough are provided)
- Store custom prompts on the `Game` model (JSON field) so they persist for play-again
- Stretch: Shareable prompt packs with a code/URL

**Effort:** Medium

---

### 3. Kick Player

**Problem:** The host has no way to remove disruptive or AFK players from the lobby or mid-game.

**Proposal:**
- Add `POST /api/games/[code]/kick` endpoint (host-only, requires player ID)
- Remove the player from the game, reassign prompts if mid-round
- Notify kicked player on next poll (show a "You were removed" message)
- Prevent re-joining with the same name for that game session

**Effort:** Low

---

### 4. Game Recap Page

**Problem:** The `/recap` API endpoint exists but there's no dedicated UI page. Games vanish after completion — players can't revisit funny moments or share results.

**Proposal:**
- Create `/game/[code]/recap` page that renders all rounds, prompts, responses, votes, and winners
- Include achievements and final scores
- Make it shareable (no auth required, read-only)
- Add a "Copy link" button on the final results screen
- Stretch: Social share cards (OG image generation with winning responses)

**Effort:** Medium

---

## Medium-Impact Improvements

### 5. Enforce Rate Limiting on Routes

**Problem:** Rate limiting is fully implemented and tested (`lib/rate-limit.ts`) but never applied to any API route. The game is unprotected against spam/abuse.

**Proposal:**
- Apply rate limits to these endpoints:
  - `POST /create` — 5 per minute per IP
  - `POST /join` — 10 per minute per IP
  - `POST /respond` — 20 per minute per player
  - `POST /vote` — 20 per minute per player
- Use the existing `RateLimiter` class with appropriate bucket configs
- Return 429 with a `Retry-After` header

**Effort:** Low

---

### 6. Session Recovery / Reconnection

**Problem:** Player identity lives only in localStorage. Clearing the browser, switching devices, or opening a new tab loses the session permanently.

**Proposal:**
- Generate a short-lived reconnection token on join (stored in DB on the Player record)
- Allow rejoining by providing the token (e.g., via URL parameter or a "Rejoin" input)
- Auto-detect disconnected players via heartbeat and show a "Reconnecting..." state
- Stretch: QR code on the game screen to quickly rejoin on another device

**Effort:** Medium

---

### 7. Sound Effects

**Problem:** TTS is well-implemented but there are zero UI sound effects. Party games feel flat without audio feedback.

**Proposal:**
- Add short sound effects for key moments:
  - Timer warning (10 seconds remaining)
  - Vote reveal (drumroll or swoosh)
  - Achievement unlock (ding/fanfare)
  - Round transition (whoosh)
  - Player join (pop)
- Use a simple audio manager (preload small MP3/OGG files)
- Respect a mute toggle (persist to localStorage alongside theme)
- Keep files small (<50KB each) to avoid bundle bloat

**Effort:** Low-Medium

---

### 8. Response Reactions

**Problem:** Only one person "wins" each matchup. Other players have no way to express their reaction to responses, reducing engagement during voting.

**Proposal:**
- After the main vote is cast, allow all players to add emoji reactions to any response
- Display reaction counts on the vote reveal screen (e.g., 3x laughing, 2x fire)
- Reactions are cosmetic only — no effect on scoring
- Store as a lightweight JSON field or separate `Reaction` model

**Effort:** Medium

---

## Quality-of-Life Polish

### 9. Mobile Responsiveness Audit

**Problem:** Party games are primarily played on phones. Need to verify all phases work well on small screens.

**Proposal:**
- Test all game phases on 375px width (iPhone SE) through 428px (iPhone Pro Max)
- Key areas to check:
  - Writing phase textarea and character counter
  - Voting cards (two responses side by side or stacked)
  - Leaderboard table on narrow screens
  - Lobby player list with long names
- Fix any overflow, truncation, or touch target issues

**Effort:** Low

---

### 10. Idle Player Handling

**Problem:** If a human player goes AFK during WRITING, their prompt slot is wasted and other players see a blank. The game stalls waiting for input that never comes.

**Proposal:**
- When the WRITING timer expires, auto-submit `[no response]` for players who didn't respond
- During VOTING, if a player hasn't voted and the timer expires, auto-abstain
- Show a visual indicator on idle players (grayed out, "AFK" badge)
- After 2+ consecutive idle rounds, suggest the host kick the player
- Forfeited responses should lose automatically in matchups (same as AI forfeit logic)

**Effort:** Low-Medium

---

### 11. Configurable Game Settings

**Problem:** Key game parameters are hardcoded constants (`WRITING_DURATION_SECONDS = 90`, `VOTE_PER_PROMPT_SECONDS = 20`, 3 rounds). Hosts can't customize the pace.

**Proposal:**
- Add a settings panel in the lobby (host-only) with:
  - Writing time: 30 / 60 / 90 / 120 seconds
  - Number of rounds: 1 / 2 / 3
  - Prompts per round: auto / manual count
- Store settings on the `Game` model (JSON field or individual columns)
- Keep current values as defaults

**Effort:** Low-Medium

---

### 12. Game Cleanup / TTL

**Problem:** Old games persist in the database forever. With a single shared Neon DB, this will accumulate over time.

**Proposal:**
- Add a `cleanupStaleGames()` function that deletes games older than 48 hours (cascade handles related records)
- Trigger on a schedule: either a Vercel cron job (`vercel.json` cron) or lazily on game creation
- Exclude games referenced by leaderboard stats (or compute leaderboard from a materialized view)
- Log cleanup counts for monitoring

**Effort:** Low

---

## Technical Improvements

### 13. Server-Sent Events (SSE) Instead of Polling

**Problem:** Currently polling every 1-2 seconds. This generates unnecessary requests when nothing has changed (even with ETag/304 optimization).

**Proposal:**
- Replace polling with SSE on the game state endpoint
- Server pushes updates only when `Game.version` increments
- Fall back to polling if SSE connection drops
- Benefits: instant updates, lower server load, better UX responsiveness
- Note: Vercel supports SSE on serverless functions (with streaming)

**Effort:** High

---

### 14. External Error Tracking

**Problem:** No Sentry, LogRocket, or equivalent. Client and server errors in production go unnoticed.

**Proposal:**
- Add Sentry (free tier covers hobby projects)
- Instrument both client (`@sentry/nextjs`) and server
- Track: unhandled exceptions, AI generation failures, TTS timeouts, DB connection errors
- Add custom breadcrumbs for game phase transitions

**Effort:** Low

---

### 15. End-to-End Tests

**Problem:** Unit tests are solid (5 suites) but there are no E2E tests. The full game flow (create → join → write → vote → results) is untested as an integration.

**Proposal:**
- Add Playwright E2E tests covering:
  - Full game flow with 3 human players (simulated in 3 browser contexts)
  - Host creates game → players join → writing → voting → results
  - Edge cases: player disconnect, timer expiry, play-again flow
- Run in CI on pull requests
- Mock AI responses to keep tests fast and deterministic

**Effort:** High

---

### 16. Accessibility

**Problem:** No ARIA labels, focus management, or keyboard navigation patterns observed. The game is inaccessible to screen reader and keyboard-only users.

**Proposal:**
- Add ARIA labels to all interactive elements (buttons, inputs, vote cards)
- Manage focus on phase transitions (auto-focus the writing textarea, announce vote results)
- Ensure all actions are keyboard-accessible (Enter to submit, Tab to navigate)
- Add `role="alert"` for timer warnings and game state changes
- Test with VoiceOver / NVDA

**Effort:** Medium-High

---

## Priority Matrix

| # | Feature | Impact | Effort | Priority |
|---|---------|--------|--------|----------|
| 5 | Rate limiting on routes | Medium | Low | **P0** |
| 12 | Game cleanup / TTL | Medium | Low | **P0** |
| 3 | Kick player | High | Low | **P1** |
| 10 | Idle player handling | Medium | Low-Med | **P1** |
| 4 | Game recap page | High | Medium | **P1** |
| 9 | Mobile audit | Medium | Low | **P1** |
| 2 | Custom prompts | High | Medium | **P2** |
| 11 | Configurable settings | Medium | Low-Med | **P2** |
| 7 | Sound effects | Medium | Low-Med | **P2** |
| 1 | Spectator mode | High | Medium | **P2** |
| 6 | Session recovery | Medium | Medium | **P3** |
| 14 | Error tracking | Medium | Low | **P3** |
| 8 | Response reactions | Medium | Medium | **P3** |
| 16 | Accessibility | Medium | Med-High | **P3** |
| 15 | E2E tests | Medium | High | **P4** |
| 13 | SSE over polling | Medium | High | **P4** |
