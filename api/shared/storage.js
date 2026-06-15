const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');
const crypto = require('crypto');

let tableClient = null;
let searchTableClient = null;
let usersTableClient = null;
let auditTableClient = null;
let inMemoryStore = [];
let inMemorySearchTerms = [];
let inMemoryUsers = [];
let inMemoryAuditLogs = [];
let useInMemory = false;

const TABLE_NAME = 'jobtracker';
const SEARCH_TABLE_NAME = 'searchterms';
const USERS_TABLE_NAME = 'users';
const AUDIT_TABLE_NAME = 'auditlogs';
const AUTH_SECRET = process.env.AUTH_SECRET || 'dice-app-secret-key-2026';

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

async function getAllJobs(userEmail) {
  const client = getTableClient();
  const partition = userEmail ? `user_${userEmail.toLowerCase().trim()}` : 'jobs';

  if (!client) {
    return inMemoryStore.filter(j => (j.partitionKey || 'jobs') === partition);
  }

  await ensureTable();
  const jobs = [];
  const entities = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${partition}'` } });
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

async function updateJobStatus(link, newStatus, userEmail) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const partition = userEmail ? `user_${userEmail.toLowerCase().trim()}` : 'jobs';

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link && (j.partitionKey || 'jobs') === partition);
    if (!job) throw new Error(`Link not found: ${link}`);
    job.status = newStatus;
    job.dateUpdated = now;
    return { updated: true, link, status: newStatus };
  }

  await ensureTable();
  const linkHash = Buffer.from(link).toString('base64url').slice(0, 100);

  try {
    const entity = await client.getEntity(partition, linkHash);
    entity.status = newStatus;
    entity.dateUpdated = now;
    await client.updateEntity(entity, 'Merge');
    return { updated: true, link, status: newStatus };
  } catch (err) {
    throw new Error(`Link not found or update failed: ${link}`);
  }
}

async function importJobs(jobs, userEmail) {
  const client = getTableClient();
  const partition = userEmail ? `user_${userEmail.toLowerCase().trim()}` : 'jobs';

  if (!client) {
    const imported = jobs.map(j => ({ ...j, partitionKey: partition }));
    inMemoryStore.push(...imported);
    return { imported: jobs.length };
  }

  await ensureTable();
  let imported = 0;
  for (const job of jobs) {
    try {
      const entity = jobToEntity(job);
      entity.partitionKey = partition;
      await client.upsertEntity(entity, 'Merge');
      imported++;
    } catch (err) {
      console.error('Import error for:', job.link, err.message);
    }
  }
  return { imported };
}

async function enrichJobRole(link, role, userEmail) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const partition = userEmail ? `user_${userEmail.toLowerCase().trim()}` : 'jobs';

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link && (j.partitionKey || 'jobs') === partition);
    if (!job) throw new Error(`Link not found: ${link}`);
    if (job.role) return { updated: false, role: job.role, reason: 'role_already_present' };
    job.role = role;
    job.dateUpdated = now;
    return { updated: true, role };
  }

  await ensureTable();
  const linkHash = Buffer.from(link).toString('base64url').slice(0, 100);

  try {
    const entity = await client.getEntity(partition, linkHash);
    if (entity.role) return { updated: false, role: entity.role, reason: 'role_already_present' };
    entity.role = role;
    entity.dateUpdated = now;
    await client.updateEntity(entity, 'Merge');
    return { updated: true, role };
  } catch (err) {
    throw new Error(`Link not found: ${link}`);
  }
}

async function updateJobFields(link, fields, userEmail) {
  const client = getTableClient();
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const partition = userEmail ? `user_${userEmail.toLowerCase().trim()}` : 'jobs';

  if (!client) {
    const job = inMemoryStore.find(j => j.link === link && (j.partitionKey || 'jobs') === partition);
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
    const entity = await client.getEntity(partition, linkHash);
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

// --- Users Table ---

function getUsersTableClient() {
  if (usersTableClient) return usersTableClient;

  const connStr = process.env.AzureWebJobsStorage || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr || connStr === 'UseDevelopmentStorage=true' || connStr === '') {
    return null;
  }

  try {
    usersTableClient = TableClient.fromConnectionString(connStr, USERS_TABLE_NAME, {
      allowInsecureConnection: false
    });
    return usersTableClient;
  } catch (err) {
    return null;
  }
}

async function ensureUsersTable() {
  const client = getUsersTableClient();
  if (!client) return;
  try {
    await client.createTable();
  } catch (err) {
    if (err.statusCode !== 409) {
      console.error('Failed to create users table:', err.message);
    }
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verify;
}

function generateToken(email) {
  const payload = JSON.stringify({ email, iat: Date.now() });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch { return null; }
}

async function registerUser(email, password, role) {
  const client = getUsersTableClient();
  const emailKey = email.toLowerCase().trim();
  const hashedPw = hashPassword(password);
  const now = new Date().toISOString();

  const entity = {
    partitionKey: 'users',
    rowKey: Buffer.from(emailKey).toString('base64url').slice(0, 100),
    email: emailKey,
    password: hashedPw,
    role: role || 'user',
    resume: '',
    dateCreated: now
  };

  if (!client) {
    const existing = inMemoryUsers.find(u => u.email === emailKey);
    if (existing) throw new Error('User already exists');
    inMemoryUsers.push(entity);
    const token = generateToken(emailKey);
    return { token, email: emailKey };
  }

  await ensureUsersTable();
  try {
    await client.getEntity('users', entity.rowKey);
    throw new Error('User already exists');
  } catch (err) {
    if (err.message === 'User already exists') throw err;
  }

  await client.upsertEntity(entity, 'Replace');
  const token = generateToken(emailKey);
  return { token, email: emailKey };
}

async function loginUser(email, password) {
  const client = getUsersTableClient();
  const emailKey = email.toLowerCase().trim();
  const rowKey = Buffer.from(emailKey).toString('base64url').slice(0, 100);

  if (!client) {
    const user = inMemoryUsers.find(u => u.email === emailKey);
    if (!user || !verifyPassword(password, user.password)) {
      throw new Error('Invalid email or password');
    }
    const token = generateToken(emailKey);
    return { token, email: emailKey, role: user.role || 'user' };
  }

  await ensureUsersTable();
  try {
    const entity = await client.getEntity('users', rowKey);
    if (!verifyPassword(password, entity.password)) {
      throw new Error('Invalid email or password');
    }
    const token = generateToken(emailKey);
    return { token, email: emailKey, role: entity.role || 'user' };
  } catch (err) {
    if (err.message === 'Invalid email or password') throw err;
    throw new Error('Invalid email or password');
  }
}

async function getUserByToken(token) {
  const payload = verifyToken(token);
  if (!payload || !payload.email) return null;
  return { email: payload.email };
}

async function getUserResume(email) {
  const client = getUsersTableClient();
  const emailKey = email.toLowerCase().trim();
  const rowKey = Buffer.from(emailKey).toString('base64url').slice(0, 100);

  if (!client) {
    const user = inMemoryUsers.find(u => u.email === emailKey);
    return user?.resume || '';
  }

  await ensureUsersTable();
  try {
    const entity = await client.getEntity('users', rowKey);
    return entity.resume || '';
  } catch {
    return '';
  }
}

async function updateUserResume(email, resume) {
  const client = getUsersTableClient();
  const emailKey = email.toLowerCase().trim();
  const rowKey = Buffer.from(emailKey).toString('base64url').slice(0, 100);

  if (!client) {
    const user = inMemoryUsers.find(u => u.email === emailKey);
    if (user) user.resume = resume;
    return { updated: true };
  }

  await ensureUsersTable();
  try {
    const entity = await client.getEntity('users', rowKey);
    entity.resume = resume;
    await client.updateEntity(entity, 'Merge');
    return { updated: true };
  } catch (err) {
    throw new Error('User not found');
  }
}

// --- Admin / User Management ---

async function getAllUsers() {
  const client = getUsersTableClient();
  if (!client) {
    return inMemoryUsers.map(u => ({
      email: u.email,
      role: u.role || 'user',
      dateCreated: u.dateCreated || ''
    }));
  }

  await ensureUsersTable();
  const users = [];
  const entities = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'users'" } });
  for await (const entity of entities) {
    users.push({
      email: entity.email || '',
      role: entity.role || 'user',
      dateCreated: entity.dateCreated || ''
    });
  }
  return users;
}

async function getUserRole(email) {
  const client = getUsersTableClient();
  const emailKey = email.toLowerCase().trim();
  const rowKey = Buffer.from(emailKey).toString('base64url').slice(0, 100);

  if (!client) {
    const user = inMemoryUsers.find(u => u.email === emailKey);
    return user?.role || 'user';
  }

  await ensureUsersTable();
  try {
    const entity = await client.getEntity('users', rowKey);
    return entity.role || 'user';
  } catch {
    return 'user';
  }
}

// --- Audit Log Table ---

function getAuditTableClient() {
  if (auditTableClient) return auditTableClient;

  const connStr = process.env.AzureWebJobsStorage || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr || connStr === 'UseDevelopmentStorage=true' || connStr === '') {
    return null;
  }

  try {
    auditTableClient = TableClient.fromConnectionString(connStr, AUDIT_TABLE_NAME, {
      allowInsecureConnection: false
    });
    return auditTableClient;
  } catch (err) {
    return null;
  }
}

async function ensureAuditTable() {
  const client = getAuditTableClient();
  if (!client) return;
  try {
    await client.createTable();
  } catch (err) {
    if (err.statusCode !== 409) {
      console.error('Failed to create audit table:', err.message);
    }
  }
}

async function logAudit(email, action, details) {
  const client = getAuditTableClient();
  const now = new Date();
  const timestamp = now.toISOString();
  const rowKey = `${now.getTime()}_${crypto.randomBytes(4).toString('hex')}`;

  const entity = {
    partitionKey: 'audit',
    rowKey,
    email: email || 'anonymous',
    action: action || '',
    details: (details || '').slice(0, 2000),
    timestamp
  };

  if (!client) {
    inMemoryAuditLogs.push(entity);
    return;
  }

  await ensureAuditTable();
  try {
    await client.upsertEntity(entity, 'Replace');
  } catch (err) {
    console.error('Failed to log audit:', err.message);
  }
}

async function getAuditLogs(limit) {
  const client = getAuditTableClient();
  const maxItems = limit || 100;

  if (!client) {
    return inMemoryAuditLogs.slice(-maxItems).reverse();
  }

  await ensureAuditTable();
  const logs = [];
  const entities = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'audit'" } });
  for await (const entity of entities) {
    logs.push({
      email: entity.email || '',
      action: entity.action || '',
      details: entity.details || '',
      timestamp: entity.timestamp || ''
    });
  }

  // Sort newest first and limit
  logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return logs.slice(0, maxItems);
}

// --- Migration: move jobs from old 'jobs' partition to user partition ---

async function migrateJobsToUser(targetEmail) {
  const client = getTableClient();
  const newPartition = `user_${targetEmail.toLowerCase().trim()}`;

  if (!client) {
    // In-memory: reassign partitionKey
    const oldJobs = inMemoryStore.filter(j => (j.partitionKey || 'jobs') === 'jobs');
    oldJobs.forEach(j => { j.partitionKey = newPartition; });
    return { migrated: oldJobs.length };
  }

  await ensureTable();
  let migrated = 0;
  const entities = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'jobs'" } });
  for await (const entity of entities) {
    // Create in new partition
    const newEntity = { ...entity, partitionKey: newPartition };
    delete newEntity.etag;
    delete newEntity.timestamp;
    try {
      await client.upsertEntity(newEntity, 'Merge');
      // Delete from old partition
      await client.deleteEntity('jobs', entity.rowKey);
      migrated++;
    } catch (err) {
      console.error('Migration error for:', entity.rowKey, err.message);
    }
  }
  return { migrated };
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
  removeSearchTerm,
  // Auth
  registerUser,
  loginUser,
  getUserByToken,
  getUserResume,
  updateUserResume,
  hashPassword,
  verifyPassword,
  generateToken,
  // Admin
  getAllUsers,
  getUserRole,
  // Audit
  logAudit,
  getAuditLogs,
  // Migration
  migrateJobsToUser
};
