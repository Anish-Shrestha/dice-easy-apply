const { registerUser, logAudit } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'Email and password are required' } };
      return;
    }

    if (password.length < 6) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'Password must be at least 6 characters' } };
      return;
    }

    const result = await registerUser(email, password);
    await logAudit(email, 'register', 'New account created');
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
  } catch (error) {
    const status = error.message === 'User already exists' ? 409 : 500;
    context.res = { status, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
