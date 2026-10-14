const db = require('../config/database');

const pool = db.admin; // platform tables: always queried with an explicit tenant_id

const httpError = (status, message, code, extra) => Object.assign(new Error(message), { status, code, ...extra });

const LIMIT_ERROR_CODES = {
  branches: 'BRANCH_LIMIT_REACHED',
  users: 'USER_LIMIT_REACHED',
  storage_gb: 'STORAGE_LIMIT_REACHED',
  api_requests: 'API_LIMIT_REACHED',
  transactions_per_month: 'TRANSACTION_LIMIT_REACHED',
};
// Statuses in which the tenant may create/change data. Grace keeps full access (with a warning banner).
const WRITABLE = ['trial', 'active', 'grace'];

const getSetting = async (key, fallback) => {
  const r = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return r.rows.length ? r.rows[0].value : fallback;
};

// Pure: the status a subscription should have *now*. No scheduler needed; it is evaluated on request.
// end_date NULL = never expires. Cancelled/suspended/expired are never revived by the clock.
const effectiveStatus = (sub, now = new Date(), graceDays = 7) => {
  if (!['trial', 'active', 'grace'].includes(sub.status) || !sub.end_date) return sub.status;
  const end = new Date(sub.end_date).getTime();
  const t = now.getTime();
  if (t <= end) return sub.status === 'grace' ? 'active' : sub.status;
  return t <= end + graceDays * 86400000 ? 'grace' : 'expired';
};

const hasPaymentMethod = async (tenantId) =>
  (await pool.query(`SELECT 1 FROM payment_methods WHERE tenant_id = $1 AND status = 'active' LIMIT 1`, [tenantId])).rows.length > 0;

// Plan + active addons -> what this tenant can do. Also advances the status when the end date has passed.
const getEntitlements = async (tenantId) => {
  const s = await pool.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.sort_order
     FROM tenant_subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = $1`, [tenantId]);
  if (!s.rows.length) throw httpError(403, 'No subscription found for this account. Contact your administrator.', 'NO_SUBSCRIPTION');
  const sub = s.rows[0];

  const status = effectiveStatus(sub, new Date(), Number(await getSetting('grace_days', '7')));
  if (status !== sub.status) {
    await pool.query('UPDATE tenant_subscriptions SET status = $1, updated_at = now() WHERE tenant_id = $2', [status, tenantId]);
    await pool.query(
      `INSERT INTO subscription_history (tenant_id, action, from_plan_id, to_plan_id, details, actor_role)
       VALUES ($1, 'status_change', $2, $2, $3, 'system')`,
      [tenantId, sub.plan_id, JSON.stringify({ from: sub.status, to: status, reason: 'end date passed' })]);
    sub.status = status;
  }

  const [feat, lim, add] = await Promise.all([
    pool.query(`SELECT f.code FROM plan_features pf JOIN features f ON f.id = pf.feature_id WHERE pf.plan_id = $1 AND pf.enabled`, [sub.plan_id]),
    pool.query('SELECT limit_code, limit_value FROM plan_limits WHERE plan_id = $1', [sub.plan_id]),
    pool.query(
      `SELECT a.effect_type, a.limit_code, a.feature_code, a.amount, ta.quantity
       FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = $1 AND ta.status = 'active'`, [tenantId]),
  ]);

  const features = new Set(feat.rows.map((r) => r.code));
  const limits = {};
  for (const r of lim.rows) limits[r.limit_code] = r.limit_value === null ? null : Number(r.limit_value);
  for (const a of add.rows) {
    if (a.effect_type === 'feature' && a.feature_code) features.add(a.feature_code);
    // an addon can only raise a finite limit; unlimited stays unlimited
    if (a.effect_type === 'limit' && a.limit_code && limits[a.limit_code] !== null && limits[a.limit_code] !== undefined) {
      limits[a.limit_code] += Number(a.amount) * a.quantity;
    }
  }

  return {
    subscription: {
      status: sub.status, billingCycle: sub.billing_cycle, currency: sub.currency, provider: sub.provider,
      startDate: sub.start_date, endDate: sub.end_date, trialEndsAt: sub.trial_ends_at, autoRenew: sub.auto_renew,
      planId: sub.plan_id, planCode: sub.plan_code, planName: sub.plan_name, planRank: sub.sort_order,
    },
    features,
    limits,
    canWrite: WRITABLE.includes(sub.status),
  };
};

// Current usage per limit. storage_gb and api_requests are not metered yet (always 0).
const getUsage = async (tenantId) => {
  const [b, u, t] = await Promise.all([
    pool.query('SELECT count(*)::int n FROM branches WHERE tenant_id = $1 AND is_active', [tenantId]),
    pool.query(`SELECT count(*)::int n FROM users WHERE tenant_id = $1 AND role <> 'super_admin'`, [tenantId]),
    pool.query(`SELECT count(*)::int n FROM transactions WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`, [tenantId]),
  ]);
  return { branches: b.rows[0].n, users: u.rows[0].n, transactions_per_month: t.rows[0].n, storage_gb: 0, api_requests: 0 };
};

const upgradeHint = async (tenantId) =>
  (await hasPaymentMethod(tenantId))
    ? 'Upgrade your plan from the My Plan page to continue.'
    : 'Contact your administrator to upgrade your plan.';

const assertFeature = async (tenantId, ent, featureCode, label = featureCode) => {
  if (!ent.features.has(featureCode)) {
    throw httpError(403, `${label} is not included in your ${ent.subscription.planName} plan. ${await upgradeHint(tenantId)}`,
      'FEATURE_NOT_IN_PLAN', { feature: featureCode });
  }
};

// Throws when adding `adding` more would exceed the limit. A NULL limit is unlimited.
const assertLimit = async (tenantId, ent, limitCode, adding = 1, usage = null) => {
  const limit = ent.limits[limitCode];
  if (limit === null || limit === undefined) return;
  const used = (usage || (await getUsage(tenantId)))[limitCode] || 0;
  if (used + adding > limit) {
    const name = limitCode.replace(/_/g, ' ');
    throw httpError(403, `Limit reached: your ${ent.subscription.planName} plan allows ${limit} ${name} (${used} used). ${await upgradeHint(tenantId)}`,
      LIMIT_ERROR_CODES[limitCode] || `${limitCode.toUpperCase()}_LIMIT_REACHED`, { limit: limitCode, allowed: limit, used });
  }
};

// Convenience for call sites that only know the tenant id (e.g. creating a user).
const assertLimitFor = async (tenantId, limitCode, adding = 1) => {
  const ent = await getEntitlements(tenantId);
  if (!ent.canWrite) throw httpError(403, `Your subscription is ${ent.subscription.status}. ${await upgradeHint(tenantId)}`, 'SUBSCRIPTION_INACTIVE');
  await assertLimit(tenantId, ent, limitCode, adding);
};

module.exports = {
  httpError, effectiveStatus, getEntitlements, getUsage, hasPaymentMethod, getSetting,
  assertFeature, assertLimit, assertLimitFor, WRITABLE, LIMIT_ERROR_CODES,
};
