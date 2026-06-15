const { getAllJobs } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const jobs = await getAllJobs();
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
