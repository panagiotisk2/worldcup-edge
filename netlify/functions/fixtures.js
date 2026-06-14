// Netlify Function — SportAPI Fixtures Proxy
// Fetches live events + every date from tournament start (Jun 11 2026) through today.
// This gives the client all finished WC matches for auto-building live standings.
// Phase 2: swap for FastAPI on Hetzner.

exports.handler = async (event) => {
  if (!process.env.RAPIDAPI_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'RAPIDAPI_KEY not configured in Netlify environment variables.' }),
    };
  }

  const headers = {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'sportapi7.p.rapidapi.com',
  };

  // Returns { events, _status, _error } — status/error fields are for debug only
  const fetchJson = async (url) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { events: [], _status: res.status, _error: body.slice(0, 200) };
      }
      return await res.json();
    } catch (e) {
      return { events: [], _status: 0, _error: e.message };
    }
  };

  // Build all dates from tournament start to today (max 40 = full group stage)
  const tournamentStart = new Date('2026-06-11');
  const today = new Date();
  const dates = [];
  for (let d = new Date(tournamentStart); d <= today && dates.length < 40; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  try {
    // Fetch live events + scheduled/finished for each date in parallel
    const [liveData, ...schedResults] = await Promise.all([
      fetchJson('https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live'),
      ...dates.map(d => fetchJson(`https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${d}`)),
    ]);

    // Collect any API errors for debug
    const apiErrors = [];
    if (liveData._status) apiErrors.push({ url: 'live', status: liveData._status, error: liveData._error });
    schedResults.forEach((r, i) => {
      if (r._status) apiErrors.push({ url: dates[i], status: r._status, error: r._error });
    });

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
        // debug fields — remove once fixed
        _apiErrors: apiErrors,
        _keyPrefix: process.env.RAPIDAPI_KEY ? process.env.RAPIDAPI_KEY.slice(0, 8) + '...' : 'MISSING',
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
