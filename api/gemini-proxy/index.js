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

  const modelName = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();

    if (!response.ok) {
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
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message || 'Failed to call Gemini API' }
    };
  }
};
