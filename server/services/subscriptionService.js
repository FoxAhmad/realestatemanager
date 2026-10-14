const crypto = require('crypto');
const db = require('../config/database');
const ent = require('./entitlementService');
const payments = require('./payments');

const pool = db.admin; // platform tables: every statement carries an explicit tenant_id
const { httpError } = ent;

const tx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const addPeriod = (from, cycle) => {
  const d = new Date(from);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d;
};
const CYCLES = ['monthly', 'yearly'];
const CURRENCIES = ['PKR', 'USD'];
const actorOf = (actor) => ({ id: (actor && actor.id) || null, role: (actor && actor.role) || 'system' });

const log = (c, tenantId, action, { fromPlanId = null, toPlanId = null, details = null, actor } = {}) =>
  c.query(
    `INSERT INTO subscription_history (tenant_id, action, from_plan_id, to_plan_id, details, actor_user_id, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, action, fromPlanId, toPlanId, details ? JSON.stringify(details) : null, actorOf(actor).id, actorOf(actor).role]);

const getPlan = async (c, codeOrId) => {
  const r = await c.query(
    typeof codeOrId === 'number' ? 'SELECT * FROM plans WHERE id = $1' : 'SELECT * FROM plans WHERE code = $1', [codeOrId]);
  if (!r.rows.length) throw httpError(404, 'Plan not found');
  return r.rows[0];
};
const getSub = async (c, tenantId, lock = false) => {
  const r = await c.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.sort_order FROM tenant_subscriptions s
     JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`, [tenantId]);
  if (!r.rows.length) throw httpError(404, 'This tenant has no subscription');
  return r.rows[0];
};
const syncTenantPlan = (c, tenantId, planCode) => c.query('UPDATE tenants SET plan = $1 WHERE id = $2', [planCode, tenantId]);

// Where would the tenant exceed the new plan's limits? (never deletes anything; creation is blocked and the
// excess branches become read-only, see resolveBranchAccess)
const overLimits = async (c, tenantId, planId) => {
  const [lim, used] = await Promise.all([
    c.query('SELECT limit_code, limit_value FROM plan_limits WHERE plan_id = $1 AND limit_value IS NOT NULL', [planId]),
    ent.getUsage(tenantId),
  ]);
  return lim.rows.filter((l) => (used[l.limit_code] || 0) > Number(l.limit_value))
    .map((l) => ({ limit: l.limit_code, allowed: Number(l.limit_value), used: used[l.limit_code] }));
};

// ---- Super-admin workflows -----------------------------------------------------------------------------------

// Create or replace the tenant's subscription (new tenant, or restarting from scratch).
const activate = async (tenantId, planCode, opts = {}, actor, client = null) => {
  const { billingCycle = 'monthly', currency = 'PKR', trial = false } = opts;
  if (!CYCLES.includes(billingCycle)) throw httpError(400, `billingCycle must be one of: ${CYCLES.join(', ')}`);
  if (!CURRENCIES.includes(currency)) throw httpError(400, `currency must be one of: ${CURRENCIES.join(', ')}`);
  const run = async (c) => {
    const plan = await getPlan(c, planCode);
    if (!plan.is_active) throw httpError(400, 'This plan is not active');
    const now = new Date();
    const useTrial = trial && plan.trial_days > 0;
    const end = useTrial ? new Date(now.getTime() + plan.trial_days * 86400000) : addPeriod(now, billingCycle);
    const prev = await c.query('SELECT plan_id FROM tenant_subscriptions WHERE tenant_id = $1', [tenantId]);
    await c.query(
      `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, currency, start_date, end_date, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id) DO UPDATE SET plan_id = $2, status = $3, billing_cycle = $4, currency = $5,
         start_date = $6, end_date = $7, trial_ends_at = $8, updated_at = now()`,
      [tenantId, plan.id, useTrial ? 'trial' : 'active', billingCycle, currency, now, end, useTrial ? end : null]);
    await syncTenantPlan(c, tenantId, plan.code);
    await log(c, tenantId, 'activate', {
      fromPlanId: prev.rows[0] ? prev.rows[0].plan_id : null, toPlanId: plan.id,
      details: { billingCycle, currency, trial: useTrial, endDate: end }, actor });
    return getSub(c, tenantId);
  };
  return client ? run(client) : tx(run);
};

// Super admin moves a tenant to another plan (upgrade or downgrade); keeps the current period.
const changePlan = async (tenantId, planCode, actor, opts = {}, client = null) => {
  const run = async (c) => {
    const sub = await getSub(c, tenantId, true);
    const plan = await getPlan(c, planCode);
    if (!plan.is_active) throw httpError(400, 'This plan is not active');
    if (plan.id === sub.plan_id && !opts.billingCycle && !opts.currency) return { subscription: sub, warnings: [] };
    const action = plan.sort_order > sub.sort_order ? 'upgrade' : (plan.sort_order < sub.sort_order ? 'downgrade' : 'plan_change');
    const cycle = opts.billingCycle || sub.billing_cycle;
    const currency = opts.currency || sub.currency;
    if (!CYCLES.includes(cycle)) throw httpError(400, `billingCycle must be one of: ${CYCLES.join(', ')}`);
    if (!CURRENCIES.includes(currency)) throw httpError(400, `currency must be one of: ${CURRENCIES.join(', ')}`);
    await c.query('UPDATE tenant_subscriptions SET plan_id = $1, billing_cycle = $2, currency = $3, updated_at = now() WHERE tenant_id = $4',
      [plan.id, cycle, currency, tenantId]);
    await syncTenantPlan(c, tenantId, plan.code);
    const warnings = await overLimits(c, tenantId, plan.id);
    await log(c, tenantId, action, { fromPlanId: sub.plan_id, toPlanId: plan.id, details: { cycle, currency, warnings }, actor });
    return { subscription: await getSub(c, tenantId), warnings };
  };
  return client ? run(client) : tx(run);
};

const renew = (tenantId, actor, opts = {}) => tx(async (c) => {
  const sub = await getSub(c, tenantId, true);
  const cycle = opts.billingCycle || sub.billing_cycle;
  if (!CYCLES.includes(cycle)) throw httpError(400, `billingCycle must be one of: ${CYCLES.join(', ')}`);
  const from = sub.end_date && new Date(sub.end_date) > new Date() ? sub.end_date : new Date();
  const end = addPeriod(from, cycle);
  await c.query(`UPDATE tenant_subscriptions SET status = 'active', billing_cycle = $1, end_date = $2, trial_ends_at = NULL, updated_at = now() WHERE tenant_id = $3`,
    [cycle, end, tenantId]);
  await log(c, tenantId, 'renewal', { fromPlanId: sub.plan_id, toPlanId: sub.plan_id, details: { cycle, endDate: end, previousStatus: sub.status }, actor });
  return getSub(c, tenantId);
});

const setStatus = (tenantId, status, action, actor) => tx(async (c) => {
  const sub = await getSub(c, tenantId, true);
  await c.query('UPDATE tenant_subscriptions SET status = $1, updated_at = now() WHERE tenant_id = $2', [status, tenantId]);
  await log(c, tenantId, action, { fromPlanId: sub.plan_id, toPlanId: sub.plan_id, details: { from: sub.status, to: status }, actor });
  return getSub(c, tenantId);
});
const cancel = (tenantId, actor) => setStatus(tenantId, 'cancelled', 'cancellation', actor);
const suspend = (tenantId, actor) => setStatus(tenantId, 'suspended', 'suspension', actor);

// Brings a cancelled/suspended/expired subscription back; starts a new period if the old one is over.
const reactivate = (tenantId, actor) => tx(async (c) => {
  const sub = await getSub(c, tenantId, true);
  if (['active', 'trial'].includes(sub.status)) throw httpError(400, 'Subscription is already active');
  const expired = !sub.end_date || new Date(sub.end_date) <= new Date();
  const end = expired && sub.end_date ? addPeriod(new Date(), sub.billing_cycle) : sub.end_date;
  await c.query(`UPDATE tenant_subscriptions SET status = 'active', end_date = $1, updated_at = now() WHERE tenant_id = $2`, [end, tenantId]);
  await log(c, tenantId, 'reactivation', { fromPlanId: sub.plan_id, toPlanId: sub.plan_id, details: { from: sub.status, endDate: end }, actor });
  return getSub(c, tenantId);
});

const addAddon = (tenantId, addonCode, quantity, actor) => tx(async (c) => {
  const a = await c.query('SELECT * FROM addons WHERE code = $1', [addonCode]);
  if (!a.rows.length || !a.rows[0].is_active) throw httpError(404, 'Addon not found');
  const qty = Number(quantity) || 1;
  if (!Number.isInteger(qty) || qty < 1) throw httpError(400, 'quantity must be a positive whole number');
  const r = await c.query('INSERT INTO tenant_addons (tenant_id, addon_id, quantity) VALUES ($1, $2, $3) RETURNING id', [tenantId, a.rows[0].id, qty]);
  await log(c, tenantId, 'addon_add', { details: { addon: addonCode, quantity: qty }, actor });
  return { id: r.rows[0].id };
});

const removeAddon = (tenantId, tenantAddonId, actor) => tx(async (c) => {
  const r = await c.query(
    `UPDATE tenant_addons SET status = 'removed' WHERE id = $1 AND tenant_id = $2 AND status = 'active'
     RETURNING addon_id, quantity`, [tenantAddonId, tenantId]);
  if (!r.rows.length) throw httpError(404, 'Addon not found');
  await log(c, tenantId, 'addon_remove', { details: { addonId: r.rows[0].addon_id, quantity: r.rows[0].quantity }, actor });
  return { removed: true };
});

// ---- Payment methods -----------------------------------------------------------------------------------------

const getMethod = async (tenantId) =>
  (await pool.query(`SELECT * FROM payment_methods WHERE tenant_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`, [tenantId])).rows[0] || null;

const publicMethod = (m) => (m && {
  provider: m.provider, brand: m.brand, last4: m.last4, expMonth: m.exp_month, expYear: m.exp_year, label: m.label,
});

// One active method per tenant: attaching a new one retires the old one.
const saveMethod = (tenantId, m) => tx(async (c) => {
  await c.query(`UPDATE payment_methods SET status = 'removed' WHERE tenant_id = $1 AND status = 'active'`, [tenantId]);
  await c.query(
    `INSERT INTO payment_methods (tenant_id, provider, provider_customer_id, provider_method_id, brand, last4, exp_month, exp_year, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [tenantId, m.provider, m.customerId || null, m.methodId || null, m.brand || null, m.last4 || null, m.expMonth || null, m.expYear || null, m.label || null]);
  await log(c, tenantId, 'payment_method_added', { details: { provider: m.provider, last4: m.last4 || null }, actor: m.actor });
});

const removeMethod = async (tenantId, actor) => {
  const r = await pool.query(`UPDATE payment_methods SET status = 'removed' WHERE tenant_id = $1 AND status = 'active' RETURNING id`, [tenantId]);
  if (r.rows.length) await log(pool, tenantId, 'payment_method_removed', { actor });
  return { removed: r.rows.length > 0 };
};

// Tenant admin attaches a card (providers that can save one, e.g. Stripe).
const beginAttach = async ({ tenant, user, providerName, successUrl, cancelUrl }) => {
  const sub = await getSub(pool, tenant.id);
  const provider = payments.getProvider(providerName);
  if (!provider.savesMethods) throw httpError(400, 'This provider cannot save a payment method here. Ask your administrator to enable it.', 'CONTACT_ADMIN');
  if (!provider.currencies.includes(sub.currency)) throw httpError(400, `${providerName} does not support ${sub.currency}`);
  const existing = await getMethod(tenant.id);
  const r = await provider.startSetup({ tenant, user, customerId: existing && existing.provider === providerName ? existing.provider_customer_id : null, successUrl, cancelUrl });
  if (r.attached) { // dev-only fake provider attaches instantly
    await saveMethod(tenant.id, { provider: providerName, customerId: r.customerId, ...r.attached, actor: { id: user.id, role: user.role } });
    return { url: r.url, attached: true };
  }
  return { url: r.url };
};

// Super admin enables hosted-checkout providers (JazzCash/OPay) for a tenant: no card can be stored for these,
// so "attached" means the platform admin has approved the tenant to pay through the provider's hosted page.
const enableHosted = async (tenantId, providerName, actor) => {
  const provider = payments.registry[providerName];
  if (!provider || provider.savesMethods) throw httpError(400, 'Only hosted-checkout providers (jazzcash, opay) can be enabled this way');
  await saveMethod(tenantId, { provider: providerName, label: `${providerName === 'jazzcash' ? 'JazzCash' : 'OPay'} hosted checkout`, actor });
  return { enabled: true };
};

// ---- Payments -> subscription changes --------------------------------------------------------------------------

const newReference = (tenantId, kind) => `${kind === 'upgrade' ? 'UP' : 'PAY'}-${tenantId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

// The ONLY place a payment turns into a plan change. Idempotent (a replayed callback/webhook does nothing)
// and amount-checked (a callback for a different amount never activates anything).
const finalizePayment = async (reference, result) => {
  const out = await finalizeInTx(reference, result);
  // the rejection is committed first, so a rejected payment stays rejected
  if (out.mismatch) throw httpError(400, 'Payment amount does not match', 'AMOUNT_MISMATCH');
  return out;
};

const finalizeInTx = (reference, result) => tx(async (c) => {
  const t = await c.query('SELECT * FROM payment_transactions WHERE reference = $1 FOR UPDATE', [reference]);
  if (!t.rows.length) throw httpError(404, 'Unknown payment reference', 'UNKNOWN_REFERENCE');
  const row = t.rows[0];
  if (row.status !== 'pending') return { already: true, status: row.status };

  if (result.status === 'failed') {
    await c.query(`UPDATE payment_transactions SET status = 'failed', provider_ref = COALESCE($1, provider_ref) WHERE id = $2`, [result.providerRef || null, row.id]);
    return { status: 'failed' };
  }
  if (result.status !== 'succeeded') return { status: 'pending' };

  if (Number(result.amount) !== Number(row.amount) || (result.currency && result.currency !== row.currency)) {
    await c.query(`UPDATE payment_transactions SET status = 'failed' WHERE id = $1`, [row.id]);
    await log(c, row.tenant_id, 'payment_rejected', { details: { reference, reason: 'amount/currency mismatch', expected: [row.amount, row.currency], got: [result.amount, result.currency] } });
    return { mismatch: true };
  }
  await c.query(`UPDATE payment_transactions SET status = 'succeeded', verified_at = now(), provider_ref = COALESCE($1, provider_ref) WHERE id = $2`,
    [result.providerRef || null, row.id]);

  if (row.kind === 'upgrade') {
    const { planCode, cycle, actorUserId } = row.intent;
    const sub = await getSub(c, row.tenant_id, true);
    const plan = await getPlan(c, planCode);
    const now = new Date();
    const end = addPeriod(now, cycle);
    await c.query(
      `UPDATE tenant_subscriptions SET plan_id = $1, status = 'active', billing_cycle = $2, provider = $3, start_date = $4,
         end_date = $5, trial_ends_at = NULL, updated_at = now() WHERE tenant_id = $6`,
      [plan.id, cycle, row.provider, now, end, row.tenant_id]);
    await syncTenantPlan(c, row.tenant_id, plan.code);
    await log(c, row.tenant_id, 'upgrade', {
      fromPlanId: sub.plan_id, toPlanId: plan.id,
      details: { reference, amount: row.amount, currency: row.currency, provider: row.provider, cycle, endDate: end },
      actor: { id: actorUserId, role: 'admin' } });
  }
  return { status: 'succeeded', kind: row.kind };
});

const createTransaction = async ({ tenantId, provider, kind, amount, currency, intent }) => {
  const reference = newReference(tenantId, kind);
  await pool.query(
    `INSERT INTO payment_transactions (tenant_id, provider, reference, kind, amount, currency, intent) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, provider, reference, kind, amount, currency, JSON.stringify(intent)]);
  return reference;
};

// Tenant admin upgrades their own plan. Allowed ONLY with a payment method on file; otherwise they must
// contact the platform administrator. Only a strictly higher plan can be chosen here.
const startUpgrade = async ({ tenantId, user, planCode, cycle = 'monthly', returnUrl, callbackUrl, cancelUrl }) => {
  if (!CYCLES.includes(cycle)) throw httpError(400, `cycle must be one of: ${CYCLES.join(', ')}`);
  const sub = await getSub(pool, tenantId);
  const method = await getMethod(tenantId);
  if (!method) {
    throw httpError(403, `No payment method on file. ${await ent.getSetting('contact_info', 'Contact your administrator.')}`, 'CONTACT_ADMIN');
  }
  const plan = await getPlan(pool, planCode);
  if (!plan.is_active || plan.is_custom) throw httpError(400, 'This plan cannot be purchased online. Contact your administrator.', 'CONTACT_ADMIN');
  if (plan.sort_order <= sub.sort_order) throw httpError(400, 'You can only upgrade to a higher plan here. Contact your administrator to change or downgrade.', 'CONTACT_ADMIN');

  const price = (await pool.query('SELECT * FROM plan_prices WHERE plan_id = $1 AND currency = $2', [plan.id, sub.currency])).rows[0];
  const amount = price ? Number(cycle === 'yearly' ? price.yearly_price : price.monthly_price) : 0;
  if (!(amount > 0)) throw httpError(400, `This plan has no ${cycle} price in ${sub.currency}. Contact your administrator.`, 'CONTACT_ADMIN');

  const provider = payments.getProvider(method.provider);
  if (!provider.currencies.includes(sub.currency)) throw httpError(400, `${method.provider} does not support ${sub.currency}`);
  const reference = await createTransaction({
    tenantId, provider: method.provider, kind: 'upgrade', amount, currency: sub.currency,
    intent: { planCode: plan.code, cycle, actorUserId: user.id },
  });
  const description = `${plan.name} plan (${cycle})`;

  if (provider.savesMethods) {
    const charge = await provider.chargeSaved({
      customerId: method.provider_customer_id, methodId: method.provider_method_id, amount, currency: sub.currency, reference, description });
    const out = await finalizePayment(reference, { status: charge.status, providerRef: charge.providerRef, amount, currency: sub.currency });
    if (out.status !== 'succeeded') throw httpError(402, `Payment failed (${charge.message || 'declined'}). Your plan was not changed.`, 'PAYMENT_FAILED');
    return { status: 'succeeded', plan: plan.code };
  }

  const checkout = await provider.createCheckout({ reference, amount, currency: sub.currency, description, returnUrl, callbackUrl, cancelUrl, user });
  if (checkout.providerRef) await pool.query('UPDATE payment_transactions SET provider_ref = $1 WHERE reference = $2', [checkout.providerRef, reference]);
  return { status: 'redirect', reference, ...checkout };
};

// Stripe webhook events and hosted-provider callbacks end up here after their signatures were verified.
const handleProviderEvent = async (providerName, evt) => {
  if (evt.type === 'method_attached') {
    if (!evt.tenantId) return { ignored: true };
    await saveMethod(evt.tenantId, { provider: providerName, customerId: evt.customerId, methodId: evt.methodId, brand: evt.brand, last4: evt.last4, expMonth: evt.expMonth, expYear: evt.expYear });
    return { attached: true };
  }
  if (evt.type === 'payment') {
    if (!evt.reference) return { ignored: true };
    const t = await pool.query('SELECT provider FROM payment_transactions WHERE reference = $1', [evt.reference]);
    if (!t.rows.length || t.rows[0].provider !== providerName) return { ignored: true }; // reference must belong to this provider
    return finalizePayment(evt.reference, evt);
  }
  return { ignored: true };
};

// ---- Upgrade requests (tenant without a payment method asks the platform admin) -----------------------------

const createUpgradeRequest = async (tenantId, userId, planCode, message) => {
  const plan = planCode ? await getPlan(pool, planCode) : null;
  const r = await pool.query(
    'INSERT INTO upgrade_requests (tenant_id, requested_plan_id, message, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [tenantId, plan ? plan.id : null, message ? String(message).slice(0, 1000) : null, userId]);
  await log(pool, tenantId, 'upgrade_requested', { toPlanId: plan ? plan.id : null, details: { message: message || null }, actor: { id: userId, role: 'admin' } });
  return { id: r.rows[0].id };
};

const listUpgradeRequests = async () =>
  (await pool.query(
    `SELECT r.id, r.tenant_id, t.name AS tenant_name, p.name AS plan_name, r.message, r.status, r.created_at
     FROM upgrade_requests r JOIN tenants t ON t.id = r.tenant_id LEFT JOIN plans p ON p.id = r.requested_plan_id
     ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 200`)).rows;

const closeUpgradeRequest = async (id) => {
  const r = await pool.query(`UPDATE upgrade_requests SET status = 'closed' WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows.length) throw httpError(404, 'Request not found');
  return { closed: true };
};

// ---- Read models ---------------------------------------------------------------------------------------------

const listSubscriptions = async ({ status } = {}) =>
  (await pool.query(
    `SELECT s.tenant_id, t.name AS tenant_name, t.slug, p.code AS plan_code, p.name AS plan_name, s.status, s.billing_cycle,
            s.currency, s.provider, s.start_date, s.end_date, s.auto_renew,
            EXISTS (SELECT 1 FROM payment_methods m WHERE m.tenant_id = s.tenant_id AND m.status = 'active') AS has_payment_method,
            (SELECT count(*)::int FROM upgrade_requests r WHERE r.tenant_id = s.tenant_id AND r.status = 'open') AS open_requests
     FROM tenant_subscriptions s JOIN tenants t ON t.id = s.tenant_id JOIN plans p ON p.id = s.plan_id
     WHERE ($1::text IS NULL OR s.status = $1) ORDER BY t.name`, [status || null])).rows;

const listExpiring = async (days = 14) =>
  (await pool.query(
    `SELECT s.tenant_id, t.name AS tenant_name, p.name AS plan_name, s.status, s.end_date
     FROM tenant_subscriptions s JOIN tenants t ON t.id = s.tenant_id JOIN plans p ON p.id = s.plan_id
     WHERE s.status IN ('grace', 'expired')
        OR (s.status IN ('active', 'trial') AND s.end_date IS NOT NULL AND s.end_date < now() + ($1 || ' days')::interval)
     ORDER BY s.end_date NULLS LAST`, [String(days)])).rows;

const report = async () => {
  const [byPlan, byStatus, revenue, expiring] = await Promise.all([
    pool.query(`SELECT p.name AS plan, count(s.*)::int AS tenants FROM plans p LEFT JOIN tenant_subscriptions s ON s.plan_id = p.id GROUP BY p.id ORDER BY p.sort_order`),
    pool.query('SELECT status, count(*)::int AS tenants FROM tenant_subscriptions GROUP BY status ORDER BY status'),
    pool.query(`SELECT provider, currency, sum(amount)::float AS total, count(*)::int AS payments FROM payment_transactions WHERE status = 'succeeded' GROUP BY provider, currency ORDER BY provider`),
    pool.query(`SELECT count(*)::int AS n FROM tenant_subscriptions WHERE status IN ('active', 'trial') AND end_date IS NOT NULL AND end_date < now() + interval '14 days'`),
  ]);
  return { byPlan: byPlan.rows, byStatus: byStatus.rows, revenue: revenue.rows, expiringSoon: expiring.rows[0].n };
};

const detail = async (tenantId) => {
  const e = await ent.getEntitlements(tenantId); // also refreshes the status
  const [sub, addons, hist, tx_, usage] = await Promise.all([
    getSub(pool, tenantId),
    pool.query(`SELECT ta.id, a.code, a.name, ta.quantity, ta.created_at FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = $1 AND ta.status = 'active'`, [tenantId]),
    pool.query(
      `SELECT h.id, h.action, fp.name AS from_plan, tp.name AS to_plan, h.details, h.actor_role, h.created_at
       FROM subscription_history h LEFT JOIN plans fp ON fp.id = h.from_plan_id LEFT JOIN plans tp ON tp.id = h.to_plan_id
       WHERE h.tenant_id = $1 ORDER BY h.id DESC LIMIT 50`, [tenantId]),
    pool.query('SELECT provider, reference, kind, amount, currency, status, created_at FROM payment_transactions WHERE tenant_id = $1 ORDER BY id DESC LIMIT 20', [tenantId]),
    ent.getUsage(tenantId),
  ]);
  return {
    subscription: sub, addons: addons.rows, history: hist.rows, transactions: tx_.rows, usage,
    paymentMethod: publicMethod(await getMethod(tenantId)), limits: e.limits, features: [...e.features],
  };
};

// What a tenant admin sees on "My Plan".
const tenantView = async (tenantId) => {
  const e = await ent.getEntitlements(tenantId);
  const s = e.subscription;
  const [usage, method, addons, planRows, contact] = await Promise.all([
    ent.getUsage(tenantId),
    getMethod(tenantId),
    pool.query(`SELECT a.name, ta.quantity FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = $1 AND ta.status = 'active'`, [tenantId]),
    pool.query(
      `SELECT p.id, p.code, p.name, p.description, p.sort_order, pp.monthly_price, pp.yearly_price
       FROM plans p LEFT JOIN plan_prices pp ON pp.plan_id = p.id AND pp.currency = $1
       WHERE p.is_active AND NOT p.is_custom AND p.sort_order > $2 ORDER BY p.sort_order`, [s.currency, s.planRank]),
    ent.getSetting('contact_info', 'Please contact your system administrator.'),
  ]);
  const upgrades = [];
  for (const p of planRows.rows) {
    const [f, l] = await Promise.all([
      pool.query(`SELECT f.code, f.name FROM plan_features pf JOIN features f ON f.id = pf.feature_id WHERE pf.plan_id = $1 AND pf.enabled`, [p.id]),
      pool.query('SELECT limit_code, limit_value FROM plan_limits WHERE plan_id = $1', [p.id]),
    ]);
    upgrades.push({
      code: p.code, name: p.name, description: p.description,
      monthly: p.monthly_price === null ? null : Number(p.monthly_price), yearly: p.yearly_price === null ? null : Number(p.yearly_price),
      features: f.rows.map((x) => x.name), limits: Object.fromEntries(l.rows.map((x) => [x.limit_code, x.limit_value === null ? null : Number(x.limit_value)])),
    });
  }
  return {
    plan: { code: s.planCode, name: s.planName }, status: s.status, billingCycle: s.billingCycle, currency: s.currency,
    endDate: s.endDate, trialEndsAt: s.trialEndsAt, canWrite: e.canWrite,
    features: [...e.features], limits: e.limits, usage, addons: addons.rows,
    paymentMethod: publicMethod(method), canSelfUpgrade: !!method, contact, upgrades,
    providers: payments.status(),
  };
};

module.exports = {
  addPeriod, activate, changePlan, renew, cancel, suspend, reactivate, addAddon, removeAddon,
  getMethod, publicMethod, saveMethod, removeMethod, beginAttach, enableHosted,
  startUpgrade, finalizePayment, handleProviderEvent,
  createUpgradeRequest, listUpgradeRequests, closeUpgradeRequest,
  listSubscriptions, listExpiring, report, detail, tenantView, getSub, getPlan, tx,
};
