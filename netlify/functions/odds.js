// Netlify Function — Live Odds Proxy
// Rotates across ODDS_API_KEY1 / ODDS_API_KEY2 / ODDS_API_KEY3.
// If a key is exhausted (429) or missing, the next one is tried automatically.
// Phase 2: swap this whole function for a FastAPI endpoint on Hetzner.

exports.handler = async (event) => {
  const { sport = 'soccer_fifa_world_cup', markets = 'h2h', regions = 'eu,us' } = event.queryStringParameters || {};

  const keys = [
    process.env.ODDS_API_KEY1,
    process.env.ODDS_API_KEY2,
    process.env.ODDS_API_KEY3,
  ].filter(Boolean); // drop any that aren't set

  if (keys.length === 0) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No Odds API keys configured (ODDS_API_KEY1 / KEY2 / KEY3).' }),
    };
  }

  let lastError = null;

  for (const key of keys) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${key}&regions=${regions}&markets=${markets}&oddsFormat=decimal&dateFormat=iso`;
      const response = await fetch(url);

      // 429 = quota exhausted for this key — try the next one
      if (response.status === 429) {
        lastError = `Key ending …${key.slice(-4)} quota exhausted, trying next key.`;
        continue;
      }

      const data = await response.json();

      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'x-requests-remaining': response.headers.get('x-requests-remaining') || '',
          'x-requests-used': response.headers.get('x-requests-used') || '',
          'x-key-index': String(keys.indexOf(key) + 1), // tells dashboard which key responded
        },
        body: JSON.stringify(data),
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  // All keys failed or exhausted
  return {
    statusCode: 429,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: `All Odds API keys exhausted or failed. Last error: ${lastError}` }),
  };
};
