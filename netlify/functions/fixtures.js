// Netlify Function — SportAPI Fixtures Proxy
// Fetches: live events + last 4 days of results (for auto-resolve) + today's schedule.
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

  const fetchJson = async (url) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return { events: [] };
      return await res.json();
    } catch {
      return { events: [] };
    }
  };

  // Build date strings for today + last 4 days (to pick up finished matches)
  const today = new Date();
  const dates = [];
  for (let i = 0; i <= 4; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  try {
    // Parallel: live events + scheduled/finished for each of the last 4 days
    const [liveData, ...schedResults] = await Promise.all([
      fetchJson('https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live'),
      ...dates.map(d => fetchJson(`https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${d}`)),
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'x-ratelimit-requests-remaining': '',
      },
      body: JSON.stringify({
        live: liveEvents,
        scheduled: scheduledEvents,
        all: allEvents,
        date: dates[0],
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
