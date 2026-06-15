const { getUserByToken, getUserRole, getAllUsers } = require('../shared/storage');

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

    const role = await getUserRole(user.email);
    if (role !== 'admin') {
      context.res = { status: 403, headers: { 'Content-Type': 'application/json' }, body: { error: 'Admin access required' } };
      return;
    }

    const users = await getAllUsers();
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { users } };
  } catch (error) {
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
