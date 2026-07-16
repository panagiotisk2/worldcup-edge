// Netlify Function — SportAPI Fixtures Proxy
// Fetches live events + every date from tournament start (Jun 11 2026) through today.
// This gives the client all finished WC matches for auto-building live standings.
//
// Fallback: if SportAPI (RapidAPI) returns 0 events, retries via football-data.org.
// Requires FOOTBALL_DATA_API_KEY env var (free tier at football-data.org covers WC).
// The fallback normalises football-data.org events into the same SportAPI shape so
// update_result.js requires no changes.
//
// Phase 2: swap for FastAPI on Hetzner.

exports.handler = async (event) => {
  if (!process.env.RAPIDAPI_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'RAPIDAPI_KEY not configured in Netlify environment variables.' }),
    };
  }

  const rapidHeaders = {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'sportapi7.p.rapidapi.com',
  };

  const fetchJson = async (url, headers = {}) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return { events: [] };
      return await res.json();
    } catch {
      return { events: [] };
    }
  };

  // Build all dates from tournament start to today (max 40 = full group stage)
  const tournamentStart = new Date('2026-06-11');
  const today = new Date();
  const dates = [];
  for (let d = new Date(tournamentStart); d <= today && dates.length < 40; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  // ── Primary: SportAPI via RapidAPI ────────────────────────────────────────

  try {
    const [liveData, ...schedResults] = await Promise.all([
      fetchJson('https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live', rapidHeaders),
      ...dates.map(d => fetchJson(`https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${d}`, rapidHeaders)),
    ]);

    const liveEvents = liveData.events || [];
    const scheduledEvents = schedResults.flatMap(r => r.events || []);

    // Deduplicate by event id
    const seen = new Set();
    const allEvents = [];
    for (const ev of [...liveEvents, ...scheduledEvents]) {
      const id = ev.id || ev.fixture?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      allEvents.push(ev);
    }

    // If we got events, return immediately
    if (allEvents.length > 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=120', // 2-min cache
        },
        body: JSON.stringify({
          live: liveEvents,
          scheduled: scheduledEvents,
          all: allEvents,
          date: today.toISOString().split('T')[0],
          datesChecked: dates.length,
          source: 'sportapi',
        }),
      };
    }

    // ── Fallback: football-data.org ─────────────────────────────────────────
    // SportAPI returned 0 events — quota likely exhausted. Try football-data.org.

    const fdKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!fdKey) {
      // No fallback key — return empty so the caller can fail loudly
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          live: [], scheduled: [], all: [],
          date: today.toISOString().split('T')[0],
          datesChecked: dates.length,
          source: 'sportapi',
          warning: 'SportAPI returned 0 events and FOOTBALL_DATA_API_KEY is not set.',
        }),
      };
    }

    const todayStr = today.toISOString().split('T')[0];
    const fdUrl = `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=2026-06-11&dateTo=${todayStr}`;
    const fdData = await fetchJson(fdUrl, { 'X-Auth-Token': fdKey });
    const fdMatches = fdData.matches || [];

    // Normalise football-data.org matches → SportAPI v1 shape
    // so update_result.js needs no changes.
    const normalised = fdMatches.map(m => {
      const duration = m.score?.duration; // 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
      let statusType;
      if (m.status === 'FINISHED') {
        if (duration === 'PENALTY_SHOOTOUT') statusType = 'afterPenalties';
        else if (duration === 'EXTRA_TIME')   statusType = 'afterExtraTime';
        else                                   statusType = 'finished';
      } else if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
        statusType = 'inprogress';
      } else {
        statusType = 'notstarted';
      }

      return {
        id: `fd_${m.id}`,
        homeTeam: { name: m.homeTeam?.name },
        awayTeam: { name: m.awayTeam?.name },
        homeScore: {
          current: m.score?.fullTime?.home ?? null,
          penalties: m.score?.penalties?.home ?? null,
        },
        awayScore: {
          current: m.score?.fullTime?.away ?? null,
          penalties: m.score?.penalties?.away ?? null,
        },
        status: { type: statusType },
        _source: 'football-data.org',
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
      body: JSON.stringify({
        live: normalised.filter(e => e.status.type === 'inprogress'),
        scheduled: normalised,
        all: normalised,
        date: todayStr,
        datesChecked: dates.length,
        source: 'football-data.org',
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Fixtures fetch failed: ${err.message}` }),
    };
  }
};
