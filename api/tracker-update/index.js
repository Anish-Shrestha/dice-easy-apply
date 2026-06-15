const { updateJobStatus, logAudit, getUserByToken } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const body = req.body || {};
    const link = (body.link || '').trim();
    const status = (body.status || '').trim();

    if (!link || !status) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'link and status required' }
      };
      return;
    }

    const valid = ['Applied', 'Skipped', 'Pending', 'To Apply'];
    if (!valid.includes(status)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Invalid status: ${status}` }
      };
      return;
    }

    const result = await updateJobStatus(link, status, user?.email);
    await logAudit(user?.email || 'anonymous', 'job_status_update', `Status: ${status} | Link: ${link.slice(0, 80)}`);
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
