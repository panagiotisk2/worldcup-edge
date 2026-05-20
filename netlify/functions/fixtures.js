// Netlify Function — API-Football Fixtures Proxy
// API key lives in Netlify env vars (RAPIDAPI_KEY), never exposed to the browser.
// Phase 2: swap this whole function for a FastAPI endpoint on Hetzner.

exports.handler = async (event) => {
  const { league = '1', season = '2026', next = '20' } = event.queryStringParameters || {};

  if (!process.env.RAPIDAPI_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'RAPIDAPI_KEY not configured in Netlify environment variables.' }),
    };
  }

  try {
    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${league}&season=${season}&next=${next}`;
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      },
    });
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Forward rate limit headers
        'x-ratelimit-requests-remaining': response.headers.get('x-ratelimit-requests-remaining') || '',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Fixtures API fetch failed: ${err.message}` }),
    };
  }
};
