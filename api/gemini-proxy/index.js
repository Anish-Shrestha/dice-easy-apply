module.exports = async function (context, req) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'GEMINI_API_KEY not configured on server' }
    };
    return;
  }

  const body = req.body || {};
  const { contents, model } = body;

  if (!contents || !Array.isArray(contents)) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'contents array is required' }
    };
    return;
  }

  const models = [model || 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      const data = await response.json();

      if (!response.ok) {
        // If rate limited or overloaded, try next model
        if (response.status === 429 || response.status === 503) {
          lastError = { status: response.status, message: data.error?.message || 'Model overloaded' };
          continue;
        }
        context.res = {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
          body: { error: data.error?.message || 'Gemini API error' }
        };
        return;
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: data
      };
      return;
    } catch (error) {
      lastError = { status: 500, message: error.message };
      continue;
    }
  }

  // All models failed
  context.res = {
    status: lastError?.status || 503,
    headers: { 'Content-Type': 'application/json' },
    body: { error: lastError?.message || 'All Gemini models are currently unavailable. Please try again.' }
  };
};
