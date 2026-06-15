const { loginUser, logAudit } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'Email and password are required' } };
      return;
    }

    const result = await loginUser(email, password);
    await logAudit(email, 'login', 'User logged in');
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
  } catch (error) {
    await logAudit(req.body?.email || 'unknown', 'login_failed', error.message);
    context.res = { status: 401, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
