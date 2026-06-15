const { registerUser, migrateJobsToUser } = require('../shared/storage');

module.exports = async function (context, req) {
  const results = [];

  // Seed default user
  try {
    await registerUser('mshrestha789@gmail.com', 'Nepal@123', 'user');
    results.push({ email: 'mshrestha789@gmail.com', status: 'created' });
  } catch (error) {
    results.push({ email: 'mshrestha789@gmail.com', status: error.message });
  }

  // Seed admin user
  try {
    await registerUser('anish.shrestha237@gmail.com', 'Nepal@321', 'admin');
    results.push({ email: 'anish.shrestha237@gmail.com', status: 'created' });
  } catch (error) {
    results.push({ email: 'anish.shrestha237@gmail.com', status: error.message });
  }

  // Migrate existing jobs from old 'jobs' partition to mshrestha789@gmail.com
  let migration = { migrated: 0 };
  try {
    migration = await migrateJobsToUser('mshrestha789@gmail.com');
  } catch (error) {
    migration = { migrated: 0, error: error.message };
  }

  context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { seeded: true, results, migration } };
};
