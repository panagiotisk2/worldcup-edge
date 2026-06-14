# Live Update Mechanism — Design Spec
**Date:** 2026-06-14  
**File:** `WorldCup2026_Dashboard.html` (all changes inline, no new files)  
**Status:** Approved, ready for implementation

---

## Goal

Make every piece of data on the WC 2026 dashboard update automatically — standings, odds, Intelligence Engine predictions, and live match scores — without the user pressing any button.

---

## Decisions

| Question | Decision |
|---|---|
| What to live-update | Both background auto-refresh AND a live score ticker |
| Polling frequency | Option A: 30s while any WC match is live, 5min when idle |
| API cost | User accepts paid API tiers for both SportAPI and The Odds API |
| Ticker placement | Panel at top of Predictions tab only (not sticky, not floating) |
| Architecture | Dual-timer state machine (live mode / idle mode) |

---

## Architecture: Dual-Timer Polling Engine

### New state variables (4)
```js
let pollingTimer   = null;   // active setInterval handle
let pollingMode    = null;   // 'live' | 'idle' | null
let lastPollTime   = null;   // Date of last successful fetch
let liveEventCache = [];     // in-progress events from last tick
```

### `startPolling()`
Called once on page load (WC mode only). Clears any existing timer, fires `pollTick()` immediately, then sets idle cadence as the baseline.

```js
function startPolling() {
  stopPolling();
  pollTick();
  setPollingMode('idle');
}
```

### `stopPolling()`
Clears `pollingTimer`, sets `pollingMode = null`. Called on:
- `switchCompetition('pl')`
- `document.visibilitychange` → hidden

### `setPollingMode(mode)`
State machine transition. No-ops if already in requested mode.

```js
function setPollingMode(mode) {
  if (pollingMode === mode) return;
  pollingMode = mode;
  clearInterval(pollingTimer);
  const delay = mode === 'live' ? 30_000 : 5 * 60_000;
  pollingTimer = setInterval(pollTick, delay);
  updatePollingIndicator();  // updates status dot in UI
}
```

### `pollTick()` — sequence
Runs every interval. Steps execute in order:

1. **Fixtures** → `fetchFootballData()` → returns `{ liveEvents, finishedEvents, allEvents }`
2. **Mode switch** → `liveEvents.length > 0` → `setPollingMode('live')` else `setPollingMode('idle')`
3. **Ticker** → `renderLiveTicker(liveEvents, allEvents)`
4. **Standings** → if Score Table is in live mode and `finishedEvents.length > 0` → rebuild `apiStandingsCache` → `renderScoreTable()`
5. **Intelligence Engine** → `autoResolveFromEvents(allEvents)` already called inside `fetchFootballData()`; if any new resolution → `renderIntelligence()` if Intel tab is active
6. **Odds** → `fetchLiveOdds()` (same tick, Option A)
7. **Timestamp** → reset "updated X ago" counter to 0, set `lastPollTime = Date.now()`

### Page Visibility API
```js
document.addEventListener('visibilitychange', () => {
  document.hidden ? stopPolling() : startPolling();
});
```

---

## Live Ticker UI

### Placement
First child of the Predictions tab content section, above the group filter pills. Present in DOM on load, `display:none` until live match detected.

### State 1 — Live match(es) in progress
```
┌─────────────────────────────────────────────────────────┐
│ 🔴 LIVE  · updated 12s ago                    [2 matches]│
├─────────────────────────────────────────────────────────┤
│  🇪🇸 Spain       2 – 0       🇨🇻 Cape Verde  │ 67'  H  │
│  🇫🇷 France      1 – 1       🇮🇶 Iraq         │ 43'  E  │
└─────────────────────────────────────────────────────────┘
```
- Pulsing red dot (`@keyframes` opacity 1 → 0.3 → 1, 1.5s infinite)
- Each row: home flag + name · score (large bold) · away flag + name · minute (amber) · group badge
- Winning side name rendered slightly brighter

### State 2 — No live match, match later today
```
┌─────────────────────────────────────────────────────────┐
│ ⏱ Next match  · Netherlands vs Japan  · kicks off in 1h 32m │
└─────────────────────────────────────────────────────────┘
```
- Quiet muted bar, no pulsing
- Countdown updates each idle tick (no separate interval needed)

### State 3 — No live or upcoming match today
- `display:none` — no footprint

### `renderLiveTicker(liveEvents, allEvents)`
1. `liveEvents.length > 0` → render State 1
2. Else find first `allEvents` entry today with status `scheduled` + known kickoff → render State 2
3. Else → hide

### "Updated X seconds ago" counter
Independent `setInterval` at 1s updates a text node. Resets to 0 on each successful `pollTick()`.

### CSS additions (~25 lines)
- `@keyframes tickerPulse` — opacity pulse for live dot
- `.ticker-wrap` — card with left red border in live mode, grey in idle
- `.ticker-row` — flex row: team name, score, minute, group badge
- `.ticker-score` — `font-size: 1.3rem; font-weight: 900`
- `.ticker-minute` — `color: var(--gold)`
- `.ticker-group` — small pill badge

---

## Per-Tick Update Map

| Data | Trigger | Function called |
|---|---|---|
| Live scores (ticker) | Every tick | `renderLiveTicker()` |
| Group standings | Every tick, live mode only | `renderScoreTable()` |
| Intelligence Engine auto-resolve | Every tick | `autoResolveFromEvents()` inside `fetchFootballData()` |
| Market odds | Every tick (Option A) | `fetchLiveOdds()` |
| API status dots | Every tick | `setApiStatus()` (already exists) |
| "Last updated" timestamp | Every tick success | Reset counter |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| API error on fixtures | Keep current data; amber API status dot; don't change polling mode |
| All 3 Odds API keys exhausted | Skip odds this tick; log warning; continue fixtures polling |
| User switches to PL mode | `stopPolling()` — PL has no live fixtures |
| User switches back to WC | `startPolling()` — restarts from idle, upgrades if live match found |
| Browser tab backgrounded | `stopPolling()` on hide, `startPolling()` on focus |
| Match finishes mid-cycle | Next tick: event moves from live → finished; ticker row removed; standings update; engine auto-resolves |
| No WC matches returned (off-season) | Stays idle (5min); ticker hidden |
| Two matches simultaneously live | Ticker shows both rows stacked |
| `fetchFootballData()` already in flight | Guard flag `let pollInFlight = false` prevents overlapping fetches |

---

## What Does NOT Change

- `fetchFootballData()` and `fetchLiveOdds()` internals — no modifications
- `autoResolveFromEvents()` — called as-is
- `renderScoreTable()`, `renderIntelligence()` — called as-is
- PL mode — entirely unaffected
- Netlify functions — no changes needed

---

## Implementation Scope

**New functions:** `startPolling`, `stopPolling`, `setPollingMode`, `pollTick`, `renderLiveTicker`, `updatePollingIndicator`, `startUpdatedCounter`  
**Modified functions:** `switchCompetition` (add stop/start polling), page load init (add `startPolling()`)  
**New HTML:** `<div id="liveTicker">` inside Predictions tab  
**New CSS:** ~25 lines  
**New JS state:** 4 variables + 1 inflight guard  
**Files changed:** `WorldCup2026_Dashboard.html` only
