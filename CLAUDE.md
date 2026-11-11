# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Dart Night is a scorekeeping app for a dart night with 4 players, meant for phones. It is a static site built from plain ES modules. There is **no build step and no package manager**, and Node and Python are not installed on this machine. Libraries come from CDNs: Firebase JS SDK 10.12.0, Chart.js 4.4.0 (loaded only when the Stats tab is first opened), and Google Fonts.

## Commands (PowerShell)

- **Serve locally:** `pwsh tools/serve.ps1` serves the app at http://localhost:8080/. ES modules need http://, so `file://` won't work.
- **Run all tests headlessly:** `pwsh tools/test.ps1`. It exits non-zero on failure. It starts the server, loads `tests/index.html` (unit tests) and `tests/smoke.html` (end-to-end) in headless Edge, and prints the results.
- **Run one suite interactively:** start the server and open `/tests/` or `/tests/smoke.html` in a browser. There is no filter for running a single test. To focus on one, comment out the other `await test(...)` calls in `tests/tests.js`.

## Environments — never test against live data

`js/config.js` picks the data source:

| `ENV` | Data | When |
|---|---|---|
| `local` | `localStorage` + `BroadcastChannel` (`js/db/local.js`), seeded from `tests/fixtures/sample-state.json` | default on localhost |
| `dev` | Firebase path `dartnight-dev/state` | `?env=dev` |
| `prod` | Firebase path `dartnight/state` (**live, shared by everyone**) | default on the hosted site, or `?env=prod` |

- Adding `?reset` re-seeds local mode from the fixture.
- When `ENV` isn't prod, a red badge appears in the header.
- The fixture is an anonymized copy of the real history (4 nights). Real backups go in `backups/`, which is gitignored.
- **Making a backup:** run `curl -s https://dart-night-default-rtdb.firebaseio.com/dartnight/state.json -o backups/live-state-YYYY-MM-DD.json`.

## Architecture

```
index.html          shell: header, tabs, modal markup
css/styles.css
js/main.js          entry: tab nav, render(), sync badge
js/config.js        Firebase config, ENV, APP_VERSION (bump on release)
js/store.js         S (shared state), fresh(), normalize(), connect(), save()
js/db/              firebase.js / local.js adapters: { subscribe(onData,onError), write(value) }
js/logic/           pure, DOM-free, unit-tested: scoring.js, schedule.js, bracket.js
js/ui/              one module per tab + dom.js helpers
tests/              tests.js (unit), smoke.html (drives the real app in local mode), fixtures/
tools/              serve.ps1, test.ps1
```

**State.**
- `S` is one object that is **mutated in place and never reassigned**. To replace it entirely, use `replaceState()`.
- `save()` writes the entire object, and the adapter's subscription replaces `S` and calls `render()` on every device.
- Firebase drops nulls and empty arrays/objects. `local.js` imitates this with `firebaseShape()`, so bugs show up locally. **Every new array or object field in `S` needs a default in both `fresh()` and `normalize()`.**

**Rendering.**
- `render()` in `main.js` re-renders **only the active tab**, and switching tabs renders the tab you switch to. Each `ui/*.js` module rebuilds its section's `innerHTML` from template strings.
- Setup is skipped while one of its inputs has focus, so typing isn't interrupted.
- Escape user text (player and night names) with `esc()` and `pName()` from `ui/dom.js`. Use `rawName()` for `textContent` and toasts.

**Handlers.** Inline `onclick=` attributes call functions that the UI modules attach to `window` (`window._addGame`, `window.confirmRR`, ...). Any new handler used in a template has to be exposed the same way.

**Logic is pure and takes data as arguments.**
- `casualPts(games)`, `rrPts(matches)` and `rrSeeds(rrMatches, games)` take only the data they need.
- `createBracket(seeds)` and `advanceBracket(bracket, id, winner)` operate on whatever bracket object they're given, so the same engine can drive other brackets (for example a season playoff).
- The unit tests replay every fixture night through these functions and compare the results to the saved scores, bracket matches and podiums. Keep those passing.

**Night flow** (all on the Night tab, driven by flags in `S`):
1. `_startNight`: requires 4 player names and a night name.
2. Casual games (`S.games`): 1 pt per win when points are on.
3. Round robin (`S.rr`): `PAIRS` × 1 or 2 legs, ordered by `scheduledMatches()`. With 4 players, some back-to-back matches can't be avoided. Seeds are ranked by RR wins, then head-to-head, then casual points.
4. Bracket (`S.bracket`): double elimination with rounds in order `W1 → L1 + W2 → L2 → GF → GFR`. The podium is awarded `BRACKET_PTS` = 8/6/3/1.
5. `_saveNight`: pushes a detailed record onto `S.history`, tagged with `seasonId` and `playerIds`. History, Scores and Stats are all calculated from `S.history`.
   - **The night's winner is the bracket winner.** Placement comes from `nightPlacement()`, which is the `bracketPodium` order.
   - `scores` (casual + RR + bracket points) is a separate stat. It never decides who won.

**Seasons** (`js/logic/seasons.js` has the model docs at the top; `ui/setup.js` has the Season card).
- **People vs. seats.** `S.roster` maps a permanent `pid` to a name. `S.playerIds` tells you who sits in slots 0–3 right now, in parallel with `S.players`. Inside a night or a bracket, code still uses slots. Translate a slot to a person with the night's `playerIds` or the season's `playerIds`, and always show names via `nameOf(pid)`, so that renames carry through history.
- **Migration on every load.** `migrateSeasons()` runs inside `normalize()`. It is deterministic: existing players become `p1`–`p4`, and existing nights become Season `s1`. It also tags nights saved by an older app version with the current season. Nothing is written just because a migration ran.
- **Season lifecycle.** `regular` → `playoffs` → `complete`.
  - The regular season ends automatically when a season has `nights` nights, or manually with End Season.
  - When it ends, `endRegularSeason()` freezes `standings` and sets `regularChampion`.
  - Standings: placement points 4/3/2/1 per night, with ties broken by nights won, then night points, then bracket head-to-head.
- **Playoff.** It is bracket-only and lives in `season.playoff`, not in a night. It uses the same `createBracket` and `advanceBracket` engine, with slots taken from `season.playerIds` and seeds in standings order (1v4, 2v3). Seeding is the only advantage. `completePlayoff()` sets `playoffChampion`.
- **The playoff is independent of nights.** It can be run before, after or without one. The next season can start while the previous season's playoff is still pending. You can't start a night until the current season is `regular`. The roster can only change when a new season starts.
- **Stats by person.** Stats aggregate by person through `viewPids()` and `remapNight()`, which translate each night's slots into one shared index space. Use those for any new cross-night stat instead of indexing by slot. Season career stats come from `careerSeasonStats()`.

**Exactly 4 players per night is assumed everywhere.** This includes `NUM_PLAYERS`/`PAIRS`, the bracket structure and the 4 colors per theme. A roster can have more than 4 people over time. Stats handle any number of people, with extra chart colors in `analytics.js`.

**Export/Import** (Setup tab): v2 export writes `{exportedAt, version, players, playerIds, roster, seasons, currentSeasonId, history}`. Import merges history and skips nights already present (matched on `name|date`). A v2 file imported into an empty app is a full restore. Older v1 files still import, and their nights join the current season.
