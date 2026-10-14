const db = require('../config/database');
const { httpError } = require('./entitlementService');

const pool = db.admin;
const CURRENCIES = ['PKR', 'USD'];
const CODE_RE = /^[a-z0-9_]{2,50}$/;

const tx = async (fn) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
};
const dup = (e, msg) => { if (e.code === '23505') throw httpError(400, msg); throw e; };
const assertCode = (code) => { if (!CODE_RE.test(code || '')) throw httpError(400, 'code must be 2-50 characters: lowercase letters, digits and underscores'); };
const num = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw httpError(400, `${label} must be a number >= 0`);
  return n;
};

// ---- Plans -------------------------------------------------------------------------------------------------

const listPlans = async () => {
  const [plans, prices, feats, limits, subs] = await Promise.all([
    pool.query('SELECT * FROM plans ORDER BY sort_order, id'),
    pool.query('SELECT plan_id, currency, monthly_price, yearly_price FROM plan_prices'),
    pool.query('SELECT pf.plan_id, f.code, pf.enabled FROM plan_features pf JOIN features f ON f.id = pf.feature_id'),
    pool.query('SELECT plan_id, limit_code, limit_value FROM plan_limits'),
    pool.query('SELECT plan_id, count(*)::int n FROM tenant_subscriptions GROUP BY plan_id'),
  ]);
  return plans.rows.map((p) => ({
    ...p,
    prices: prices.rows.filter((x) => x.plan_id === p.id).map((x) => ({ currency: x.currency.trim(), monthly_price: Number(x.monthly_price), yearly_price: Number(x.yearly_price) })),
    features: Object.fromEntries(feats.rows.filter((x) => x.plan_id === p.id).map((x) => [x.code, x.enabled])),
    limits: Object.fromEntries(limits.rows.filter((x) => x.plan_id === p.id).map((x) => [x.limit_code, x.limit_value === null ? null : Number(x.limit_value)])),
    tenant_count: (subs.rows.find((x) => x.plan_id === p.id) || { n: 0 }).n,
  }));
};

// New plans start with every feature off and every limit at 0 (nothing allowed) until configured.
const createPlan = async ({ code, name, description, trial_days = 0, is_custom = false, sort_order }) => {
  assertCode(code);
  if (!name || !String(name).trim()) throw httpError(400, 'name is required');
  try {
    return await tx(async (c) => {
      const next = sort_order ?? ((await c.query('SELECT coalesce(max(sort_order), -1) + 1 AS n FROM plans')).rows[0].n);
      const p = (await c.query(
        'INSERT INTO plans (code, name, description, trial_days, is_custom, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [code, String(name).trim(), description || null, Math.max(0, parseInt(trial_days, 10) || 0), !!is_custom, next])).rows[0];
      await c.query('INSERT INTO plan_features (plan_id, feature_id, enabled) SELECT $1, id, FALSE FROM features', [p.id]);
      await c.query('INSERT INTO plan_limits (plan_id, limit_code, limit_value) SELECT $1, code, 0 FROM limit_defs', [p.id]);
      for (const cur of CURRENCIES) await c.query('INSERT INTO plan_prices (plan_id, currency) VALUES ($1, $2)', [p.id, cur]);
      return p;
    });
  } catch (e) { return dup(e, 'A plan with this code already exists'); }
};

const updatePlan = async (id, { name, description, trial_days, is_active, sort_order }) => {
  const r = await pool.query(
    `UPDATE plans SET name = COALESCE($1, name), description = COALESCE($2, description), trial_days = COALESCE($3, trial_days),
       is_active = COALESCE($4, is_active), sort_order = COALESCE($5, sort_order) WHERE id = $6 RETURNING *`,
    [name ? String(name).trim() : null, description ?? null, trial_days === undefined ? null : Math.max(0, parseInt(trial_days, 10) || 0),
      is_active === undefined ? null : !!is_active, sort_order === undefined ? null : parseInt(sort_order, 10), id]);
  if (!r.rows.length) throw httpError(404, 'Plan not found');
  return r.rows[0];
};

const setPrices = (id, prices) => tx(async (c) => {
  for (const p of prices || []) {
    if (!CURRENCIES.includes(p.currency)) throw httpError(400, `currency must be one of: ${CURRENCIES.join(', ')}`);
    await c.query(
      `INSERT INTO plan_prices (plan_id, currency, monthly_price, yearly_price) VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_id, currency) DO UPDATE SET monthly_price = $3, yearly_price = $4`,
      [id, p.currency, num(p.monthly_price, 'monthly_price'), num(p.yearly_price, 'yearly_price')]);
  }
  return { saved: true };
});

const setFeatures = (id, features) => tx(async (c) => {
  for (const [code, enabled] of Object.entries(features || {})) {
    const f = await c.query('SELECT id FROM features WHERE code = $1', [code]);
    if (!f.rows.length) throw httpError(400, `Unknown feature: ${code}`);
    await c.query(
      `INSERT INTO plan_features (plan_id, feature_id, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (plan_id, feature_id) DO UPDATE SET enabled = $3`, [id, f.rows[0].id, !!enabled]);
  }
  return { saved: true };
});

// limit value null = unlimited
const setLimits = (id, limits) => tx(async (c) => {
  for (const [code, value] of Object.entries(limits || {})) {
    const d = await c.query('SELECT 1 FROM limit_defs WHERE code = $1', [code]);
    if (!d.rows.length) throw httpError(400, `Unknown limit: ${code}`);
    await c.query(
      `INSERT INTO plan_limits (plan_id, limit_code, limit_value) VALUES ($1, $2, $3)
       ON CONFLICT (plan_id, limit_code) DO UPDATE SET limit_value = $3`,
      [id, code, value === null || value === '' ? null : Math.floor(num(value, `limit ${code}`))]);
  }
  return { saved: true };
});

// Copy of a plan: the way to give one tenant its own "Custom" plan without affecting others.
const clonePlan = async (id, { code, name }) => {
  assertCode(code);
  try {
    return await tx(async (c) => {
      const src = (await c.query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
      if (!src) throw httpError(404, 'Plan not found');
      const p = (await c.query(
        `INSERT INTO plans (code, name, description, trial_days, is_custom, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING *`,
        [code, name || `${src.name} (copy)`, src.description, src.trial_days, src.sort_order])).rows[0];
      await c.query('INSERT INTO plan_features (plan_id, feature_id, enabled) SELECT $1, feature_id, enabled FROM plan_features WHERE plan_id = $2', [p.id, id]);
      await c.query('INSERT INTO plan_limits (plan_id, limit_code, limit_value) SELECT $1, limit_code, limit_value FROM plan_limits WHERE plan_id = $2', [p.id, id]);
      await c.query('INSERT INTO plan_prices (plan_id, currency, monthly_price, yearly_price) SELECT $1, currency, monthly_price, yearly_price FROM plan_prices WHERE plan_id = $2', [p.id, id]);
      return p;
    });
  } catch (e) { return dup(e, 'A plan with this code already exists'); }
};

// ---- Features and limit definitions (rows, so new ones need no code change) ----------------------------------

const listFeatures = async () => ({
  features: (await pool.query('SELECT * FROM features ORDER BY id')).rows,
  limits: (await pool.query('SELECT * FROM limit_defs ORDER BY code')).rows,
});

const createFeature = async ({ code, name, description }) => {
  assertCode(code);
  if (!name) throw httpError(400, 'name is required');
  try {
    return await tx(async (c) => {
      const f = (await c.query('INSERT INTO features (code, name, description) VALUES ($1, $2, $3) RETURNING *', [code, name, description || null])).rows[0];
      await c.query('INSERT INTO plan_features (plan_id, feature_id, enabled) SELECT id, $1, FALSE FROM plans', [f.id]);
      return f;
    });
  } catch (e) { return dup(e, 'A feature with this code already exists'); }
};

const updateFeature = async (id, { name, description }) => {
  const r = await pool.query('UPDATE features SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *', [name || null, description ?? null, id]);
  if (!r.rows.length) throw httpError(404, 'Feature not found');
  return r.rows[0];
};

const createLimitDef = async ({ code, name, unit }) => {
  assertCode(code);
  if (!name) throw httpError(400, 'name is required');
  try {
    return await tx(async (c) => {
      const d = (await c.query('INSERT INTO limit_defs (code, name, unit) VALUES ($1, $2, $3) RETURNING *', [code, name, unit || null])).rows[0];
      await c.query('INSERT INTO plan_limits (plan_id, limit_code, limit_value) SELECT id, $1, 0 FROM plans', [code]);
      return d;
    });
  } catch (e) { return dup(e, 'A limit with this code already exists'); }
};

// ---- Addons --------------------------------------------------------------------------------------------------

const listAddons = async () => {
  const [a, p] = await Promise.all([
    pool.query('SELECT * FROM addons ORDER BY id'),
    pool.query('SELECT addon_id, currency, monthly_price FROM addon_prices'),
  ]);
  return a.rows.map((x) => ({
    ...x, amount: Number(x.amount),
    prices: p.rows.filter((r) => r.addon_id === x.id).map((r) => ({ currency: r.currency.trim(), monthly_price: Number(r.monthly_price) })),
  }));
};

const writeAddonPrices = async (c, id, prices) => {
  for (const p of prices || []) {
    if (!CURRENCIES.includes(p.currency)) throw httpError(400, `currency must be one of: ${CURRENCIES.join(', ')}`);
    await c.query(
      `INSERT INTO addon_prices (addon_id, currency, monthly_price) VALUES ($1, $2, $3)
       ON CONFLICT (addon_id, currency) DO UPDATE SET monthly_price = $3`, [id, p.currency, num(p.monthly_price, 'monthly_price')]);
  }
};

const createAddon = async ({ code, name, description, effect_type = 'custom', limit_code, feature_code, amount = 0, prices }) => {
  assertCode(code);
  if (!name) throw httpError(400, 'name is required');
  if (!['limit', 'feature', 'custom'].includes(effect_type)) throw httpError(400, 'effect_type must be limit, feature or custom');
  if (effect_type === 'limit' && !limit_code) throw httpError(400, 'limit_code is required for a limit addon');
  if (effect_type === 'feature' && !feature_code) throw httpError(400, 'feature_code is required for a feature addon');
  try {
    return await tx(async (c) => {
      const a = (await c.query(
        `INSERT INTO addons (code, name, description, effect_type, limit_code, feature_code, amount) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [code, name, description || null, effect_type, effect_type === 'limit' ? limit_code : null, effect_type === 'feature' ? feature_code : null, Math.floor(num(amount, 'amount'))])).rows[0];
      await writeAddonPrices(c, a.id, prices);
      return a;
    });
  } catch (e) { return dup(e, 'An addon with this code already exists'); }
};

const updateAddon = (id, { name, description, is_active, amount, prices }) => tx(async (c) => {
  const r = await c.query(
    `UPDATE addons SET name = COALESCE($1, name), description = COALESCE($2, description), is_active = COALESCE($3, is_active),
       amount = COALESCE($4, amount) WHERE id = $5 RETURNING *`,
    [name || null, description ?? null, is_active === undefined ? null : !!is_active, amount === undefined ? null : Math.floor(num(amount, 'amount')), id]);
  if (!r.rows.length) throw httpError(404, 'Addon not found');
  await writeAddonPrices(c, id, prices);
  return r.rows[0];
});

module.exports = {
  listPlans, createPlan, updatePlan, setPrices, setFeatures, setLimits, clonePlan,
  listFeatures, createFeature, updateFeature, createLimitDef, listAddons, createAddon, updateAddon,
};
