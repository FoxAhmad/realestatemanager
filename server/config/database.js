const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const dotenv = require('dotenv');

dotenv.config();

// Hosted databases (Neon etc.) need SSL; a local Postgres usually has it off. SSL is skipped for
// localhost URLs, or explicitly with DB_SSL=false.
const isLocalUrl = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL || '');
const useSsl = process.env.DB_SSL !== 'false' && !isLocalUrl;

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  }
  : {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uh_crm',
    port: process.env.DB_PORT || 5432,
  };

const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Multi-tenancy: every authenticated request runs inside an AsyncLocalStorage context
// ({ tenantId, insertBranchId, readBranchIds, writeBranchIds }). db.query / db.connect then hand out
// a connection that has switched to the non-owner role `crm_app` with the app.* settings the
// row-level-security policies read, so a query can only see/write the caller's tenant (and branches).
//
// STRICT (set by server/index.js): a db.query with no context is rejected instead of running as the
// table owner. Trusted code (boot, login, tenant admin) uses db.admin explicitly.
// Scripts (not strict) keep the old behaviour: owner connection, defaulting to the first tenant.
const als = new AsyncLocalStorage();
const STRICT = process.env.DB_STRICT === '1';
const USE_ROLE = process.env.ALLOW_NO_RLS !== 'true'; // escape hatch if the host cannot create/SET the crm_app role

const applyContext = (client, ctx) => client.query(
  `SELECT set_config('app.tenant_id', $1, false), set_config('app.branch_id', $2, false),
          set_config('app.read_branches', $3, false), set_config('app.write_branches', $4, false)`,
  [String(ctx.tenantId ?? ''), String(ctx.insertBranchId ?? ''), (ctx.readBranchIds || []).join(','), (ctx.writeBranchIds || []).join(',')]
);

// Non-strict sessions: owner role defaulting to a tenant (TENANT_ID env, else the first/legacy tenant).
const applyScriptDefaults = (client) => client.query(
  `SELECT set_config('app.tenant_id', t.id::text, false), set_config('app.branch_id', b.id::text, false),
          set_config('app.read_branches', b.id::text, false), set_config('app.write_branches', b.id::text, false)
   FROM tenants t JOIN branches b ON b.tenant_id = t.id AND b.is_default
   WHERE ($1::int IS NULL OR t.id = $1::int) ORDER BY t.id LIMIT 1`,
  [process.env.TENANT_ID || null]
).catch(() => {}); // tenants table does not exist yet on first boot

// Test connection
pool.on('connect', (client) => {
  console.log('PostgreSQL Database connected');
  if (!STRICT) applyScriptDefaults(client);
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const acquire = async (ctx) => {
  const client = await pool.connect();
  try {
    await applyContext(client, ctx);
    if (USE_ROLE) await client.query('SET ROLE crm_app');
  } catch (err) {
    client.release(true);
    throw err;
  }
  const release = client.release.bind(client);
  client.release = async () => {
    client.release = release;
    try {
      if (USE_ROLE) await client.query('RESET ROLE');
      await applyContext(client, {});
      if (!STRICT) await applyScriptDefaults(client);
      release();
    } catch (err) {
      release(true); // connection in unknown state (e.g. aborted transaction) - drop it
    }
  };
  return client;
};

// One connection per request, taken on first query and returned when the response closes.
const requestClient = (ctx) => (ctx.clientPromise = ctx.clientPromise || acquire(ctx));

const releaseContext = async (ctx) => {
  if (!ctx.clientPromise) return;
  const p = ctx.clientPromise;
  ctx.clientPromise = null;
  try { (await p).release(); } catch (e) { /* acquire failed; nothing to release */ }
};

const noContext = () => Promise.reject(new Error('Database access without tenant context'));

const db = {
  query: (...args) => {
    const ctx = als.getStore();
    if (!ctx) return STRICT ? noContext() : pool.query(...args);
    return requestClient(ctx).then((client) => client.query(...args));
  },
  connect: () => {
    const ctx = als.getStore();
    if (!ctx) return STRICT ? noContext() : pool.connect();
    return acquire(ctx);
  },
  // Owner-level pool: no RLS. Only for boot/migrations, login, and tenant administration,
  // where every statement carries an explicit tenant_id.
  admin: pool,
  als,
  releaseContext,
  // Run fn inside a tenant context (used by tests and tenant-scoped jobs).
  runAs: async (ctx, fn) => {
    const store = { ...ctx, clientPromise: null };
    try {
      return await als.run(store, fn);
    } finally {
      await releaseContext(store);
    }
  },
  // Express middleware: re-enter the request's context after middleware (multer) that runs
  // the rest of the chain from a stream callback, which loses AsyncLocalStorage context.
  keepContext: (req, res, next) => (req.dbCtx ? als.run(req.dbCtx, next) : next()),
  end: () => pool.end(),
};

module.exports = db;
