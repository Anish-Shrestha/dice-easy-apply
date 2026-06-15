const { getSearchTerms, addSearchTerm, removeSearchTerm, getUserByToken } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    const token = req.headers['x-auth-token'] || '';
    const user = token ? await getUserByToken(token) : null;
    const userEmail = user?.email;

    if (req.method === 'GET') {
      const terms = await getSearchTerms(userEmail);
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { terms }
      };
      return;
    }

    if (req.method === 'POST') {
      const { text, employmentTypes } = req.body || {};
      if (!text || !text.trim()) {
        context.res = { status: 400, body: { error: 'text is required' } };
        return;
      }
      const result = await addSearchTerm(text, employmentTypes, userEmail);
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result
      };
      return;
    }

    if (req.method === 'DELETE') {
      const id = context.bindingData.id || (req.body && req.body.id);
      if (!id) {
        context.res = { status: 400, body: { error: 'id is required' } };
        return;
      }
      const result = await removeSearchTerm(id, userEmail);
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result
      };
      return;
    }

    context.res = { status: 405, body: { error: 'Method not allowed' } };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message }
    };
  }
};
