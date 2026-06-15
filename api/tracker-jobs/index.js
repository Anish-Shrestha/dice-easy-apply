const { getAllJobs, getUserByToken } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const jobs = await getAllJobs(user?.email);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { jobs, total: jobs.length }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message }
    };
  }
};
