// Netlify Function — Live Odds Proxy
// API key lives in Netlify env vars (ODDS_API_KEY), never exposed to the browser.
// Phase 2: swap this whole function for a FastAPI endpoint on Hetzner.

exports.handler = async (event) => {
  const { sport = 'soccer_fifa_world_cup', markets = 'h2h', regions = 'eu,us' } = event.queryStringParameters || {};

  if (!process.env.ODDS_API_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ODDS_API_KEY not configured in Netlify environment variables.' }),
    };
  }

  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=decimal&dateFormat=iso`;
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Forward quota headers so the dashboard can display remaining requests
        'x-requests-remaining': response.headers.get('x-requests-remaining') || '',
        'x-requests-used': response.headers.get('x-requests-used') || '',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Odds API fetch failed: ${err.message}` }),
    };
  }
};
