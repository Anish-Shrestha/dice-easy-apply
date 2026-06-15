const { getAllJobs, importJobs, getSearchTerms, getUserByToken } = require('../shared/storage');

const DEFAULT_SEARCH_TERMS = [
  'firmware embedded engineer',
  'embedded IoT engineer',
  'embedded systems engineer RTOS C'
];

const EXCLUSION_PATTERNS = [
  /\bU\.?S\.?\s*Person\b/i,
  /\bGreen Card only\b/i,
  /\bITAR\b/i,
  /\bexport control\b/i,
  /\bSecret\b/i,
  /\bTop Secret\b/i,
  /\bPublic Trust\b/i,
  /\bclearable\b/i,
  /\bsecurity clearance\b/i,
  /\bsecret clearance\b/i,
  /\bTS\/?SCI\b/i,
  /\bUS citizens only\b/i,
  /\bUS citizen only\b/i,
  /\bcitizenship required\b/i,
  /\bno sponsorship\b/i,
  /\bnot sponsor\w*\b/i
];

function isExcluded(text) {
  if (!text) return false;
  return EXCLUSION_PATTERNS.some(p => p.test(text));
}

function buildSearchUrl(term, employmentType, page) {
  const encoded = encodeURIComponent(term);
  let url = `https://www.dice.com/jobs?q=${encoded}&filters.easyApply=true&filters.employmentType=${employmentType}`;
  if (page > 1) url += `&page=${page}`;
  return url;
}

function inferWorkType(text) {
  const val = (text || '').toLowerCase();
  if (val.includes('remote')) return 'Remote';
  if (val.includes('hybrid')) return 'Hybrid';
  if (val.includes('onsite') || val.includes('on-site') || val.includes('on site')) return 'Onsite';
  return 'Unknown';
}

function parseJobCards(html) {
  const jobs = [];

  // Split by listitem role markers
  const blocks = html.split(/(?=<div role="listitem">)/);
  const cardBlocks = blocks.filter(b => b.includes('data-testid="job-card"'));

  for (const card of cardBlocks) {
    // Extract link
    const linkMatch = card.match(/data-testid="job-search-job-card-link"[^>]*href="(https:\/\/www\.dice\.com\/job-detail\/[^"]+)"/);
    if (!linkMatch) continue;
    const link = linkMatch[1].trim();

    // Extract title
    let title = '';
    const titleMatch = card.match(/data-testid="job-search-job-card-link"[^>]*>([^<]+)<\/a>/);
    if (titleMatch) title = titleMatch[1].trim();

    if (!title) {
      const ariaMatch = card.match(/aria-label="View Details for\s+([^"]+)"/i);
      if (ariaMatch) title = ariaMatch[1].replace(/\s*\([A-Za-z0-9\-]+\)\s*$/, '').trim();
    }

    if (!title) {
      const headerMatch = card.match(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/i);
      if (headerMatch) title = headerMatch[1].trim();
    }

    if (!title) title = 'Untitled Position';

    // Extract company
    let company = '';
    const companyMatch = card.match(/companyname=([^"&]+)/);
    if (companyMatch) company = decodeURIComponent(companyMatch[1]).trim();

    // Extract location
    let location = '';
    const locationMatch = card.match(/<p class="text-sm font-normal text-zinc-600">([^<]+)<\/p>/);
    if (locationMatch) location = locationMatch[1].trim();

    // Extract salary
    let salary = '';
    const salaryMatch = card.match(/id="salary-label"[^>]*>([^<]+)<\/p>/);
    if (salaryMatch) {
      salary = salaryMatch[1].trim();
    } else {
      const inlineSalary = card.match(/\$\d{2,3}(?:,\d{3})?(?:\s*-\s*\$\d{2,3}(?:,\d{3})?)?/);
      if (inlineSalary) salary = inlineSalary[0].trim();
    }

    // Plain text for exclusion check
    const plainText = card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (isExcluded(title + ' ' + plainText)) continue;

    const workType = inferWorkType(location + ' ' + plainText);

    jobs.push({ link, role: title, company, location, salary, workType, summary: '', score: 0 });
  }

  return jobs;
}

async function fetchSearchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.dice.com/'
      }
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    return null;
  }
}

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const body = req.body || {};
    const maxPages = Math.min(Math.max(body.maxSearchPages || 3, 1), 10);
    const searchTerms = Array.isArray(body.searchTexts) && body.searchTexts.length > 0
      ? body.searchTexts.filter(t => t && t.trim())
      : (body.searchText ? [body.searchText.trim()] : null);

    // If no explicit terms provided, load from storage table
    let resolvedTerms = searchTerms;
    if (!resolvedTerms) {
      const storedTerms = await getSearchTerms(user?.email);
      const enabledTerms = storedTerms.filter(t => t.enabled).map(t => t.text);
      resolvedTerms = enabledTerms.length > 0 ? enabledTerms : DEFAULT_SEARCH_TERMS;
    }

    // Get existing job links to deduplicate
    const existingJobs = await getAllJobs(user?.email);
    const existingLinks = new Set(existingJobs.map(j => j.link));

    const employmentTypes = ['FULLTIME', 'CONTRACT', 'THIRD_PARTY'];
    const newJobs = [];
    const seenLinks = new Set();
    let scannedPages = 0;
    let scannedCards = 0;

    for (const term of resolvedTerms) {
      for (const empType of employmentTypes) {
        for (let page = 1; page <= maxPages; page++) {
          const url = buildSearchUrl(term, empType, page);
          const html = await fetchSearchPage(url);
          if (!html) break;

          scannedPages++;
          const jobs = parseJobCards(html);
          scannedCards += jobs.length;

          if (jobs.length === 0) break;

          for (const job of jobs) {
            if (existingLinks.has(job.link) || seenLinks.has(job.link)) continue;
            seenLinks.add(job.link);
            job.status = 'To Apply';
            job.dateAdded = new Date().toISOString().split('T')[0];
            job.dateUpdated = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
            newJobs.push(job);
          }
        }
      }
    }

    // Import new jobs to storage
    let imported = 0;
    if (newJobs.length > 0) {
      const result = await importJobs(newJobs, user?.email);
      imported = result.imported;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        refreshed: true,
        newLeads: imported,
        total: existingJobs.length + imported,
        scannedPages,
        scannedCards,
        searchTerms: resolvedTerms
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message || 'Failed to refresh from Dice' }
    };
  }
};
