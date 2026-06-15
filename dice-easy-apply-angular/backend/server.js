const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const PORT = 3001;
const TRACKER_CSV_PATH = path.resolve(__dirname, '..', '..', 'job_search', 'tracker', 'easy_apply_link_status.csv');
const JOB_DESCRIPTIONS_DIR = path.resolve(__dirname, '..', '..', 'job_search', 'job_descriptions');
const COVER_LETTERS_DIR = path.resolve(__dirname, '..', '..', 'cover_letters');
const EASY_APPLY_WORKFLOW_SCRIPT = path.resolve(__dirname, '..', '..', 'dice_workflow_easy_apply.ps1');
const FRONTEND_DIST_PATH = path.resolve(__dirname, '..', 'dist', 'dice-easy-apply-angular');

const STATIC_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

if (!fs.existsSync(COVER_LETTERS_DIR)) {
  fs.mkdirSync(COVER_LETTERS_DIR, { recursive: true });
}

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitTokens(value) {
  return normalizeText(value)
    .split('_')
    .map(token => token.trim())
    .filter(token => token.length >= 3);
}

function readLocalDescription(company, role) {
  if (!fs.existsSync(JOB_DESCRIPTIONS_DIR)) {
    return '';
  }

  const companyTokens = splitTokens(company);
  const roleTokens = splitTokens(role);
  const allFiles = fs.readdirSync(JOB_DESCRIPTIONS_DIR).filter(name => name.toLowerCase().endsWith('.txt'));

  if (allFiles.length === 0) {
    return '';
  }

  let bestFile = '';
  let bestScore = -1;

  for (const fileName of allFiles) {
    const normalizedFileName = normalizeText(fileName);
    let score = 0;

    for (const token of companyTokens) {
      if (normalizedFileName.includes(token)) score += 3;
    }

    for (const token of roleTokens) {
      if (normalizedFileName.includes(token)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestFile = fileName;
    }
  }

  if (!bestFile || bestScore <= 0) {
    return '';
  }

  try {
    const descriptionPath = path.join(JOB_DESCRIPTIONS_DIR, bestFile);
    return fs.readFileSync(descriptionPath, 'utf8').trim();
  } catch (error) {
    return '';
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toSafeFilePart(value, fallbackValue) {
  const normalized = normalizeText(value || fallbackValue || 'item');
  return normalized || fallbackValue || 'item';
}

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function saveCoverLetterTxt(company, role, content) {
  const fileName = `cover_letter_${nowStamp()}.txt`;
  const absolutePath = path.join(COVER_LETTERS_DIR, fileName);
  fs.writeFileSync(absolutePath, content || '', 'utf8');
  return path.join('cover_letters', fileName).replace(/\\/g, '/');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function tryServeFrontendAsset(req, res, pathname) {
  if (!fs.existsSync(FRONTEND_DIST_PATH)) {
    return false;
  }

  const sanitizedPath = (pathname || '/').replace(/\\/g, '/');
  const relativePath = sanitizedPath === '/' ? 'index.html' : sanitizedPath.replace(/^\//, '');
  const absolutePath = path.resolve(FRONTEND_DIST_PATH, relativePath);

  if (!absolutePath.startsWith(FRONTEND_DIST_PATH)) {
    return false;
  }

  const readAndSend = (targetPath) => {
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      return false;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = STATIC_CONTENT_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(targetPath);
    setCorsHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(content);
    return true;
  };

  if (readAndSend(absolutePath)) {
    return true;
  }

  return readAndSend(path.resolve(FRONTEND_DIST_PATH, 'index.html'));
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current);
  return cells;
}

function toCsvCell(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function toCsvRow(cells) {
  return cells.map(toCsvCell).join(',');
}

function normalizeStatus(statusValue) {
  const status = (statusValue || '').trim();
  if (!status) return 'To Apply';
  if (status === 'Applied' || status === 'Skipped' || status === 'Pending' || status === 'To Apply') {
    return status;
  }
  return 'To Apply';
}

function inferWorkType(text) {
  const value = (text || '').toLowerCase();
  if (value.includes('remote')) return 'Remote';
  if (value.includes('hybrid')) return 'Hybrid';
  if (value.includes('onsite') || value.includes('on-site') || value.includes('on site')) return 'Onsite';
  return 'Unknown';
}

function readTrackerJobs() {
  if (!fs.existsSync(TRACKER_CSV_PATH)) {
    throw new Error(`Tracker file not found at ${TRACKER_CSV_PATH}`);
  }

  const rawCsv = fs.readFileSync(TRACKER_CSV_PATH, 'utf8');
  const lines = rawCsv.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const jobs = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};

    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = values[h] || '';
    }

    const link = (row.Link || '').trim();
    if (!link) continue;

    const role = (row.Role || '').trim();
    const company = (row.Company || '').trim();
    const location = (row.Location || '').trim();
    const salary = (row.Salary || '').trim();
    const summary = (row.Summary || '').trim();
    const status = normalizeStatus(row.Status);
    const score = Number.parseInt(row.Score || '0', 10) || 0;
    const workType = (row.WorkType || '').trim() || inferWorkType(`${location} ${summary}`);

    jobs.push({
      link,
      role,
      company,
      location,
      salary,
      workType,
      score,
      summary,
      status,
      dateAdded: (row.Date || '').trim(),
      dateUpdated: (row.UpdatedAt || row.Date || '').trim()
    });
  }

  jobs.sort((a, b) => {
    if (a.status === 'To Apply' && b.status !== 'To Apply') return -1;
    if (a.status !== 'To Apply' && b.status === 'To Apply') return 1;
    return (b.score || 0) - (a.score || 0);
  });

  return jobs;
}

async function getDescriptionForLink(link) {
  if (!link || !/^https?:\/\//i.test(link)) {
    return '';
  }

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return '';
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 6000);
  } catch (error) {
    return '';
  }
}

function normalizeJobTitle(title) {
  return String(title || '')
    .replace(/\s*[\-|\u2014]\s*Dice(?:\.com)?\s*$/i, '')
    .replace(/^\s*Dice\s*[\-|\u2014]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContentByNameOrProperty(html, key) {
  const safeKey = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${safeKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${safeKey}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*name=["']${safeKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${safeKey}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }

  return '';
}

function extractJobTitleFromHtml(html) {
  const text = String(html || '');

  const ogTitle = extractMetaContentByNameOrProperty(text, 'og:title');
  if (ogTitle) {
    return normalizeJobTitle(ogTitle);
  }

  const twitterTitle = extractMetaContentByNameOrProperty(text, 'twitter:title');
  if (twitterTitle) {
    return normalizeJobTitle(twitterTitle);
  }

  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return normalizeJobTitle(titleMatch[1]);
  }

  return '';
}

async function fetchJobTitle(link) {
  if (!link || !/^https?:\/\//i.test(link)) {
    return '';
  }

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.dice.com/'
      }
    });

    if (!response.ok) {
      return fetchJobTitleViaPowerShell(link);
    }

    const html = await response.text();
    const directTitle = extractJobTitleFromHtml(html);
    if (directTitle) {
      return directTitle;
    }

    return fetchJobTitleViaPowerShell(link);
  } catch (error) {
    return fetchJobTitleViaPowerShell(link);
  }
}

function fetchJobTitleViaPowerShell(link) {
  if (process.platform !== 'win32') {
    return '';
  }

  const safeLink = String(link || '').replace(/'/g, "''");
  const script = [
    `$u='${safeLink}'`,
    "$r=Invoke-WebRequest -Uri $u -Headers @{ 'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; 'Accept-Language'='en-US,en;q=0.9' } -UseBasicParsing",
    "$og=[regex]::Match($r.Content,'<meta[^>]+property=\"og:title\"[^>]+content=\"([^\"]+)\"','IgnoreCase').Groups[1].Value",
    "$ti=[regex]::Match($r.Content,'<title[^>]*>(.*?)</title>','IgnoreCase,Singleline').Groups[1].Value",
    "if (-not [string]::IsNullOrWhiteSpace($og)) { Write-Output $og } elseif (-not [string]::IsNullOrWhiteSpace($ti)) { Write-Output $ti }"
  ].join('; ');

  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    return '';
  }

  return normalizeJobTitle(String(result.stdout || '').trim());
}

async function backfillMissingRolesInTracker(maxRowsToFix = 20) {
  if (!fs.existsSync(TRACKER_CSV_PATH)) {
    return { fixed: 0, checked: 0 };
  }

  const rawCsv = fs.readFileSync(TRACKER_CSV_PATH, 'utf8');
  const eol = rawCsv.includes('\r\n') ? '\r\n' : '\n';
  const lines = rawCsv.split(/\r?\n/);
  if (lines.length === 0) {
    return { fixed: 0, checked: 0 };
  }

  const headers = parseCsvLine(lines[0]);
  const linkIdx = headers.findIndex(h => h.trim() === 'Link');
  const roleIdx = headers.findIndex(h => h.trim() === 'Role');
  const updatedAtIdx = headers.findIndex(h => h.trim() === 'UpdatedAt');

  if (linkIdx < 0 || roleIdx < 0) {
    return { fixed: 0, checked: 0 };
  }

  const targets = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line);
    const role = (cells[roleIdx] || '').trim();
    const link = (cells[linkIdx] || '').trim();
    if (!role && link) {
      targets.push({ lineIdx: i, cells, link });
      if (targets.length >= maxRowsToFix) {
        break;
      }
    }
  }

  if (!targets.length) {
    return { fixed: 0, checked: 0 };
  }

  const updatedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  let fixed = 0;

  for (const target of targets) {
    const title = await fetchJobTitle(target.link);
    if (!title) continue;

    target.cells[roleIdx] = title;
    if (updatedAtIdx >= 0) {
      target.cells[updatedAtIdx] = updatedAt;
    }
    lines[target.lineIdx] = toCsvRow(target.cells);
    fixed += 1;
  }

  if (fixed > 0) {
    fs.writeFileSync(TRACKER_CSV_PATH, lines.join(eol), 'utf8');
  }

  return { fixed, checked: targets.length };
}

async function enrichRoleForLinkInTracker(link) {
  const normalizedLink = String(link || '').trim();
  if (!normalizedLink) {
    throw new Error('link is required');
  }

  if (!fs.existsSync(TRACKER_CSV_PATH)) {
    throw new Error('Tracker file not found');
  }

  const rawCsv = fs.readFileSync(TRACKER_CSV_PATH, 'utf8');
  const eol = rawCsv.includes('\r\n') ? '\r\n' : '\n';
  const lines = rawCsv.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error('Tracker file is empty');
  }

  const headers = parseCsvLine(lines[0]);
  const linkIdx = headers.findIndex(h => h.trim() === 'Link');
  const roleIdx = headers.findIndex(h => h.trim() === 'Role');
  const updatedAtIdx = headers.findIndex(h => h.trim() === 'UpdatedAt');

  if (linkIdx < 0 || roleIdx < 0) {
    throw new Error('Required columns Link/Role not found');
  }

  let targetLineIdx = -1;
  let targetCells = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line);
    if ((cells[linkIdx] || '').trim() === normalizedLink) {
      targetLineIdx = i;
      targetCells = cells;
      break;
    }
  }

  if (targetLineIdx < 0 || !targetCells) {
    throw new Error(`Link not found: ${normalizedLink}`);
  }

  const existingRole = (targetCells[roleIdx] || '').trim();
  if (existingRole) {
    return { updated: false, role: existingRole, reason: 'role_already_present' };
  }

  const title = await fetchJobTitle(normalizedLink);
  if (!title) {
    return { updated: false, role: '', reason: 'title_not_found' };
  }

  targetCells[roleIdx] = title;
  if (updatedAtIdx >= 0) {
    targetCells[updatedAtIdx] = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }

  lines[targetLineIdx] = toCsvRow(targetCells);
  fs.writeFileSync(TRACKER_CSV_PATH, lines.join(eol), 'utf8');

  return { updated: true, role: title };
}

async function getDescription(company, role, link) {
  const localDescription = readLocalDescription(company, role);
  if (localDescription) {
    return localDescription;
  }

  return getDescriptionForLink(link);
}

function updateTrackerJobStatus(link, newStatus) {
  if (!fs.existsSync(TRACKER_CSV_PATH)) {
    throw new Error('Tracker file not found');
  }

  const rawCsv = fs.readFileSync(TRACKER_CSV_PATH, 'utf8');
  const eol = rawCsv.includes('\r\n') ? '\r\n' : '\n';
  const lines = rawCsv.split(/\r?\n/);

  if (lines.length === 0) throw new Error('Tracker file is empty');

  const headers = parseCsvLine(lines[0]);
  const linkIdx = headers.findIndex(h => h.trim() === 'Link');
  const statusIdx = headers.findIndex(h => h.trim() === 'Status');
  const updatedAtIdx = headers.findIndex(h => h.trim() === 'UpdatedAt');

  if (linkIdx < 0 || statusIdx < 0) throw new Error('Required columns Link/Status not found');

  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  let found = false;
  const updatedLines = lines.map((line, i) => {
    if (i === 0 || !line.trim()) return line;
    const cells = parseCsvLine(line);
    if ((cells[linkIdx] || '').trim() === link.trim()) {
      found = true;
      cells[statusIdx] = newStatus;
      if (updatedAtIdx >= 0) cells[updatedAtIdx] = now;
      return toCsvRow(cells);
    }
    return line;
  });

  if (!found) throw new Error(`Link not found: ${link}`);

  fs.writeFileSync(TRACKER_CSV_PATH, updatedLines.join(eol), 'utf8');
  return { updated: true, link, status: newStatus };
}

function runEasyApplyRefresh(maxSearchPages, searchText, searchTexts) {
  return new Promise((resolve, reject) => {
    const pageCount = Number.isFinite(maxSearchPages)
      ? Math.min(100, Math.max(1, Math.trunc(maxSearchPages)))
      : 50;

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const normalizedSearchText = (searchText || '').trim();
    const normalizedSearchTexts = Array.isArray(searchTexts)
      ? Array.from(new Set(searchTexts.map(item => String(item || '').trim()).filter(Boolean)))
      : [];

    const args = process.platform === 'win32'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', EASY_APPLY_WORKFLOW_SCRIPT, '-Action', 'RefreshSearches', '-MaxSearchPages', String(pageCount)]
      : ['-NoProfile', '-File', EASY_APPLY_WORKFLOW_SCRIPT, '-Action', 'RefreshSearches', '-MaxSearchPages', String(pageCount)];

    if (normalizedSearchText) {
      args.push('-SearchText', normalizedSearchText);
    }

    if (normalizedSearchTexts.length) {
      args.push('-SearchTextsJson', JSON.stringify(normalizedSearchTexts));
    }

    const child = spawn(shell, args, {
      cwd: path.resolve(__dirname, '..', '..'),
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      reject(error);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      const details = (stderr || stdout || `exit code ${code}`).trim();
      reject(new Error(`Easy Apply refresh failed: ${details}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Invalid request' });
    return;
  }

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tracker/jobs') {
    try {
      const jobs = readTrackerJobs();
      sendJson(res, 200, { jobs, total: jobs.length });
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/tracker/refresh') {
    try {
      const body = await readJsonBody(req);
      const maxSearchPages = Number.parseInt(body.maxSearchPages, 10);
      const searchText = (body.searchText || '').trim();
      const searchTexts = Array.isArray(body.searchTexts) ? body.searchTexts : [];

      const beforeJobs = readTrackerJobs();
      const beforeLinks = new Set(beforeJobs.map(job => (job.link || '').trim()).filter(Boolean));

      const refreshResult = await runEasyApplyRefresh(maxSearchPages, searchText, searchTexts);
      const roleBackfill = await backfillMissingRolesInTracker(30);

      const afterJobs = readTrackerJobs();
      const newJobs = afterJobs.filter(job => {
        const link = (job.link || '').trim();
        return link && !beforeLinks.has(link);
      });

      sendJson(res, 200, {
        refreshed: true,
        newLeads: newJobs.length,
        total: afterJobs.length,
        roleBackfilled: roleBackfill.fixed,
        logTail: (refreshResult.stdout || '').split(/\r?\n/).filter(Boolean).slice(-10)
      });
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Failed to refresh tracker from Dice' });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/tracker/description') {
    const link = url.searchParams.get('link') || '';
    const company = url.searchParams.get('company') || '';
    const role = url.searchParams.get('role') || '';
    const description = await getDescription(company, role, link);
    sendJson(res, 200, { description });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tracker/enrich-role') {
    try {
      const body = await readJsonBody(req);
      const link = (body.link || '').trim();
      if (!link) {
        sendJson(res, 400, { error: 'link is required' });
        return;
      }

      const result = await enrichRoleForLinkInTracker(link);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Failed to enrich role' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/tracker/update') {
    try {
      const body = await readJsonBody(req);
      const link = (body.link || '').trim();
      const status = (body.status || '').trim();
      if (!link || !status) { sendJson(res, 400, { error: 'link and status required' }); return; }
      const valid = ['Applied', 'Skipped', 'Pending', 'To Apply'];
      if (!valid.includes(status)) { sendJson(res, 400, { error: `Invalid status: ${status}` }); return; }
      const result = updateTrackerJobStatus(link, status);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/cover-letter/save') {
    try {
      const body = await readJsonBody(req);
      const company = body.company || '';
      const role = body.role || '';
      const content = body.content || '';

      if (!content || !String(content).trim()) {
        sendJson(res, 400, { error: 'Cover letter content is required' });
        return;
      }

      const savedPath = saveCoverLetterTxt(company, role, String(content));
      sendJson(res, 200, { savedPath });
      return;
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to save cover letter txt' });
      return;
    }
  }

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    if (tryServeFrontendAsset(req, res, url.pathname)) {
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Tracker API listening on http://localhost:${PORT}`);
  console.log(`Reading tracker from: ${TRACKER_CSV_PATH}`);
});
