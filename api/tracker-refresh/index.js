module.exports = async function (context, req) {
  context.res = {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'Refresh is not available in the cloud deployment. Use the local backend to scrape Dice and sync data.',
      refreshed: false
    }
  };
};
