#!/usr/bin/env node
/**
 * update_result.js
 *
 * Fetches live fixtures via the Netlify proxy, detects finished watched matches,
 * and patches WorldCup2026_Dashboard.html in-place.
 *
 * Designed to be run by GitHub Actions. Sets the output `changed=true` when it
 * makes an edit so the workflow can decide whether to commit.
 *
 * Future championships: add entries to scripts/matches_config.json only.
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ────────────────────────────────────────────────────────────────

function setOutput(name, value) {
  // GitHub Actions output via $GITHUB_OUTPUT env file
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`[output] ${name}=${value}`);
}

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');
}

function teamsMatch(apiName, candidates) {
  const n = normalize(apiName);
  return candidates.some(c => normalize(c) === n || n.includes(normalize(c)) || normalize(c).includes(n));
}

// Detect a "finished" status across both API flavours SportAPI uses
function isFinished(event) {
  // SportAPI v1 style
  const type = event.status?.type;
  if (type === 'finished' || type === 'afterExtraTime' || type === 'afterPenalties' ||
      type === 'canceled' /* skip */ ) {
    return type !== 'canceled';
  }
  // Sometimes status has a code integer
  const code = event.status?.code;
  if (code === 100 || code === 110 || code === 120) return true;
  return false;
}

function getScore(event) {
  // SportAPI v1 — homeScore.current is goals after 90 min (or AET for ET/pens matches)
  // homeScore.penalties is the penalty shootout score (only present for afterPenalties)
  if (event.homeScore !== undefined) {
    return {
      home: event.homeScore?.current ?? event.homeScore,
      away: event.awayScore?.current ?? event.awayScore,
      homePens: event.homeScore?.penalties ?? null,
      awayPens: event.awayScore?.penalties ?? null,
    };
  }
  // goals (football-data / alternate)
  if (event.goals !== undefined) {
    return {
      home: event.goals?.home,
      away: event.goals?.away,
      homePens: null,
      awayPens: null,
    };
  }
  return null;
}

function getStatusType(event) {
  return event.status?.type || null;
}

function getTeams(event) {
  // SportAPI v1
  if (event.homeTeam) return { home: event.homeTeam.name, away: event.awayTeam?.name };
  // alternate
  if (event.teams) return { home: event.teams.home?.name, away: event.teams.away?.name };
  return null;
}

// ── fetch fixtures ─────────────────────────────────────────────────────────

async function fetchFixtures(url) {
  console.log(`[fetch] ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ── patch HTML file ────────────────────────────────────────────────────────

function patchDashboard(filePath, match, score, statusType) {
  let html = fs.readFileSync(filePath, 'utf8');
  const original = html;

  const hg = score.home;
  const ag = score.away;
  const isAET = statusType === 'afterExtraTime';
  const isPens = statusType === 'afterPenalties';

  // Determine actual winner — for pens, goals are tied so use penalty scores
  let homeWon, awayWon;
  if (isPens && score.homePens != null && score.awayPens != null) {
    homeWon = score.homePens > score.awayPens;
    awayWon = score.awayPens > score.homePens;
    console.log(`[info] Penalty shootout: ${score.homePens}-${score.awayPens}`);
  } else {
    homeWon = hg > ag;
    awayWon = ag > hg;
  }

  // Build display score string
  let scoreStr = `${hg}-${ag}`;
  if (isAET) scoreStr += ' AET';
  if (isPens && score.homePens != null) scoreStr += ` (${score.homePens}-${score.awayPens} pens)`;

  // ── 1. completedResults: replace placeholder comment with result entry ──
  const placeholder = match.completedResultsPlaceholder;
  if (!html.includes(placeholder)) {
    console.log(`[skip] completedResults placeholder already replaced or not found`);
  } else {
    const home = match.homeTeams[0];
    const away = match.awayTeams[0];
    const resultEntry = `{ home:'${home}', away:'${away}', hg:${hg}, ag:${ag}, group:'${match.group}', date:'Jul 19' },`;
    html = html.replace(placeholder, resultEntry);
    console.log(`[patch] completedResults: inserted ${home} ${hg}-${ag} ${away}`);
  }

  // ── 2. matchLines: patch the Final entry (date → FT, add result, pick ✅/❌) ──
  // We look for the date field and home/away flags to locate the right object
  const { homeFlag, homeName, awayFlag, awayName, date: matchDate } = match.matchLinesSelector;
  const pickBase = match.pick;

  // Find the matchLines Final entry by its current date string (e.g. "Jul 19")
  // We'll do a targeted string replace on the pick line inside that block.
  // Strategy: find the block by a unique anchor, then replace pick and add result.
  const mlDatePattern = new RegExp(
    `(\\{[^}]*date:\\s*'${matchDate}'[^}]*home:\\s*'[^']*${homeName}[^']*'[^}]*pick:\\s*')(${pickBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})('\\s*,\\s*pickConf:\\s*'${match.pickConf}')`,
    's'
  );

  // Determine pick result emoji
  let pickResult;
  if (match.pick.toLowerCase().includes('spain ml') || match.pick.toLowerCase().includes('home ml')) {
    pickResult = homeWon ? '✅' : '❌';
  } else if (match.pick.toLowerCase().includes('argentina') || match.pick.toLowerCase().includes('away ml')) {
    pickResult = awayWon ? '✅' : '❌';
  } else if (match.pick.toLowerCase().includes('draw')) {
    pickResult = (!homeWon && !awayWon) ? '✅' : '❌';
  } else {
    pickResult = ''; // can't determine
  }

  // Replace the date from "Jul 19" to "Jul 19 FT" and add result field + pick emoji
  // Target the specific matchLines object for this match
  // Build a pattern that catches the entire object
  const mlBlockRegex = new RegExp(
    `(\\{\\s*date:\\s*')(${matchDate})(')([^}]*?home:\\s*'[^']*${homeName}[^']*'[^}]*?pick:\\s*')(${pickBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})('[^}]*?pickConf:\\s*'${match.pickConf}')(\\s*\\})`,
    's'
  );

  if (mlBlockRegex.test(html)) {
    html = html.replace(mlBlockRegex, (_, p1, _date, p3, p4, _pick, p6, p7) => {
      return `${p1}${matchDate} FT${p3}${p4}${pickBase} ${pickResult}${p6}, result:'${scoreStr}'${p7}`;
    });
    console.log(`[patch] matchLines: updated Final entry — ${scoreStr}, pick ${pickBase} ${pickResult}`);
  } else {
    // Fallback: simpler pattern — just replace date and pick without result field check
    const simpleDate = new RegExp(`(date:\\s*')(${matchDate})(')`, 'g');
    // Count matches to avoid replacing wrong entries — only replace the one near the Final flags
    const anchor = `${homeFlag} ${homeName}`;
    const anchorIdx = html.indexOf(anchor);
    if (anchorIdx !== -1) {
      // Find the nearest "date:'Jul 19'" before or after this anchor within 500 chars
      const chunk = html.slice(Math.max(0, anchorIdx - 300), anchorIdx + 500);
      const patched = chunk
        .replace(`date:'${matchDate}'`, `date:'${matchDate} FT'`)
        .replace(`pick:'${pickBase}'`, `pick:'${pickBase} ${pickResult}', result:'${scoreStr}'`);
      html = html.slice(0, Math.max(0, anchorIdx - 300)) + patched + html.slice(anchorIdx + 500);
      console.log(`[patch] matchLines: fallback patch applied`);
    } else {
      console.log(`[warn] matchLines: could not locate Final entry — check anchors`);
    }
  }

  // ── 3. Source note: update the last-updated summary line ──
  const sourceNotePatterns = [
    /('— SF complete\.[^']*')/,
    /('— All results up to[^']*')/,
    /('— Final complete\.[^']*')/,
  ];
  const winnerName = homeWon ? match.homeTeams[0] : (awayWon ? match.awayTeams[0] : null);
  const newNote = `'— Final complete. ${match.homeTeams[0]} ${scoreStr} ${match.awayTeams[0]}. ${winnerName ? winnerName + ' are World Champions 2026!' : 'No winner determined.'}'`;

  let notePatched = false;
  for (const pat of sourceNotePatterns) {
    if (pat.test(html)) {
      html = html.replace(pat, newNote);
      notePatched = true;
      console.log(`[patch] source note updated`);
      break;
    }
  }
  if (!notePatched) {
    console.log(`[warn] source note pattern not found — skipping`);
  }

  // ── 4. Final prediction card tip: mark result ──
  // Find the Final match card tip and mark it as resolved
  const finalTipPattern = /(tip:\s*')(✅[^']*Spain ML[^']*|Spain ML[^']*)(', tipClass)/;
  if (finalTipPattern.test(html)) {
    let winner;
    if (homeWon) winner = `Spain ${scoreStr} Argentina. Spain are World Champions! 🏆`;
    else if (awayWon) winner = `Argentina wins ${scoreStr} vs Spain. Argentina are World Champions! 🏆`;
    else winner = `${scoreStr} — result unclear`;
    html = html.replace(finalTipPattern, `$1✅ FT: ${winner}$3`);
    console.log(`[patch] prediction card tip updated`);
  }

  if (html === original) {
    console.log(`[info] No changes made to ${filePath}`);
    return false;
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[write] Saved ${filePath}`);
  return true;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const configPath = path.join(__dirname, 'matches_config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Allow overriding championship via env (for future use)
  const championshipId = process.env.CHAMPIONSHIP_ID || 'WC2026';
  const championship = config.championships.find(c => c.id === championshipId);
  if (!championship) {
    console.error(`[error] Championship "${championshipId}" not found in config`);
    process.exit(1);
  }

  console.log(`[start] Checking ${championship.name}`);

  // Fetch fixtures once — shared across all watched matches
  const data = await fetchFixtures(championship.fixturesUrl);
  const allEvents = data.all || data.events || [];
  console.log(`[info] Got ${allEvents.length} events (datesChecked: ${data.datesChecked ?? 'n/a'})`);

  // If the API returned 0 events the fixture proxy is broken (quota exhausted or API down).
  // The API always returns historical matches from tournament start, so 0 is never a valid
  // "no matches yet" response on or after the tournament start date.
  // Fail loudly so GitHub sends a failure email and the cron doesn't silently skip.
  if (allEvents.length === 0) {
    console.error('[error] Fixtures API returned 0 events — likely quota exhausted or API error.');
    console.error('[error] Check https://worldcup-edge.netlify.app/api/fixtures manually.');
    process.exit(1);
  }

  let anyChanged = false;

  for (const watchedMatch of championship.watchedMatches) {
    console.log(`\n[match] Checking: ${watchedMatch.homeTeams[0]} vs ${watchedMatch.awayTeams[0]} (${watchedMatch.stage})`);

    // Find the event
    const event = allEvents.find(ev => {
      const teams = getTeams(ev);
      if (!teams) return false;
      return (
        teamsMatch(teams.home, watchedMatch.homeTeams) &&
        teamsMatch(teams.away, watchedMatch.awayTeams)
      ) || (
        // also check reversed (in case API lists home/away differently)
        teamsMatch(teams.home, watchedMatch.awayTeams) &&
        teamsMatch(teams.away, watchedMatch.homeTeams)
      );
    });

    if (!event) {
      console.log(`[skip] Event not found in API response yet`);
      continue;
    }

    if (!isFinished(event)) {
      const status = event.status?.type || event.status?.code || 'unknown';
      console.log(`[skip] Match not finished yet (status: ${status})`);
      continue;
    }

    const score = getScore(event);
    if (score === null || score.home == null || score.away == null) {
      console.log(`[skip] Score not available`);
      continue;
    }

    // Handle reversed home/away from API
    const teams = getTeams(event);
    const isReversed = teamsMatch(teams.home, watchedMatch.awayTeams);
    const finalScore = isReversed
      ? { home: score.away, away: score.home, homePens: score.awayPens, awayPens: score.homePens }
      : score;

    const statusType = getStatusType(event);
    const statusLabel = statusType === 'afterPenalties' ? 'PENS' : statusType === 'afterExtraTime' ? 'AET' : 'FT';
    console.log(`[found] ${watchedMatch.homeTeams[0]} ${finalScore.home}-${finalScore.away} ${watchedMatch.awayTeams[0]} — ${statusLabel}`);

    const dashboardPath = path.join(__dirname, '..', championship.dashboardFile);
    const changed = patchDashboard(dashboardPath, watchedMatch, finalScore, statusType);
    if (changed) anyChanged = true;
  }

  setOutput('changed', anyChanged ? 'true' : 'false');

  if (!anyChanged) {
    console.log(`\n[done] No changes — match not finished yet or already patched`);
  } else {
    console.log(`\n[done] Dashboard updated successfully`);
  }
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
