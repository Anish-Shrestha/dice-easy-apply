const { importJobs } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
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

    const result = await importJobs(jobs);
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
