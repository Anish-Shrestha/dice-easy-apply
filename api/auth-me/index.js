const { getUserByToken, getUserRole, getAllUsers, getAuditLogs } = require('../shared/storage');

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

    const action = req.query.action || 'me';

    // Admin actions
    if (action === 'users' || action === 'audit') {
      const role = await getUserRole(user.email);
      if (role !== 'admin') {
        context.res = { status: 403, headers: { 'Content-Type': 'application/json' }, body: { error: 'Admin access required' } };
        return;
      }

      if (action === 'users') {
        const users = await getAllUsers();
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { users } };
        return;
      }

      if (action === 'audit') {
        const limit = parseInt(req.query.limit) || 200;
        const logs = await getAuditLogs(limit);
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { logs } };
        return;
      }
    }

    // Default: return user info
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { email: user.email, role: user.role || 'user' } };
  } catch (error) {
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
