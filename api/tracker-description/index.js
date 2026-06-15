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

    // Extract job title from page (Dice uses h1[data-cy="jobTitle"] or first <h1>)
    let role = '';
    const titleMatch = html.match(/<h1[^>]*data-cy=["']jobTitle["'][^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<h1[^>]*class=["'][^"']*jobTitle[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch && titleMatch[1]) {
      role = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { description: text.slice(0, 6000), role: role || '' }
    };
  } catch (error) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { description: '' }
    };
  }
};
