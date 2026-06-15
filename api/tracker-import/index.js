const { importJobs, getUserByToken } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const body = req.body || {};
    const jobs = body.jobs;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'jobs array is required' }
      };
      return;
    }

    const result = await importJobs(jobs, user?.email);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { imported: result.imported, total: jobs.length }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message }
    };
  }
};
