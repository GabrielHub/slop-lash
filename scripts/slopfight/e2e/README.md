# SlopFight live integration

Run against a Next development server connected to the **development** Convex
deployment. The room is created through the Free Play host form; the script
never reads or types the host password. This spends normal forge AI credits.

```powershell
vp exec convex dev --once
vp run dev
# In a second terminal:
vp exec node scripts/slopfight/e2e/run.mjs --no-film --shots=output/playwright/slopfight-final
```

The harness finds the installed transitive `playwright-core`. Install its
Chromium browser beforehand, or pass `--chrome=<absolute executable path>`.
Use `--base=<url>` for a different local port. `--headed` shows the windows.
The TV room probe is development-only, so this does not run on production.

The run drives one 1920×1080 TV and two touch-enabled 390×844 phone contexts.
It draws a cat, describes a cactus wrestler, submits drawing and text upgrades,
bets, hypes, opens the host menu, and disconnects one player. Timers must carry
the game through all six fights and the podium. Both WebGL and text-fallback
recaps are inspected.

`--no-film` measures clean fight and phase-transition performance. Omitting
it records screencasts and extracts signature moments into `moments/`.
Capture intervals are recorded so screencast overhead is not mistaken for
game performance. Browser phone emulation is functional coverage, not a
physical-phone performance measurement.

The report includes `log.json`, `timeline.txt`, screenshots, mutations,
console/network errors, per-fight server/TV hashes, controller script checks,
and frame statistics. Missing evidence and failed required interactions fail
the run. Performance thresholds and validation are centralized and tested in
`report.mjs`. Keep source files unchanged during measurement to avoid hot
reload contaminating the result. Generated evidence stays under ignored
`output/`.
