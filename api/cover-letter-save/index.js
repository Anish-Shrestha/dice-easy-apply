module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const content = (body.content || '').trim();

    if (!content) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Cover letter content is required' }
      };
      return;
    }

    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('');

    const fileName = `cover_letter_${stamp}.txt`;

    // In serverless, we can't write to persistent filesystem.
    // Return the content as-is for the client to handle (download).
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        savedPath: `cover_letters/${fileName}`,
        fileName,
        content,
        note: 'Cover letter generated. In cloud mode, save locally or download.'
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to process cover letter' }
    };
  }
};
