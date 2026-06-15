const { updateJobFields, logAudit, getUserByToken } = require('../shared/storage');

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

    // Only allow updating specific safe fields
    const allowedFields = ['jobDescription', 'coverLetter', 'role', 'salary', 'workType', 'summary'];
    const fields = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        fields[key] = body[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'No valid fields to update. Allowed: ' + allowedFields.join(', ') }
      };
      return;
    }

    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const result = await updateJobFields(link, fields);
    await logAudit(user?.email || 'anonymous', 'job_fields_update', `Fields: ${Object.keys(fields).join(',')} | Link: ${link.slice(0, 80)}`);
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
