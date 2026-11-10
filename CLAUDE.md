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
5. `_saveNight`: pushes a detailed record onto `S.history`. History, Scores and Stats are all calculated from `S.history`.
   - A night's `scores` = casual + RR + bracket points.
   - History currently picks each night's champion by highest `scores`.

**Exactly 4 players is assumed everywhere.** This includes `NUM_PLAYERS`/`PAIRS`, the `[0,0,0,0]` arrays, the bracket structure, and the 4 colors per theme in `THEMES[*].p`. History entries and Stats index players by slot (0–3), and Stats labels those slots with the *current* `S.players` names.

**Export/Import** (Setup tab): export writes `{exportedAt, version, players, history}`. Import merges history and skips nights already present (matched on `name|date`).
