module.exports = async function (context, req) {
  const link = req.query.link || '';

  if (!link || !/^https?:\/\//i.test(link)) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { description: '' }
    };
    return;
  }

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { description: '' }
      };
      return;
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { description: text.slice(0, 6000) }
    };
  } catch (error) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { description: '' }
    };
  }
};
