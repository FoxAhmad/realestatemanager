// Idempotent multi-tenant migration. Runs on every boot from dbInit (after the base tables exist), so it
// upgrades an existing single-tenant database and also finishes a fresh install.
//
// Existing data -> one default tenant ("legacy company") with a default branch.
// Adding a column with a CONSTANT default backfills existing rows without an UPDATE (no trigger side effects);
// the default is then swapped for the per-request context value (app_tid()/app_branch()).

const db = require('./database');
const pool = db.admin;

// Tenant-wide data (shared by every branch of a tenant).
const TENANT_TABLES = ['agencies', 'investors', 'app_settings', 'balance_projects', 'dealer_exchanges', 'agreements'];
// Branch-scoped data. Children (plots, lines, ...) carry branch_id too so ledger/report sums respect branches.
const BRANCH_TABLES = [
  'customers', 'inventory', 'inventory_plots', 'inventory_plot_assignments', 'deals', 'deal_plots', 'payments',
  'leads', 'lead_status_updates', 'inventory_payments', 'inventory_requests', 'transactions', 'transaction_lines',
  'deal_adjustments', 'slips'
];
// users and accounts are special-cased below. These tables are global/admin-only (no RLS, not granted to crm_app).
const GLOBAL_TABLES = ['tenants', 'branches', 'user_branches', 'audit_log'];
// The standard chart of accounts (ids 1-9 + the 4 parent accounts) is shared by all tenants; only
// per-tenant sub-accounts (individual loans/investments) carry a tenant_id.
const SYSTEM_PARENT_NAMES = ['Investments', 'Loans Receivable', 'Loans Payable', 'Owner Equity / Drawings'];

const migrateMultiTenant = async () => {
  const q = (sql, params) => pool.query(sql, params);

  await q(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'platinum')),
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, name)
    )`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_default ON branches(tenant_id) WHERE is_default`);
  await q(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER,
      user_id INTEGER,
      action VARCHAR(100) NOT NULL,
      detail JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

  // Default tenant + branch for the existing company (only when the database has no tenant yet).
  let tenant = (await q('SELECT id FROM tenants ORDER BY id LIMIT 1')).rows[0];
  if (!tenant) {
    tenant = (await q(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, 'default', $2) RETURNING id`,
      [process.env.DEFAULT_TENANT_NAME || 'Default Company', process.env.DEFAULT_TENANT_PLAN || 'platinum']
    )).rows[0];
  }
  const tid = Number(tenant.id);
  let branch = (await q('SELECT id FROM branches WHERE tenant_id = $1 AND is_default', [tid])).rows[0];
  if (!branch) {
    branch = (await q(
      `INSERT INTO branches (tenant_id, name, is_default) VALUES ($1, 'Main Branch', TRUE) RETURNING id`, [tid]
    )).rows[0];
  }
  const bid = Number(branch.id);

  // Context functions read by defaults and RLS policies. NULL (no context) => no rows, inserts fail.
  await q(`CREATE OR REPLACE FUNCTION app_tid() RETURNS int LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.tenant_id', true), '')::int $$`);
  await q(`CREATE OR REPLACE FUNCTION app_branch() RETURNS int LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.branch_id', true), '')::int $$`);
  await q(`CREATE OR REPLACE FUNCTION app_read_branches() RETURNS int[] LANGUAGE sql STABLE AS
    $$ SELECT string_to_array(nullif(current_setting('app.read_branches', true), ''), ',')::int[] $$`);
  await q(`CREATE OR REPLACE FUNCTION app_write_branches() RETURNS int[] LANGUAGE sql STABLE AS
    $$ SELECT string_to_array(nullif(current_setting('app.write_branches', true), ''), ',')::int[] $$`);

  const addScope = async (table, withBranch) => {
    await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT ${tid} REFERENCES tenants(id)`);
    await q(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT app_tid()`);
    await q(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
    if (withBranch) {
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id INTEGER NOT NULL DEFAULT ${bid} REFERENCES branches(id)`);
      await q(`ALTER TABLE ${table} ALTER COLUMN branch_id SET DEFAULT app_branch()`);
      await q(`CREATE INDEX IF NOT EXISTS idx_${table}_branch ON ${table}(tenant_id, branch_id)`);
    }
    await q(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  };
  const policy = (table, name, cmd, using, check) =>
    q(`DROP POLICY IF EXISTS ${name} ON ${table}`).then(() =>
      q(`CREATE POLICY ${name} ON ${table} FOR ${cmd} ${using ? `USING (${using})` : ''} ${check ? `WITH CHECK (${check})` : ''}`));

  const TENANT_OK = 'tenant_id = app_tid()';
  const READ_OK = `${TENANT_OK} AND branch_id = ANY(app_read_branches())`;
  const WRITE_OK = `${TENANT_OK} AND branch_id = ANY(app_write_branches())`;

  for (const t of TENANT_TABLES) {
    await addScope(t, false);
    await policy(t, 'tenant_isolation', 'ALL', TENANT_OK, TENANT_OK);
  }
  for (const t of BRANCH_TABLES) {
    await addScope(t, true);
    await policy(t, 'branch_select', 'SELECT', READ_OK);
    await policy(t, 'branch_insert', 'INSERT', null, WRITE_OK);
    await policy(t, 'branch_update', 'UPDATE', WRITE_OK, WRITE_OK);
    await policy(t, 'branch_delete', 'DELETE', WRITE_OK);
  }

  // users: tenant_id is NULL only for platform super_admins.
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT ${tid} REFERENCES tenants(id)`);
  await q(`ALTER TABLE users ALTER COLUMN tenant_id SET DEFAULT app_tid()`);
  await q(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`);
  await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await q(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'dealer', 'accountant', 'super_admin'))`);
  await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_required`);
  await q(`ALTER TABLE users ADD CONSTRAINT users_tenant_required CHECK (role = 'super_admin' OR tenant_id IS NOT NULL)`);
  await q(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
  // Tenant users can never create or become a platform super_admin, whatever a route does.
  await policy('users', 'tenant_isolation', 'ALL', TENANT_OK, `${TENANT_OK} AND role <> 'super_admin'`);

  await q(`
    CREATE TABLE IF NOT EXISTS user_branches (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, branch_id)
    )`);

  // accounts: NULL tenant_id = shared standard account; otherwise a tenant's own sub-account.
  await q(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`);
  await q(
    `UPDATE accounts SET tenant_id = $1
     WHERE tenant_id IS NULL AND id > 9 AND NOT (parent_id IS NULL AND name = ANY($2))`,
    [tid, SYSTEM_PARENT_NAMES]
  );
  await q(`ALTER TABLE accounts ALTER COLUMN tenant_id SET DEFAULT app_tid()`);
  await q(`CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id)`);
  await q(`ALTER TABLE accounts ENABLE ROW LEVEL SECURITY`);
  await policy('accounts', 'account_select', 'SELECT', `tenant_id IS NULL OR ${TENANT_OK}`);
  await policy('accounts', 'account_insert', 'INSERT', null, TENANT_OK);
  await policy('accounts', 'account_update', 'UPDATE', TENANT_OK, TENANT_OK);
  await policy('accounts', 'account_delete', 'DELETE', TENANT_OK);

  // Unique constraints that must be tenant-scoped.
  await q(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_cnic_key`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_cnic ON customers(tenant_id, cnic)`);
  await q(`ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_app_settings_tenant_key ON app_settings(tenant_id, setting_key)`);
  const slipIdx = (await q(`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_slips_source'`)).rows[0];
  if (!slipIdx || !slipIdx.indexdef.includes('tenant_id')) {
    await q(`DROP INDEX IF EXISTS idx_slips_source`);
    await q(`CREATE UNIQUE INDEX idx_slips_source ON slips(tenant_id, source_type, source_id) WHERE source_id IS NOT NULL`);
  }

  // Default settings for the legacy tenant (new tenants get theirs from tenantService.createTenant).
  await q(
    `INSERT INTO app_settings (tenant_id, setting_key, setting_value, description) VALUES
       ($1, 'ADJUSTMENT_FORM_DEFAULT_COST', '20000', 'Default cost price for adjustment forms (certificates)'),
       ($1, 'ADJUSTMENT_FORM_CUSTOMER_VALUE', '40000', 'Default value credited toward deal for adjustment forms')
     ON CONFLICT (tenant_id, setting_key) DO NOTHING`,
    [tid]
  );

  // Non-owner role used for every tenant request. NOBYPASSRLS + no ownership => policies always apply.
  await q(`DO $$ BEGIN
             IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN CREATE ROLE crm_app NOLOGIN NOBYPASSRLS; END IF;
           END $$`);
  try { await q('GRANT crm_app TO CURRENT_USER'); } catch (e) { /* verified below */ }
  await q('GRANT USAGE ON SCHEMA public TO crm_app');
  await q('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app');
  await q('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app');
  await q('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app');
  await q('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crm_app');
  await q(`REVOKE ALL ON ${GLOBAL_TABLES.join(', ')} FROM crm_app`);

  // Every table must be classified: a table without tenant_id (other than the global ones) fails the boot.
  const missing = (await q(
    `SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name <> ALL($1)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'tenant_id')`,
    [GLOBAL_TABLES]
  )).rows.map((r) => r.table_name);
  if (missing.length) throw new Error(`Tables missing tenant_id (classify them in multiTenant.js): ${missing.join(', ')}`);

  await verifyRoleSwitch();
  return { tenantId: tid, branchId: bid };
};

// The app must be able to SET ROLE crm_app, otherwise RLS would not apply to requests.
const verifyRoleSwitch = async () => {
  if (process.env.ALLOW_NO_RLS === 'true') {
    console.warn('WARNING: ALLOW_NO_RLS=true - tenant isolation relies on nothing but app code. Do not run multiple tenants like this.');
    return;
  }
  const client = await pool.connect();
  try {
    try {
      await client.query('SET ROLE crm_app');
    } catch (e) {
      await client.query('GRANT crm_app TO CURRENT_USER WITH SET TRUE'); // PostgreSQL 16+
      await client.query('SET ROLE crm_app');
    }
    const r = await client.query(`SELECT current_user AS u, (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) AS bypass`);
    if (r.rows[0].u !== 'crm_app' || r.rows[0].bypass) throw new Error('crm_app role bypasses RLS');
    await client.query('RESET ROLE');
  } catch (e) {
    throw new Error(`Cannot switch to RLS role crm_app (${e.message}). Fix DB permissions, or set ALLOW_NO_RLS=true for single-tenant use only.`);
  } finally {
    client.release();
  }
};

module.exports = { migrateMultiTenant, TENANT_TABLES, BRANCH_TABLES, GLOBAL_TABLES };
