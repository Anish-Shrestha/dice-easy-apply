const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

let tableClient = null;
let searchTableClient = null;
let inMemoryStore = [];
let inMemorySearchTerms = [];
let useInMemory = false;

const TABLE_NAME = 'jobtracker';
const SEARCH_TABLE_NAME = 'searchterms';

function getTableClient() {
  if (tableClient) return tableClient;

  const connStr = process.env.AzureWebJobsStorage || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr || connStr === 'UseDevelopmentStorage=true' || connStr === '') {
    useInMemory = true;
    return null;
  }

  try {
    tableClient = TableClient.fromConnectionString(connStr, TABLE_NAME, {
      allowInsecureConnection: false
    });
    return tableClient;
  } catch (err) {
    useInMemory = true;
    return null;
  }
}

function getSearchTableClient() {
  if (searchTableClient) return searchTableClient;

  const connStr = process.env.AzureWebJobsStorage || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr || connStr === 'UseDevelopmentStorage=true' || connStr === '') {
    return null;
  }

  try {
    searchTableClient = TableClient.fromConnectionString(connStr, SEARCH_TABLE_NAME, {
      allowInsecureConnection: false
    });
    return searchTableClient;
  } catch (err) {
    return null;
  }
}

async function ensureTable() {
  const client = getTableClient();
  if (!client) return;
  try {
    await client.createTable();
  } catch (err) {
    if (err.statusCode !== 409) {
      console.error('Failed to create table:', err.message);
    }
  }
}

function jobToEntity(job) {
  const linkHash = Buffer.from(job.link || '').toString('base64url').slice(0, 100);
  return {
    partitionKey: 'jobs',
    rowKey: linkHash,
    link: job.link || '',
    role: job.role || '',
    company: job.company || '',
    location: job.location || '',
    salary: job.salary || '',
    workType: job.workType || '',
    score: job.score || 0,
    summary: job.summary || '',
    jobDescription: job.jobDescription || '',
    coverLetter: job.coverLetter || '',
    status: job.status || 'To Apply',
    dateAdded: job.dateAdded || '',
    dateUpdated: job.dateUpdated || ''
  };
}

function entityToJob(entity) {
  return {
    link: entity.link || '',
    role: entity.role || '',
    company: entity.company || '',
    location: entity.location || '',
    salary: entity.salary || '',
    workType: entity.workType || '',
    score: entity.score || 0,
    summary: entity.summary || '',
    jobDescription: entity.jobDescription || '',
    coverLetter: entity.coverLetter || '',
    status: entity.status || 'To Apply',
    dateAdded: entity.dateAdded || '',
    dateUpdated: entity.dateUpdated || ''
  };
}

async function getAllJobs() {
  const client = getTableClient();
  if (!client) {
    return [...inMemoryStore];
  }

  await ensureTable();
  const jobs = [];
  const entities = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'jobs'" } });
  for await (const entity of entities) {
    jobs.push(entityToJob(entity));
  }

  jobs.sort((a, b) => {
    if (a.status === 'To Apply' && b.status !== 'To Apply') return -1;
    if (a.status !== 'To Apply' && b.status === 'To Apply') return 1;
    return (b.score || 0) - (a.score || 0);
  });

  return jobs;
}

async function updateJobStatus(link, newStatus) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link);
    if (!job) throw new Error(`Link not found: ${link}`);
    job.status = newStatus;
    job.dateUpdated = now;
    return { updated: true, link, status: newStatus };
  }

  await ensureTable();
  const linkHash = Buffer.from(link).toString('base64url').slice(0, 100);

  try {
    const entity = await client.getEntity('jobs', linkHash);
    entity.status = newStatus;
    entity.dateUpdated = now;
    await client.updateEntity(entity, 'Merge');
    return { updated: true, link, status: newStatus };
  } catch (err) {
    throw new Error(`Link not found or update failed: ${link}`);
  }
}

async function importJobs(jobs) {
  const client = getTableClient();

  if (!client) {
    inMemoryStore = jobs.map(j => ({ ...j }));
    return { imported: jobs.length };
  }

  await ensureTable();
  let imported = 0;
  for (const job of jobs) {
    try {
      await client.upsertEntity(jobToEntity(job), 'Merge');
      imported++;
    } catch (err) {
      console.error('Import error for:', job.link, err.message);
    }
  }
  return { imported };
}

async function enrichJobRole(link, role) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link);
    if (!job) throw new Error(`Link not found: ${link}`);
    if (job.role) return { updated: false, role: job.role, reason: 'role_already_present' };
    job.role = role;
    job.dateUpdated = now;
    return { updated: true, role };
  }

  await ensureTable();
  const linkHash = Buffer.from(link).toString('base64url').slice(0, 100);

  try {
    const entity = await client.getEntity('jobs', linkHash);
    if (entity.role) return { updated: false, role: entity.role, reason: 'role_already_present' };
    entity.role = role;
    entity.dateUpdated = now;
    await client.updateEntity(entity, 'Merge');
    return { updated: true, role };
  } catch (err) {
    throw new Error(`Link not found: ${link}`);
  }
}

async function updateJobFields(link, fields) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link);
    if (!job) throw new Error(`Link not found: ${link}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) job[k] = v;
    }
    job.dateUpdated = now;
    return { updated: true, link };
  }

  await ensureTable();
  const linkHash = Buffer.from(link).toString('base64url').slice(0, 100);

  try {
    const entity = await client.getEntity('jobs', linkHash);
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) entity[k] = v;
    }
    entity.dateUpdated = now;
    await client.updateEntity(entity, 'Merge');
    return { updated: true, link };
  } catch (err) {
    throw new Error(`Link not found or update failed: ${link}`);
  }
}

// --- Search Terms Table ---

async function ensureSearchTable() {
  const client = getSearchTableClient();
  if (!client) return;
  try {
    await client.createTable();
  } catch (err) {
    if (err.statusCode !== 409) {
      console.error('Failed to create search terms table:', err.message);
    }
  }
}

async function getSearchTerms() {
  const client = getSearchTableClient();
  if (!client) return [...inMemorySearchTerms];

  await ensureSearchTable();
  const terms = [];
  const entities = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'terms'" } });
  for await (const entity of entities) {
    terms.push({
      id: entity.rowKey,
      text: entity.text || '',
      employmentTypes: entity.employmentTypes || 'FULLTIME,CONTRACT,THIRD_PARTY',
      enabled: entity.enabled !== false,
      dateAdded: entity.dateAdded || ''
    });
  }
  return terms;
}

async function addSearchTerm(text, employmentTypes) {
  const client = getSearchTableClient();
  const id = Buffer.from(text.toLowerCase().trim()).toString('base64url').slice(0, 100);
  const now = new Date().toISOString().split('T')[0];
  const entity = {
    partitionKey: 'terms',
    rowKey: id,
    text: text.trim(),
    employmentTypes: employmentTypes || 'FULLTIME,CONTRACT,THIRD_PARTY',
    enabled: true,
    dateAdded: now
  };

  if (!client) {
    const existing = inMemorySearchTerms.find(t => t.id === id);
    if (!existing) inMemorySearchTerms.push({ id, text: text.trim(), employmentTypes: entity.employmentTypes, enabled: true, dateAdded: now });
    return { added: true, id };
  }

  await ensureSearchTable();
  await client.upsertEntity(entity, 'Merge');
  return { added: true, id };
}

async function removeSearchTerm(id) {
  const client = getSearchTableClient();

  if (!client) {
    inMemorySearchTerms = inMemorySearchTerms.filter(t => t.id !== id);
    return { removed: true };
  }

  await ensureSearchTable();
  try {
    await client.deleteEntity('terms', id);
    return { removed: true };
  } catch (err) {
    throw new Error(`Search term not found: ${id}`);
  }
}

module.exports = {
  getAllJobs,
  updateJobStatus,
  updateJobFields,
  importJobs,
  enrichJobRole,
  ensureTable,
  getSearchTerms,
  addSearchTerm,
  removeSearchTerm
};
