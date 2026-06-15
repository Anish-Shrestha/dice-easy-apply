const { registerUser } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    // Seed default user
    const result = await registerUser('mshrestha789@gmail.com', 'Nepal@123');
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { seeded: true, ...result } };
  } catch (error) {
    if (error.message === 'User already exists') {
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { seeded: false, message: 'User already exists' } };
      return;
    }
    context.res = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: error.message } };
  }
};
