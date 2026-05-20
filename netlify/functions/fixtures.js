// Netlify Function — SportAPI Fixtures Proxy
// Uses SportAPI (sportapi7.p.rapidapi.com) — subscribed via RapidAPI Hub.
// API key lives in Netlify env vars (RAPIDAPI_KEY), never exposed to the browser.
// Phase 2: swap this whole function for a FastAPI endpoint on Hetzner.

exports.handler = async (event) => {
  const { date } = event.queryStringParameters || {};

  if (!process.env.RAPIDAPI_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'RAPIDAPI_KEY not configured in Netlify environment variables.' }),
    };
  }

  try {
    // Fetch live football events from SportAPI
    const liveUrl = 'https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live';
    const liveRes = await fetch(liveUrl, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'sportapi7.p.rapidapi.com',
      },
    });
    const liveData = await liveRes.json();

    // Also fetch scheduled events for today
    const today = date || new Date().toISOString().split('T')[0];
    const schedUrl = `https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${today}`;
    const schedRes = await fetch(schedUrl, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'sportapi7.p.rapidapi.com',
      },
    });
    const schedData = await schedRes.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'x-ratelimit-requests-remaining': liveRes.headers.get('x-ratelimit-requests-remaining') || '',
      },
      body: JSON.stringify({
        live: liveData.events || [],
        scheduled: schedData.events || [],
        date: today,
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
