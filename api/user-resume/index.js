const { getUserByToken, getUserResume, updateUserResume, logAudit } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';

    if (!token) {
      context.res = { status: 401, headers: { 'Content-Type': 'application/json' }, body: { error: 'No token provided' } };
      return;
    }

    const user = await getUserByToken(token);
    if (!user) {
      context.res = { status: 401, headers: { 'Content-Type': 'application/json' }, body: { error: 'Invalid token' } };
      return;
    }

    if (req.method === 'GET') {
      const resume = await getUserResume(user.email);
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { resume } };
      return;
    }

    // POST - update resume (text content or base64-encoded file)
    const { resume, fileContent, fileType } = req.body || {};

    let resumeText = resume || '';

    // Handle file upload (base64-encoded PDF/DOCX/TXT)
    if (fileContent && fileType) {
      const buffer = Buffer.from(fileContent, 'base64');

      if (fileType === 'pdf') {
        // Extract text from PDF using simple text extraction
        resumeText = extractTextFromPdf(buffer);
      } else if (fileType === 'docx') {
        // Extract text from DOCX
        resumeText = extractTextFromDocx(buffer);
      } else {
        // Plain text
        resumeText = buffer.toString('utf8');
      }
    }

    if (resumeText === undefined || resumeText === null) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'resume content is required' } };
      return;
    }

    await updateUserResume(user.email, resumeText);
    await logAudit(user.email, 'resume_updated', `Resume updated (${resumeText.length} chars)`);
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { updated: true, length: resumeText.length } };
  } catch (error) {
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};

// Simple PDF text extraction (extracts readable strings from PDF binary)
function extractTextFromPdf(buffer) {
  const content = buffer.toString('latin1');
  const textParts = [];

  // Extract text between BT/ET blocks (PDF text objects)
  const btMatches = content.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btMatches) {
    // Match text show operators: Tj, TJ, ', "
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
    for (const m of tjMatches) {
      const text = m.replace(/\(([^)]*)\)\s*Tj/, '$1');
      if (text.trim()) textParts.push(text);
    }

    // TJ array operator
    const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/g) || [];
    for (const m of tjArrayMatches) {
      const inner = m.replace(/\[([^\]]*)\]\s*TJ/, '$1');
      const strings = inner.match(/\(([^)]*)\)/g) || [];
      const combined = strings.map(s => s.replace(/[()]/g, '')).join('');
      if (combined.trim()) textParts.push(combined);
    }
  }

  // If BT/ET extraction failed, try stream content
  if (textParts.length === 0) {
    const readable = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n').trim();
    // Extract anything that looks like sentences
    const sentences = readable.match(/[A-Z][a-z][\w\s,;:'-]{10,}/g) || [];
    return sentences.join('\n').slice(0, 30000);
  }

  return textParts.join(' ').slice(0, 30000);
}

// Simple DOCX text extraction (DOCX is a ZIP with XML inside)
function extractTextFromDocx(buffer) {
  try {
    const content = buffer.toString('utf8');
    // DOCX stores text in word/document.xml — try to find XML text nodes
    // Look for <w:t> tags in the binary
    const binaryStr = buffer.toString('latin1');
    const textMatches = binaryStr.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const parts = textMatches.map(m => m.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, '$1'));

    if (parts.length > 0) {
      return parts.join(' ').slice(0, 30000);
    }

    // Fallback: extract readable ASCII sequences
    const readable = binaryStr.replace(/[^\x20-\x7E\n\r\t]/g, '').replace(/\s{3,}/g, '\n');
    return readable.slice(0, 30000);
  } catch {
    return '';
  }
}
