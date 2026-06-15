const { getSearchTerms, addSearchTerm, removeSearchTerm } = require('../shared/storage');

module.exports = async function (context, req) {
  try {
    if (req.method === 'GET') {
      const terms = await getSearchTerms();
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
      const result = await addSearchTerm(text, employmentTypes);
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
      const result = await removeSearchTerm(id);
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
