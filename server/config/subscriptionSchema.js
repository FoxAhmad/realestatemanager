// Idempotent subscription/plan schema + seed data. Runs on every boot from dbInit, right after
// migrateMultiTenant. Everything here is configuration or platform data, so these tables are "global"
// (no RLS, revoked from crm_app): tenant code reaches them only through services that always pass an
// explicit tenant_id.
//
// New plans, features, limits and addons are rows, not schema or code changes.

const db = require('./database');
const pool = db.admin;

const SUBSCRIPTION_TABLES = [
  'plans', 'plan_prices', 'features', 'plan_features', 'limit_defs', 'plan_limits', 'addons', 'addon_prices',
  'tenant_subscriptions', 'tenant_addons', 'subscription_history', 'payment_methods', 'payment_transactions',
  'upgrade_requests', 'platform_settings',
];

// Seed catalog. Prices are PLACEHOLDERS the super admin edits on the Plans page.
const PLANS = [
  { code: 'basic', name: 'Basic', sort: 0, trial: 0, desc: 'Single branch for small teams.' },
  { code: 'silver', name: 'Silver', sort: 1, trial: 14, desc: 'Growing teams with a few branches.' },
  { code: 'gold', name: 'Gold', sort: 2, trial: 14, desc: 'Multiple branches, reports and API access.' },
  { code: 'platinum', name: 'Platinum', sort: 3, trial: 14, desc: 'Everything, unlimited.' },
  { code: 'custom', name: 'Custom', sort: 4, trial: 0, desc: 'Tailored plan configured by the platform admin.', custom: true },
];
const FEATURES = [
  ['multi_branch', 'Multi-branch', 'Create and manage more than one branch'],
  ['advanced_reports', 'Advanced reports', 'Advanced reporting and exports'],
  ['api_access', 'API access', 'Programmatic API access'],
  ['priority_support', 'Priority support', 'Priority support channel'],
];
const LIMIT_DEFS = [
  ['branches', 'Branches', 'branches'],
  ['users', 'Users', 'users'],
  ['storage_gb', 'Storage', 'GB'],
  ['api_requests', 'API requests', 'per month'],
  ['transactions_per_month', 'Transactions', 'per month'],
];
// feature set and limits per plan; null limit = unlimited
const PLAN_FEATURES = {
  basic: [], silver: ['multi_branch'], gold: ['multi_branch', 'advanced_reports', 'api_access'],
  platinum: ['multi_branch', 'advanced_reports', 'api_access', 'priority_support'],
  custom: ['multi_branch', 'advanced_reports', 'api_access', 'priority_support'],
};
const PLAN_LIMITS = {
  basic: { branches: 1, users: 10, storage_gb: 5, api_requests: 0, transactions_per_month: 500 },
  silver: { branches: 3, users: 25, storage_gb: 25, api_requests: 0, transactions_per_month: 2000 },
  gold: { branches: 10, users: 100, storage_gb: 100, api_requests: 10000, transactions_per_month: 10000 },
  platinum: { branches: null, users: null, storage_gb: null, api_requests: null, transactions_per_month: null },
  custom: { branches: null, users: null, storage_gb: null, api_requests: null, transactions_per_month: null },
};
// [monthly, yearly] per currency
const PLAN_PRICES = {
  basic: { PKR: [5000, 50000], USD: [20, 200] },
  silver: { PKR: [15000, 150000], USD: [55, 550] },
  gold: { PKR: [35000, 350000], USD: [125, 1250] },
  platinum: { PKR: [75000, 750000], USD: [275, 2750] },
  custom: { PKR: [0, 0], USD: [0, 0] },
};
// code, name, description, effect_type, limit_code, feature_code, amount, [PKR, USD] monthly price
const ADDONS = [
  ['extra_user', 'Extra user', 'One additional user seat', 'limit', 'users', null, 1, [500, 2]],
  ['extra_branch', 'Extra branch', 'One additional branch', 'limit', 'branches', null, 1, [5000, 20]],
  ['extra_storage', 'Additional storage', '10 GB more storage', 'limit', 'storage_gb', null, 10, [1000, 4]],
  ['sms_package', 'SMS package', 'Bundle of SMS credits (fulfilled manually)', 'custom', null, null, 0, [2000, 8]],
];

const migrateSubscriptions = async () => {
  const q = (sql, params) => pool.query(sql, params);

  await q(`CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    trial_days INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await q(`CREATE TABLE IF NOT EXISTS plan_prices (
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    currency CHAR(3) NOT NULL,
    monthly_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    yearly_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (plan_id, currency))`);
  await q(`CREATE TABLE IF NOT EXISTS features (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS plan_features (
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (plan_id, feature_id))`);
  await q(`CREATE TABLE IF NOT EXISTS limit_defs (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS plan_limits (
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    limit_code VARCHAR(50) NOT NULL REFERENCES limit_defs(code) ON DELETE CASCADE,
    limit_value BIGINT,
    PRIMARY KEY (plan_id, limit_code))`); // NULL limit_value = unlimited
  await q(`CREATE TABLE IF NOT EXISTS addons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    effect_type VARCHAR(10) NOT NULL DEFAULT 'custom' CHECK (effect_type IN ('limit', 'feature', 'custom')),
    limit_code VARCHAR(50) REFERENCES limit_defs(code),
    feature_code VARCHAR(50),
    amount BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE)`);
  await q(`CREATE TABLE IF NOT EXISTS addon_prices (
    addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
    currency CHAR(3) NOT NULL,
    monthly_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (addon_id, currency))`);
  await q(`CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('trial', 'active', 'grace', 'expired', 'suspended', 'cancelled')),
    billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    currency CHAR(3) NOT NULL DEFAULT 'PKR',
    provider VARCHAR(20),
    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    trial_ends_at TIMESTAMP,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`); // end_date NULL = never expires
  await q(`CREATE INDEX IF NOT EXISTS idx_tsub_status_end ON tenant_subscriptions(status, end_date)`);
  await q(`CREATE TABLE IF NOT EXISTS tenant_addons (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    addon_id INTEGER NOT NULL REFERENCES addons(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant ON tenant_addons(tenant_id, status)`);
  await q(`CREATE TABLE IF NOT EXISTS subscription_history (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    action VARCHAR(30) NOT NULL,
    from_plan_id INTEGER REFERENCES plans(id),
    to_plan_id INTEGER REFERENCES plans(id),
    details JSONB,
    actor_user_id INTEGER,
    actor_role VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sub_history_tenant ON subscription_history(tenant_id, created_at DESC)`);
  await q(`CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    provider VARCHAR(20) NOT NULL,
    provider_customer_id VARCHAR(100),
    provider_method_id VARCHAR(100),
    brand VARCHAR(30),
    last4 VARCHAR(4),
    exp_month INTEGER,
    exp_year INTEGER,
    label VARCHAR(100),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`); // never raw card data: provider tokens + display fields only
  await q(`CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant ON payment_methods(tenant_id, status)`);
  await q(`CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    provider VARCHAR(20) NOT NULL,
    reference VARCHAR(100) UNIQUE NOT NULL,
    provider_ref VARCHAR(100),
    kind VARCHAR(20) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
    intent JSONB,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_payment_tx_tenant ON payment_transactions(tenant_id, created_at DESC)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_provider_ref ON payment_transactions(provider, provider_ref) WHERE provider_ref IS NOT NULL`);
  await q(`CREATE TABLE IF NOT EXISTS upgrade_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    requested_plan_id INTEGER REFERENCES plans(id),
    message TEXT,
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await q(`CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL)`);

  // tenants.plan keeps mirroring the plan code (compat); the plan list is now data, so drop the fixed CHECK.
  await q(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check`);

  await seedCatalog();
  await migrateExistingTenants();

  // Platform-only tables: tenant requests (role crm_app) must never touch them directly.
  await q(`REVOKE ALL ON ${SUBSCRIPTION_TABLES.join(', ')} FROM crm_app`);
};

const seedCatalog = async () => {
  const q = (sql, params) => pool.query(sql, params);
  for (const [code, name, unit] of LIMIT_DEFS) {
    await q('INSERT INTO limit_defs (code, name, unit) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [code, name, unit]);
  }
  for (const [code, name, description] of FEATURES) {
    await q('INSERT INTO features (code, name, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [code, name, description]);
  }
  // Plans are seeded only when missing, so later edits made by the super admin are never overwritten.
  for (const p of PLANS) {
    const ins = await q(
      `INSERT INTO plans (code, name, description, trial_days, is_custom, sort_order) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [p.code, p.name, p.desc, p.trial, !!p.custom, p.sort]
    );
    if (!ins.rows.length) continue;
    const planId = ins.rows[0].id;
    for (const [fcode] of FEATURES) {
      await q(
        `INSERT INTO plan_features (plan_id, feature_id, enabled)
         SELECT $1, id, $3 FROM features WHERE code = $2 ON CONFLICT DO NOTHING`,
        [planId, fcode, PLAN_FEATURES[p.code].includes(fcode)]
      );
    }
    for (const [lcode] of LIMIT_DEFS) {
      await q('INSERT INTO plan_limits (plan_id, limit_code, limit_value) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [planId, lcode, PLAN_LIMITS[p.code][lcode]]);
    }
    for (const [cur, [monthly, yearly]] of Object.entries(PLAN_PRICES[p.code])) {
      await q('INSERT INTO plan_prices (plan_id, currency, monthly_price, yearly_price) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [planId, cur, monthly, yearly]);
    }
  }
  for (const [code, name, desc, type, limitCode, featureCode, amount, [pkr, usd]] of ADDONS) {
    const ins = await q(
      `INSERT INTO addons (code, name, description, effect_type, limit_code, feature_code, amount) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [code, name, desc, type, limitCode, featureCode, amount]
    );
    if (!ins.rows.length) continue;
    await q('INSERT INTO addon_prices (addon_id, currency, monthly_price) VALUES ($1, $2, $3), ($1, $4, $5) ON CONFLICT DO NOTHING',
      [ins.rows[0].id, 'PKR', pkr, 'USD', usd]);
  }
  await q(`INSERT INTO platform_settings (key, value) VALUES
      ('contact_info', 'Please contact your system administrator.'),
      ('grace_days', '7')
    ON CONFLICT DO NOTHING`);
};

// Existing tenants get an active, non-expiring subscription mapped from their old plan name.
// basic -> Basic, pro -> Silver, platinum -> Platinum (anything else -> Basic).
const migrateExistingTenants = async () => {
  await pool.query(
    `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, currency)
     SELECT t.id,
            (SELECT p.id FROM plans p WHERE p.code = CASE t.plan WHEN 'pro' THEN 'silver' WHEN 'platinum' THEN 'platinum' ELSE 'basic' END),
            CASE WHEN t.status = 'suspended' THEN 'suspended' ELSE 'active' END,
            'PKR'
     FROM tenants t
     WHERE NOT EXISTS (SELECT 1 FROM tenant_subscriptions s WHERE s.tenant_id = t.id)`
  );
  await pool.query(
    `INSERT INTO subscription_history (tenant_id, action, to_plan_id, details, actor_role)
     SELECT s.tenant_id, 'migrated', s.plan_id, '{"note":"created from the legacy tenants.plan value"}', 'system'
     FROM tenant_subscriptions s
     WHERE NOT EXISTS (SELECT 1 FROM subscription_history h WHERE h.tenant_id = s.tenant_id)`
  );
  await pool.query(
    `UPDATE tenants t SET plan = p.code FROM tenant_subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.tenant_id = t.id AND t.plan IS DISTINCT FROM p.code`
  );
};

module.exports = { migrateSubscriptions, SUBSCRIPTION_TABLES };
