const { enrichJobRole } = require('../shared/storage');

function normalizeJobTitle(title) {
  return String(title || '')
    .replace(/\s*[-|\u2014]\s*Dice(?:\.com)?\s*$/i, '')
    .replace(/^\s*Dice\s*[-|\u2014]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html, key) {
  const safeKey = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${safeKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${safeKey}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*name=["']${safeKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${safeKey}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match && match[1]) return String(match[1]).trim();
  }
  return '';
}

async function fetchJobTitle(link) {
  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!response.ok) return '';
    const html = await response.text();

    const ogTitle = extractMetaContent(html, 'og:title');
    if (ogTitle) return normalizeJobTitle(ogTitle);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) return normalizeJobTitle(titleMatch[1]);

    return '';
  } catch (err) {
    return '';
  }
}

module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const link = (body.link || '').trim();

    if (!link) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'link is required' }
      };
      return;
    }

    const title = await fetchJobTitle(link);
    if (!title) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { updated: false, role: '', reason: 'title_not_found' }
      };
      return;
    }

    const result = await enrichJobRole(link, title);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message }
    };
  }
};
