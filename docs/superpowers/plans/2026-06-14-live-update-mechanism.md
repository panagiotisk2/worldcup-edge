# Live Update Mechanism — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot page-load fetch with a dual-timer polling engine (30s live / 5min idle) and add a live score ticker panel at the top of the Predictions tab.

**Architecture:** A `pollTick()` function runs on a `setInterval` managed by `setPollingMode()`. After each tick, it checks whether any WC event is in-progress and switches the timer cadence accordingly. A `renderLiveTicker()` function reads from two module-level caches (`liveEventCache`, `allEventsCache`) populated by the existing `fetchFootballData()`.

**Tech Stack:** Vanilla JS, no new dependencies. Single file: `WorldCup2026_Dashboard.html`.

---

## File Map

**Only one file changes:** `WorldCup2026_Dashboard.html`

| Section | What changes |
|---|---|
| `<style>` block (~line 232) | Add ticker CSS + `@keyframes tickerPulse` |
| HTML — `#predictionsWC` (~line 1263) | Insert `<div id="liveTicker">` between disclaimer and filter-bar |
| HTML — Refresh bar (~line 880) | Add `<span id="pollingStatus">` next to `#lastRefreshTime` |
| JS state variables (~line 3787) | Add 6 new variables |
| `fetchFootballData()` (~line 5741) | Populate `liveEventCache` + `allEventsCache` after parsing |
| New JS functions (add before closing `</script>`) | `renderLiveTicker`, `startUpdatedCounter`, `resetUpdatedCounter`, `updatePollingIndicator`, `stopPolling`, `setPollingMode`, `startPolling`, `pollTick` |
| `switchCompetition()` (~line 1796) | Replace last two lines with stop/start polling logic |
| Page load `initLiveData` IIFE (~line 6868) | Replace `setTimeout` block with `startPolling()` call |
| After `initLiveData` closes | Add `document.addEventListener('visibilitychange', ...)` |

---

## Task 1: CSS — Ticker Styles and Pulse Animation

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — `<style>` block, after `.tz-ref` rule

- [ ] **Step 1: Add CSS**

Find this line in the `<style>` block:
```css
  .tz-ref { color: var(--muted); font-size: 0.82em; font-weight: 400; }
```

Add immediately after it:
```css
  /* ── Live Ticker ── */
  @keyframes tickerPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  #liveTicker { margin-bottom:18px; border-radius:10px; overflow:hidden; border:1px solid var(--border); display:none; }
  .ticker-wrap-live { border-left:3px solid #ef4444; }
  .ticker-wrap-idle { border-left:3px solid var(--border); }
  .ticker-header { display:flex; align-items:center; gap:8px; padding:8px 14px; background:rgba(239,68,68,0.08); font-size:0.78rem; font-weight:700; }
  .ticker-dot { width:8px; height:8px; border-radius:50%; background:#ef4444; animation:tickerPulse 1.5s infinite; display:inline-block; flex-shrink:0; }
  .ticker-label { color:#ef4444; letter-spacing:0.05em; }
  .ticker-updated { color:var(--muted); font-weight:400; }
  .ticker-count { margin-left:auto; color:var(--muted); font-weight:400; }
  .ticker-matches { padding:4px 0; }
  .ticker-row { display:flex; align-items:center; gap:10px; padding:8px 14px; font-size:0.85rem; border-top:1px solid var(--border); }
  .ticker-team { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ticker-winning { color:#fff; font-weight:700; }
  .ticker-score { font-size:1.1rem; font-weight:900; color:#fff; min-width:50px; text-align:center; }
  .ticker-minute { color:var(--gold); font-size:0.78rem; min-width:32px; text-align:right; }
  .ticker-upcoming { justify-content:center; gap:16px; padding:10px 14px; background:rgba(255,255,255,0.03); }
  .ticker-teams { color:#fff; font-weight:600; }
  .ticker-countdown { color:var(--gold); }
  #pollingStatus { font-size:0.72rem; color:rgba(255,255,255,0.4); }
```

- [ ] **Step 2: Verify**

Open the HTML file in a browser. Open DevTools → Elements. Confirm `@keyframes tickerPulse` appears in the computed styles panel. No visible change to the page yet (ticker has `display:none`).

- [ ] **Step 3: Commit**
```bash
cd "/Users/panagiotis/Desktop/jobs/World cup"
git add WorldCup2026_Dashboard.html
git commit -m "feat: add live ticker CSS and pulse keyframe"
```

---

## Task 2: HTML — Ticker Panel + Polling Status Indicator

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — two HTML locations

- [ ] **Step 1: Insert ticker div in Predictions tab**

Find:
```html
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterMatches('all', this)">All Matches</button>
```

Add immediately before it:
```html
  <!-- Live score ticker — rendered by renderLiveTicker() -->
  <div id="liveTicker"></div>

```

- [ ] **Step 2: Add polling status indicator next to Refresh timestamp**

Find:
```html
    <span id="lastRefreshTime" style="font-size:0.75rem;color:rgba(255,255,255,0.4)">Last updated: —</span>
```

Replace with:
```html
    <span id="lastRefreshTime" style="font-size:0.75rem;color:rgba(255,255,255,0.4)">Last updated: —</span>
    <span id="pollingStatus"></span>
```

- [ ] **Step 3: Verify**

Reload in browser. Inspect `#liveTicker` in DevTools — it should exist in the DOM, `display:none`, between the disclaimer and the filter pills. `#pollingStatus` should appear next to the Last updated text (empty for now).

- [ ] **Step 4: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add liveTicker and pollingStatus HTML elements"
```

---

## Task 3: State Variables

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — JS section near `apiStandingsCache`

- [ ] **Step 1: Add polling state variables**

Find:
```js
let apiStandingsCache = null;  // Results fetched from fixtures API
```

Add immediately before it:
```js
// ── Live Polling Engine State ──
let pollingTimer      = null;   // active setInterval handle
let pollingMode       = null;   // 'live' | 'idle' | null
let lastPollTime      = null;   // ms timestamp of last successful tick
let pollInFlight      = false;  // guard: prevent overlapping fetches
let liveEventCache    = [];     // in-progress WC events from last tick
let allEventsCache    = [];     // all events from last tick (for next-match lookup)
let secondsSinceUpdate = 0;     // counter for "updated X ago" display
let updatedCounterInterval = null; // setInterval handle for the counter

```

- [ ] **Step 2: Verify**

Open browser console, type `pollingMode`. Should return `null` (not `undefined`). Type `liveEventCache`. Should return `[]`.

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add polling engine state variables"
```

---

## Task 4: Populate Caches in fetchFootballData()

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — inside `fetchFootballData()`, after the `allEvents` line

- [ ] **Step 1: Add cache population**

Find this block inside `fetchFootballData()`:
```js
    // Handle both SportAPI format { live:[...], scheduled:[...], all:[...] } and API-Football { response:[...] }
    const liveEvents    = json.live      || [];
    const schedEvents   = json.scheduled || [];
    const apiFootball   = json.response  || [];
    // 'all' is the deduplicated union including last 4 days of finished results
    const allEvents     = json.all || [...liveEvents, ...schedEvents, ...apiFootball];
```

Replace with:
```js
    // Handle both SportAPI format { live:[...], scheduled:[...], all:[...] } and API-Football { response:[...] }
    const liveEvents    = json.live      || [];
    const schedEvents   = json.scheduled || [];
    const apiFootball   = json.response  || [];
    // 'all' is the deduplicated union including last 4 days of finished results
    const allEvents     = json.all || [...liveEvents, ...schedEvents, ...apiFootball];

    // Update module-level caches for polling engine
    allEventsCache = allEvents;
    liveEventCache = allEvents.filter(e => {
      const s = (e.status?.type || e.status?.description || '').toLowerCase();
      return s === 'inprogress' || s.includes('in progress') ||
             s.includes('1st half') || s.includes('2nd half') ||
             s.includes('halftime') || s === 'live';
    });
```

- [ ] **Step 2: Verify**

In browser console after page loads, type `liveEventCache`. Should return an array (empty when no matches live, populated during live matches). Type `allEventsCache.length` — should return > 0 after the initial fetch.

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: populate liveEventCache and allEventsCache in fetchFootballData"
```

---

## Task 5: renderLiveTicker()

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — add new function before closing `</script>`

- [ ] **Step 1: Add the function**

Find the closing tag of the script block:
```js
})();
</script>
```

Add before `</script>`:
```js
// ══════════════════════════════════════════
// LIVE TICKER
// ══════════════════════════════════════════
function renderLiveTicker() {
  const ticker = document.getElementById('liveTicker');
  if (!ticker) return;

  // ── State 1: live matches in progress ──
  if (liveEventCache.length > 0) {
    ticker.style.display = '';
    ticker.className = 'ticker-wrap-live';
    const rows = liveEventCache.map(ev => {
      const home   = ev.homeTeam?.name || ev.teams?.home?.name || '?';
      const away   = ev.awayTeam?.name || ev.teams?.away?.name || '?';
      const scoreH = ev.homeScore?.current ?? ev.goals?.home ?? '–';
      const scoreA = ev.awayScore?.current ?? ev.goals?.away ?? '–';
      const min    = ev.time?.played ?? ev.status?.elapsed ?? '';
      const homeWin = typeof scoreH === 'number' && typeof scoreA === 'number' && scoreH > scoreA;
      const awayWin = typeof scoreH === 'number' && typeof scoreA === 'number' && scoreA > scoreH;
      return `<div class="ticker-row">
        <span class="ticker-team${homeWin ? ' ticker-winning' : ''}">${getFlag(home)} ${home}</span>
        <span class="ticker-score">${scoreH} – ${scoreA}</span>
        <span class="ticker-team${awayWin ? ' ticker-winning' : ''}">${away} ${getFlag(away)}</span>
        <span class="ticker-minute">${min ? min + "'" : '–'}</span>
      </div>`;
    }).join('');
    ticker.innerHTML = `
      <div class="ticker-header">
        <span class="ticker-dot"></span>
        <span class="ticker-label">LIVE</span>
        <span class="ticker-updated" id="tickerUpdated">· updated just now</span>
        <span class="ticker-count">${liveEventCache.length} match${liveEventCache.length > 1 ? 'es' : ''}</span>
      </div>
      <div class="ticker-matches">${rows}</div>`;
    return;
  }

  // ── State 2: no live match — find next scheduled match today ──
  const todayStr = new Date().toDateString();
  const nextMatch = allEventsCache.find(ev => {
    if (!ev.startTimestamp) return false;
    const evDate = new Date(ev.startTimestamp * 1000);
    if (evDate.toDateString() !== todayStr) return false;
    const s = (ev.status?.type || '').toLowerCase();
    return s === 'notstarted' || s === 'scheduled' || s === '';
  });

  if (nextMatch) {
    ticker.style.display = '';
    ticker.className = 'ticker-wrap-idle';
    const home    = nextMatch.homeTeam?.name || nextMatch.teams?.home?.name || '?';
    const away    = nextMatch.awayTeam?.name || nextMatch.teams?.away?.name || '?';
    const kickoff = new Date(nextMatch.startTimestamp * 1000);
    const diff    = kickoff - Date.now();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const countdownStr = diff > 0 ? `kicks off in ${h}h ${m}m` : 'starting soon';
    ticker.innerHTML = `<div class="ticker-row ticker-upcoming">
      <span>⏱ Next match</span>
      <span class="ticker-teams">${getFlag(home)} ${home} vs ${away} ${getFlag(away)}</span>
      <span class="ticker-countdown">· ${countdownStr}</span>
    </div>`;
    return;
  }

  // ── State 3: nothing today — hide ──
  ticker.style.display = 'none';
}
```

- [ ] **Step 2: Smoke-test in console**

In browser console:
```js
// Manually inject a fake live event to test State 1
liveEventCache = [{ homeTeam:{name:'Spain'}, awayTeam:{name:'Cape Verde'}, homeScore:{current:2}, awayScore:{current:0}, time:{played:67} }];
renderLiveTicker();
```
Expected: ticker appears above the Predictions filter pills showing "🔴 LIVE · Spain 2 – 0 Cape Verde · 67'".

Reset:
```js
liveEventCache = [];
renderLiveTicker();
```
Expected: ticker hides (State 3, since allEventsCache likely has no "today" scheduled match in testing).

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add renderLiveTicker with 3 states (live/upcoming/hidden)"
```

---

## Task 6: Updated-Counter Functions

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — add after `renderLiveTicker()`

- [ ] **Step 1: Add the two functions**

Directly after the closing `}` of `renderLiveTicker()`, add:
```js
function startUpdatedCounter() {
  if (updatedCounterInterval) clearInterval(updatedCounterInterval);
  secondsSinceUpdate = 0;
  updatedCounterInterval = setInterval(() => {
    secondsSinceUpdate++;
    const el = document.getElementById('tickerUpdated');
    if (!el) return;
    el.textContent = secondsSinceUpdate < 10
      ? '· updated just now'
      : `· updated ${secondsSinceUpdate}s ago`;
  }, 1000);
}

function resetUpdatedCounter() {
  secondsSinceUpdate = 0;
  const el = document.getElementById('tickerUpdated');
  if (el) el.textContent = '· updated just now';
}
```

- [ ] **Step 2: Verify**

In browser console:
```js
// Inject a live event so the ticker is visible with #tickerUpdated in the DOM
liveEventCache = [{ homeTeam:{name:'Brazil'}, awayTeam:{name:'Morocco'}, homeScore:{current:1}, awayScore:{current:1}, time:{played:55} }];
renderLiveTicker();
startUpdatedCounter();
```
Wait 15 seconds. The "· updated just now" text in the ticker header should change to "· updated 15s ago".

```js
resetUpdatedCounter();
```
Text should snap back to "· updated just now". Counter keeps running from 0.

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add startUpdatedCounter and resetUpdatedCounter"
```

---

## Task 7: updatePollingIndicator()

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — add after `resetUpdatedCounter()`

- [ ] **Step 1: Add the function**
```js
function updatePollingIndicator() {
  const el = document.getElementById('pollingStatus');
  if (!el) return;
  if (pollingMode === 'live') {
    el.innerHTML = ' &nbsp;<span style="color:#22c55e;animation:tickerPulse 1.5s infinite;display:inline-block">⬤</span> Auto-refresh: <strong style="color:#22c55e">LIVE 30s</strong>';
  } else if (pollingMode === 'idle') {
    el.innerHTML = ' &nbsp;<span style="color:#f59e0b">⬤</span> Auto-refresh: idle (5min)';
  } else {
    el.innerHTML = ' &nbsp;<span style="color:#6b7280">⬤</span> Auto-refresh: off';
  }
}
```

- [ ] **Step 2: Verify**

In browser console:
```js
pollingMode = 'live'; updatePollingIndicator();
```
Expected: green pulsing dot + "Auto-refresh: LIVE 30s" appears next to the Last updated timestamp.

```js
pollingMode = 'idle'; updatePollingIndicator();
```
Expected: amber dot + "Auto-refresh: idle (5min)".

```js
pollingMode = null; updatePollingIndicator();
```
Expected: grey dot + "Auto-refresh: off".

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add updatePollingIndicator for status dot display"
```

---

## Task 8: stopPolling(), setPollingMode(), startPolling()

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — add after `updatePollingIndicator()`

- [ ] **Step 1: Add the three functions**
```js
// ══════════════════════════════════════════
// POLLING ENGINE — STATE MACHINE
// ══════════════════════════════════════════
function stopPolling() {
  clearInterval(pollingTimer);
  pollingTimer = null;
  pollingMode = null;
  updatePollingIndicator();
}

function setPollingMode(mode) {
  if (pollingMode === mode) return;   // no-op if already in this mode
  pollingMode = mode;
  clearInterval(pollingTimer);
  const delay = mode === 'live' ? 30_000 : 5 * 60_000;
  pollingTimer = setInterval(pollTick, delay);
  updatePollingIndicator();
}

function startPolling() {
  if (currentCompetition !== 'wc') return;  // PL mode has no live WC fixtures
  stopPolling();
  pollTick();              // fire immediately — don't wait for first interval
  setPollingMode('idle'); // start on idle cadence; upgrades to live if match found
  startUpdatedCounter();
}
```

- [ ] **Step 2: Verify in console**

```js
// startPolling() calls pollTick() which isn't defined yet — that's expected to fail here.
// Just verify the functions exist:
typeof stopPolling    // → "function"
typeof setPollingMode // → "function"
typeof startPolling   // → "function"
```

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add stopPolling, setPollingMode, startPolling state machine"
```

---

## Task 9: pollTick()

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — add after `startPolling()`

- [ ] **Step 1: Add the function**
```js
async function pollTick() {
  if (pollInFlight) return;   // guard: skip if previous fetch still running
  pollInFlight = true;
  try {
    // 1. Fetch fixtures — populates liveEventCache + allEventsCache as side-effect
    await fetchFootballData();

    // 2. Switch polling cadence based on live events
    setPollingMode(liveEventCache.length > 0 ? 'live' : 'idle');

    // 3. Render live ticker with current caches
    renderLiveTicker();

    // 4. Rebuild standings if Score Table is in live mode
    if (scoreTableMode === 'live' && apiStandingsCache && apiStandingsCache.length > 0) {
      renderScoreTable();
    }

    // 5. Refresh odds (Option A: same cadence as fixtures)
    await fetchLiveOdds();

    // 6. Update live badge + last-refresh timestamp
    setLiveBadge(true);
    lastPollTime = Date.now();
    const now = new Date();
    const timeEl = document.getElementById('lastRefreshTime');
    if (timeEl) {
      timeEl.textContent = `Last updated: ${now.toLocaleDateString('en-US',{month:'short',day:'numeric'})} at ${now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`;
    }
    localStorage.setItem('wce_last_refresh', now.toISOString());

    // 7. Reset "updated X ago" counter
    resetUpdatedCounter();

  } catch (err) {
    logLive(`⚠️ Poll tick error: ${err.message}`);
    // Don't change pollingMode on error — keep current cadence
  } finally {
    pollInFlight = false;
  }
}
```

- [ ] **Step 2: Verify**

In browser console:
```js
await pollTick();
```
Expected:
- Live log shows fetch activity
- `allEventsCache.length` > 0
- `lastPollTime` is a recent timestamp (not null)
- `#lastRefreshTime` text updated
- `#pollingStatus` shows amber "idle" or green "LIVE" dot depending on match state

- [ ] **Step 3: Commit**
```bash
git add WorldCup2026_Dashboard.html
git commit -m "feat: add pollTick — core polling function"
```

---

## Task 10: Wire Startup, switchCompetition, Visibility API

**Files:**
- Modify: `WorldCup2026_Dashboard.html` — three locations

- [ ] **Step 1: Update switchCompetition()**

Find:
```js
function switchCompetition(comp) {
  if (comp === currentCompetition) return;
  currentCompetition = comp;
  localStorage.setItem('wce_competition', comp);
  applyCompetitionUI(comp);
  renderMatchLines();
  renderValueBets();
  renderBookComp();
  renderIntelligence();
  fetchLiveOdds();
  fetchFootballData();
}
```

Replace with:
```js
function switchCompetition(comp) {
  if (comp === currentCompetition) return;
  currentCompetition = comp;
  localStorage.setItem('wce_competition', comp);
  applyCompetitionUI(comp);
  renderMatchLines();
  renderValueBets();
  renderBookComp();
  renderIntelligence();
  if (comp === 'wc') {
    startPolling();                // restarts full polling engine for WC
  } else {
    stopPolling();                 // no live polling in PL mode
    fetchLiveOdds();               // one-shot PL odds fetch
    fetchFootballData();           // one-shot for context
  }
}
```

- [ ] **Step 2: Replace the page-load setTimeout with startPolling()**

Find:
```js
  // Auto-activate on every page load — keys are pre-loaded
  setTimeout(async () => {
    logLive('🔄 WorldCup Edge — connecting live data sources...');
    const oddsOk = await fetchLiveOdds();
    if (oddsOk) {
      setLiveBadge(true);
      const now = new Date();
      const timeEl = document.getElementById('lastRefreshTime');
      if (timeEl) timeEl.textContent = `Last updated: ${now.toLocaleDateString('en-US',{month:'short',day:'numeric'})} at ${now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`;
      localStorage.setItem('wce_last_refresh', now.toISOString());
      logLive('✅ Live Mode active. Odds data refreshed.');
    }
    const fbOk = await fetchFootballData();
    if (fbOk) logLive('✅ Fixture data loaded from API-Football.');
  }, 1000);
```

Replace with:
```js
  // Auto-activate on every page load — polling engine handles all fetches
  setTimeout(() => {
    logLive('🔄 WorldCup Edge — live data engine starting...');
    startPolling();
  }, 1000);
```

- [ ] **Step 3: Add Page Visibility API listener**

Find the closing lines of the file:
```js
})();
</script>
```

Add between `})();` and `</script>`:
```js

// ── Pause polling when browser tab is hidden; resume on focus ──
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
    logLive('⏸ Polling paused — tab hidden.');
  } else {
    if (currentCompetition === 'wc') {
      logLive('▶️ Polling resumed — tab visible.');
      startPolling();
    }
  }
});
```

- [ ] **Step 4: Full integration test**

Reload the page. Check:

1. **Console / Live Log**: "live data engine starting..." appears ~1s after load, followed by fixture and odds fetch activity
2. **`#pollingStatus`**: amber "Auto-refresh: idle (5min)" dot appears next to Last updated
3. **`#lastRefreshTime`**: shows current time after first tick completes
4. **Predictions tab**: scroll to top — ticker is hidden (State 3) since no live matches
5. **Console**: `liveEventCache.length` → 0 when no match live; > 0 during live match
6. **Background pause**: switch to another browser tab for 5s, come back — Live Log shows "Polling paused" then "resumed"
7. **Competition switch**: click PL mode → Live Log quiet, no polling. Click WC → polling resumes
8. **Manual ticker test**:
```js
liveEventCache = [
  { homeTeam:{name:'Spain'}, awayTeam:{name:'Cape Verde'}, homeScore:{current:2}, awayScore:{current:0}, time:{played:67} },
  { homeTeam:{name:'France'}, awayTeam:{name:'Iraq'}, homeScore:{current:1}, awayScore:{current:1}, time:{played:43} }
];
renderLiveTicker();
```
Expected: ticker appears with two rows, pulsing red LIVE dot, "2 matches" count

- [ ] **Step 5: Commit and push**
```bash
cd "/Users/panagiotis/Desktop/jobs/World cup"
git add WorldCup2026_Dashboard.html
git commit -m "feat: wire live polling engine to page load, switchCompetition, and visibility API"
git push origin main
```

---

## Self-Review

**Spec coverage check:**
- ✅ Dual-timer (30s live / 5min idle) → `setPollingMode()` in Task 8
- ✅ `startPolling()` fires `pollTick()` immediately then sets idle cadence → Task 8
- ✅ `stopPolling()` clears timer, resets mode → Task 8
- ✅ Page visibility pause/resume → Task 10 Step 3
- ✅ `pollInFlight` guard → Task 9
- ✅ Fixture fetch populates caches → Task 4
- ✅ Mode switches based on liveEventCache → Task 9
- ✅ Standings rebuilt if live tab active → Task 9
- ✅ Odds fetched same tick (Option A) → Task 9
- ✅ Timestamp + badge updated per tick → Task 9
- ✅ `switchCompetition` wired → Task 10 Step 1
- ✅ Page load init replaced → Task 10 Step 2
- ✅ Ticker State 1 (live) → Task 5
- ✅ Ticker State 2 (next match today) → Task 5
- ✅ Ticker State 3 (hidden) → Task 5
- ✅ "Updated X ago" counter → Task 6
- ✅ `#pollingStatus` indicator → Task 7 + Task 2
- ✅ Ticker HTML element → Task 2
- ✅ CSS + animation → Task 1

**Placeholder scan:** No TBDs or TODOs. All steps have complete code.

**Type consistency:**
- `liveEventCache` — defined Task 3, populated Task 4, read Task 5 + Task 9 ✅
- `allEventsCache` — defined Task 3, populated Task 4, read Task 5 ✅
- `pollInFlight` — defined Task 3, used Task 9 ✅
- `pollingMode` — defined Task 3, set Task 8, read Task 7 ✅
- `pollingTimer` — defined Task 3, managed Task 8 ✅
- `secondsSinceUpdate` / `updatedCounterInterval` — defined Task 3, used Task 6 ✅
- `renderLiveTicker()` — defined Task 5, called Task 9 ✅
- `startUpdatedCounter()` / `resetUpdatedCounter()` — defined Task 6, called Task 8 + Task 9 ✅
- `updatePollingIndicator()` — defined Task 7, called Task 8 ✅
- `stopPolling()` / `setPollingMode()` / `startPolling()` — defined Task 8, called Task 9 + Task 10 ✅
- `pollTick()` — defined Task 9, called Task 8 (`setInterval`) + Task 10 (`startPolling`) ✅
