const { getUserByToken, getUserResume, updateUserResume } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

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

    // POST - update resume
    const { resume } = req.body || {};
    if (resume === undefined) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'resume field is required' } };
      return;
    }

    await updateUserResume(user.email, resume);
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { updated: true } };
  } catch (error) {
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
