// Database-backed subscription tests. THROWAWAY database only (they create tenants, plans and payments):
//   RUN_DB_TESTS=1 DATABASE_URL= DB_HOST=localhost DB_PORT=5544 DB_USER=postgres DB_NAME=uh_crm_test npm test
process.env.DB_STRICT = '1';
const test = require('node:test');
const assert = require('node:assert');

if (process.env.RUN_DB_TESTS !== '1') {
  test('db tests skipped (set RUN_DB_TESTS=1 with a throwaway DB)', { skip: true }, () => {});
} else {
  const db = require('../config/database');
  const initDatabase = require('../config/dbInit');
  const ts = require('../services/tenantService');
  const subs = require('../services/subscriptionService');
  const ent = require('../services/entitlementService');
  const catalog = require('../services/catalogService');
  const payments = require('../services/payments');

  const uniq = Date.now().toString(36);
  const pool = db.admin;
  const mk = (plan, extra = {}) => ts.createTenant({
    name: `T-${plan}-${uniq}`, slug: `${plan}-${Math.random().toString(36).slice(2, 8)}-${uniq}`, plan,
    adminName: 'Admin', adminEmail: `${plan}-${Math.random().toString(36).slice(2, 8)}-${uniq}@t.test`, adminPassword: 'x', ...extra,
  });
  const adminId = async (t) => (await pool.query(`SELECT id FROM users WHERE tenant_id=$1 AND role='admin' LIMIT 1`, [t.id])).rows[0].id;
  const ctxFor = async (t, role = 'admin') => ts.loadContext({ id: await adminId(t), tenant_id: t.id, role }, null);
  const q = (ctx, sql, params) => db.runAs(ctx, () => db.query(sql, params));
  const addUsers = async (t, n) => {
    for (let i = 0; i < n; i += 1) {
      await pool.query(`INSERT INTO users (name, email, password, role, tenant_id) VALUES ('u', $1, 'x', 'dealer', $2)`,
        [`u${i}-${Math.random().toString(36).slice(2, 8)}-${uniq}@t.test`, t.id]);
    }
  };
  const history = async (t) => (await pool.query('SELECT action FROM subscription_history WHERE tenant_id=$1 ORDER BY id', [t.id])).rows.map((r) => r.action);
  const planOf = async (t) => (await subs.getSub(pool, t.id)).plan_code;
  const setEnd = (t, days) => pool.query(`UPDATE tenant_subscriptions SET end_date = now() - ($1 || ' days')::interval WHERE tenant_id=$2`, [String(days), t.id]);

  test.before(async () => {
    const { rows } = await pool.query('SELECT current_database() AS name');
    if (!/test/i.test(rows[0].name)) {
      throw new Error(`Refusing to run on database "${rows[0].name}": its name must contain "test". Unset DATABASE_URL (DATABASE_URL= npm test) and set DB_NAME.`);
    }
    await initDatabase();
    // Stub providers so the flow is tested without any network: one that saves a card, one hosted.
    payments.register('stubcard', {
      name: 'stubcard', currencies: ['PKR', 'USD'], savesMethods: true, isConfigured: () => true,
      chargeSaved: async ({ amount, reference }) => (global.__declineNext
        ? { status: 'failed', providerRef: `decl_${reference}`, message: 'declined' }
        : { status: 'succeeded', providerRef: `ok_${reference}`, message: 'ok' }),
    });
    payments.register('stubhosted', {
      name: 'stubhosted', currencies: ['PKR'], savesMethods: false, isConfigured: () => true,
      createCheckout: async ({ reference }) => ({ redirectUrl: `https://pay.example/${reference}`, providerRef: `ord_${reference}` }),
    });
  });
  test.after(() => db.end());

  test('default plans, features and limits are seeded as rows', async () => {
    const plans = await catalog.listPlans();
    assert.deepStrictEqual(['basic', 'silver', 'gold', 'platinum', 'custom'], plans.map((p) => p.code).filter((c) => ['basic', 'silver', 'gold', 'platinum', 'custom'].includes(c)));
    const by = Object.fromEntries(plans.map((p) => [p.code, p]));
    assert.strictEqual(by.basic.limits.branches, 1);
    assert.strictEqual(by.basic.limits.users, 10);
    assert.strictEqual(by.platinum.limits.branches, null); // unlimited
    assert.strictEqual(by.basic.features.multi_branch, false);
    assert.strictEqual(by.platinum.features.priority_support, true);
    assert.ok(by.custom.is_custom);
  });

  test('a new feature, limit and plan need no code or schema change', async () => {
    await catalog.createFeature({ code: `f_${uniq}`, name: 'Brand new feature' });
    await catalog.createLimitDef({ code: `l_${uniq}`, name: 'Brand new limit', unit: 'x' });
    const p = await catalog.createPlan({ code: `p_${uniq}`, name: 'Fresh plan', is_custom: true });
    await catalog.setFeatures(p.id, { [`f_${uniq}`]: true });
    await catalog.setLimits(p.id, { [`l_${uniq}`]: null, users: 3 });
    const t = await mk(`p_${uniq}`);
    const e = await ent.getEntitlements(t.id);
    assert.ok(e.features.has(`f_${uniq}`));
    assert.strictEqual(e.limits[`l_${uniq}`], null);
    assert.strictEqual(e.limits.users, 3);
    assert.ok(!e.features.has('multi_branch'));
  });

  test('feature gating: a basic tenant cannot create branches', async () => {
    const t = await mk('basic');
    await assert.rejects(() => ts.createBranch(t.id, 'Second'), (e) => e.status === 403 && e.code === 'FEATURE_NOT_IN_PLAN' && /Contact your administrator/.test(e.message));
  });

  test('branch limit: silver allows 3 branches (incl. main), the 4th is refused with an upgrade message', async () => {
    const t = await mk('silver');
    await ts.createBranch(t.id, 'B2');
    await ts.createBranch(t.id, 'B3');
    await assert.rejects(() => ts.createBranch(t.id, 'B4'), (e) => e.code === 'BRANCH_LIMIT_REACHED' && e.allowed === 3 && e.used === 3 && /upgrade/i.test(e.message));
  });

  test('user limit: basic allows 10 users; an addon raises it', async () => {
    const t = await mk('basic'); // admin already counts as 1
    await addUsers(t, 9);
    await assert.rejects(() => ent.assertLimitFor(t.id, 'users'), (e) => e.code === 'USER_LIMIT_REACHED' && e.allowed === 10);
    await subs.addAddon(t.id, 'extra_user', 5, { id: 1, role: 'super_admin' });
    await assert.doesNotReject(() => ent.assertLimitFor(t.id, 'users'));
    assert.strictEqual((await ent.getEntitlements(t.id)).limits.users, 15);
    // unlimited stays unlimited
    const p = await mk('platinum');
    await subs.addAddon(p.id, 'extra_user', 5, { id: 1, role: 'super_admin' });
    assert.strictEqual((await ent.getEntitlements(p.id)).limits.users, null);
  });

  test('transactions per month limit is enforced', async () => {
    const t = await mk('basic');
    const [pid] = [(await catalog.listPlans()).find((p) => p.code === 'basic').id];
    await catalog.setLimits(pid, { transactions_per_month: 2 });
    try {
      const ctx = await ctxFor(t);
      for (let i = 0; i < 2; i += 1) await q(ctx, `INSERT INTO transactions (description, reference_type) VALUES ('t', 'DEPOSIT')`);
      await assert.rejects(() => ent.assertLimitFor(t.id, 'transactions_per_month'), (e) => e.code === 'TRANSACTION_LIMIT_REACHED');
    } finally {
      await catalog.setLimits(pid, { transactions_per_month: 500 });
    }
  });

  test('expiry: grace keeps access, expired is read-only (RLS), renewal restores it, history is kept', async () => {
    const t = await mk('silver');
    const ctx0 = await ctxFor(t);
    await q(ctx0, `INSERT INTO customers (name) VALUES ('before')`);

    await setEnd(t, 3); // 3 days past end, inside the 7 day grace
    let e = await ent.getEntitlements(t.id);
    assert.strictEqual(e.subscription.status, 'grace');
    assert.ok(e.canWrite);

    await setEnd(t, 30);
    e = await ent.getEntitlements(t.id);
    assert.strictEqual(e.subscription.status, 'expired');
    assert.ok(!e.canWrite);
    const ctx = await ctxFor(t);
    assert.ok(ctx.readOnly);
    assert.strictEqual((await q(ctx, 'SELECT 1 FROM customers')).rowCount >= 1, true);            // reads still work
    await assert.rejects(() => q(ctx, `INSERT INTO customers (name) VALUES ('after')`), /row-level security/);   // branch table
    await assert.rejects(() => q(ctx, `INSERT INTO agencies (name) VALUES ('x')`), /row-level security/);        // tenant-wide table
    await assert.rejects(() => ts.createBranch(t.id, 'late'), (err) => err.status === 403);

    await subs.renew(t.id, { id: 1, role: 'super_admin' });
    e = await ent.getEntitlements(t.id);
    assert.strictEqual(e.subscription.status, 'active');
    assert.ok(e.canWrite);
    await q(await ctxFor(t), `INSERT INTO customers (name) VALUES ('renewed')`);
    const h = await history(t);
    assert.ok(h.includes('status_change') && h.includes('renewal'));
  });

  test('cancel and suspend block writes; reactivation restores them', async () => {
    const t = await mk('gold');
    await subs.cancel(t.id, { id: 1, role: 'super_admin' });
    assert.ok(!(await ent.getEntitlements(t.id)).canWrite);
    const cancelledCtx = await ctxFor(t);
    await assert.rejects(() => q(cancelledCtx, `INSERT INTO customers (name) VALUES ('x')`), /row-level security/);
    await subs.reactivate(t.id, { id: 1, role: 'super_admin' });
    assert.ok((await ent.getEntitlements(t.id)).canWrite);
    await subs.suspend(t.id, { id: 1, role: 'super_admin' });
    assert.strictEqual((await ent.getEntitlements(t.id)).subscription.status, 'suspended');
    assert.deepStrictEqual((await history(t)).slice(-3), ['cancellation', 'reactivation', 'suspension']);
  });

  test('super admin upgrade/downgrade writes history; downgrade over limits warns and never deletes', async () => {
    const t = await mk('platinum');
    const actor = { id: 1, role: 'super_admin' };
    for (const n of ['B2', 'B3', 'B4']) await ts.createBranch(t.id, n);
    await addUsers(t, 12);
    const before = (await pool.query('SELECT (SELECT count(*) FROM branches WHERE tenant_id=$1)::int b, (SELECT count(*) FROM users WHERE tenant_id=$1)::int u', [t.id])).rows[0];

    const r = await subs.changePlan(t.id, 'basic', actor);
    assert.strictEqual(await planOf(t), 'basic');
    assert.deepStrictEqual(r.warnings.map((w) => w.limit).sort(), ['branches', 'users']);
    const after = (await pool.query('SELECT (SELECT count(*) FROM branches WHERE tenant_id=$1)::int b, (SELECT count(*) FROM users WHERE tenant_id=$1)::int u', [t.id])).rows[0];
    assert.deepStrictEqual(after, before); // nothing deleted

    const ctx = await ctxFor(t);
    assert.deepStrictEqual(ctx.writeBranchIds.length, 1); // only the main branch is writable now
    assert.ok(ctx.readBranchIds.length === 4);            // the others are still readable
    await assert.rejects(() => ts.createBranch(t.id, 'B5'), (e) => e.code === 'FEATURE_NOT_IN_PLAN');
    await assert.rejects(() => ent.assertLimitFor(t.id, 'users'), (e) => e.code === 'USER_LIMIT_REACHED');

    await subs.changePlan(t.id, 'gold', actor);
    assert.deepStrictEqual((await history(t)).filter((a) => ['upgrade', 'downgrade'].includes(a)), ['downgrade', 'upgrade']);
  });

  test('tenant upgrade needs a payment method: without one it must contact the administrator', async () => {
    const t = await mk('basic');
    const user = { id: await adminId(t), name: 'a', email: 'a@t.test' };
    await assert.rejects(() => subs.startUpgrade({ tenantId: t.id, user, planCode: 'gold', cycle: 'monthly' }),
      (e) => e.status === 403 && e.code === 'CONTACT_ADMIN');
    assert.strictEqual(await planOf(t), 'basic');
    const reqId = await subs.createUpgradeRequest(t.id, user.id, 'gold', 'please upgrade us');
    assert.ok((await subs.listUpgradeRequests()).some((r) => r.id === reqId.id && r.status === 'open'));
  });

  test('tenant upgrade with a saved card: charges the plan price, upgrades, records history; declines change nothing', async () => {
    const t = await mk('basic');
    const user = { id: await adminId(t), name: 'a', email: 'a@t.test' };
    await subs.saveMethod(t.id, { provider: 'stubcard', customerId: 'c', methodId: 'm', brand: 'visa', last4: '4242' });

    global.__declineNext = true;
    await assert.rejects(() => subs.startUpgrade({ tenantId: t.id, user, planCode: 'gold', cycle: 'monthly' }), (e) => e.code === 'PAYMENT_FAILED' && e.status === 402);
    global.__declineNext = false;
    assert.strictEqual(await planOf(t), 'basic');

    const out = await subs.startUpgrade({ tenantId: t.id, user, planCode: 'gold', cycle: 'yearly' });
    assert.strictEqual(out.status, 'succeeded');
    assert.strictEqual(await planOf(t), 'gold');
    const tx = (await pool.query(`SELECT amount::float a, currency, status FROM payment_transactions WHERE tenant_id=$1 AND status='succeeded'`, [t.id])).rows[0];
    assert.deepStrictEqual([tx.a, tx.currency], [350000, 'PKR']); // gold yearly price in PKR
    const e = await ent.getEntitlements(t.id);
    assert.ok(e.features.has('advanced_reports') && e.limits.branches === 10);
    assert.ok((await history(t)).includes('upgrade'));

    // tenants cannot use this path to downgrade, pick the same plan, or buy a custom plan
    for (const plan of ['basic', 'gold', 'custom']) {
      await assert.rejects(() => subs.startUpgrade({ tenantId: t.id, user, planCode: plan, cycle: 'monthly' }), (err) => err.code === 'CONTACT_ADMIN');
    }
  });

  test('hosted checkout: only a verified, matching, first-time callback upgrades the plan', async () => {
    const t = await mk('basic');
    const user = { id: await adminId(t), name: 'a', email: 'a@t.test' };
    await subs.enableHosted(t.id, 'jazzcash', { id: 1, role: 'super_admin' }).catch(() => null);
    // use the stub hosted provider as the tenant's method (JazzCash itself needs real credentials)
    await subs.saveMethod(t.id, { provider: 'stubhosted', label: 'stub hosted' });

    const out = await subs.startUpgrade({ tenantId: t.id, user, planCode: 'silver', cycle: 'monthly' });
    assert.strictEqual(out.status, 'redirect');
    assert.match(out.redirectUrl, /^https:\/\/pay\.example\//);
    assert.strictEqual(await planOf(t), 'basic'); // not upgraded by merely starting checkout

    // wrong amount: rejected, plan unchanged
    await assert.rejects(() => subs.finalizePayment(out.reference, { status: 'succeeded', amount: 1, currency: 'PKR' }), (e) => e.code === 'AMOUNT_MISMATCH');
    assert.strictEqual(await planOf(t), 'basic');
    // a rejected payment stays rejected even if a correct callback arrives afterwards
    assert.deepStrictEqual((await subs.finalizePayment(out.reference, { status: 'succeeded', amount: 15000, currency: 'PKR' })).already, true);
    assert.strictEqual(await planOf(t), 'basic');

    // fresh checkout with the right amount
    const out2 = await subs.startUpgrade({ tenantId: t.id, user, planCode: 'silver', cycle: 'monthly' });
    // a callback attributed to a different provider is ignored
    assert.deepStrictEqual(await subs.handleProviderEvent('opay', { type: 'payment', reference: out2.reference, status: 'succeeded', amount: 15000, currency: 'PKR' }), { ignored: true });
    assert.strictEqual(await planOf(t), 'basic');
    const ok = await subs.handleProviderEvent('stubhosted', { type: 'payment', reference: out2.reference, status: 'succeeded', amount: 15000, currency: 'PKR' });
    assert.strictEqual(ok.status, 'succeeded');
    assert.strictEqual(await planOf(t), 'silver');
    // replay does nothing
    assert.strictEqual((await subs.handleProviderEvent('stubhosted', { type: 'payment', reference: out2.reference, status: 'succeeded', amount: 15000, currency: 'PKR' })).already, true);
    assert.strictEqual((await history(t)).filter((a) => a === 'upgrade').length, 1);
    // unknown reference
    await assert.rejects(() => subs.finalizePayment('NOPE', { status: 'succeeded', amount: 1 }), (e) => e.status === 404);
  });

  test('subscription and payment data is invisible to tenant requests (global tables are revoked)', async () => {
    const t = await mk('basic');
    const ctx = await ctxFor(t);
    for (const table of ['tenant_subscriptions', 'payment_methods', 'payment_transactions', 'plans', 'subscription_history', 'platform_settings']) {
      await assert.rejects(() => q(ctx, `SELECT * FROM ${table}`), /permission denied/);
    }
  });

  test('tenant view exposes usage, limits, upgrade options and no secrets', async () => {
    const t = await mk('silver');
    await subs.saveMethod(t.id, { provider: 'stubcard', customerId: 'secret_cus', methodId: 'secret_pm', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2031 });
    const v = await subs.tenantView(t.id);
    assert.strictEqual(v.plan.code, 'silver');
    assert.strictEqual(v.canSelfUpgrade, true);
    assert.deepStrictEqual(v.upgrades.map((u) => u.code), ['gold', 'platinum']); // higher, public plans only
    assert.strictEqual(v.usage.branches, 1);
    assert.strictEqual(v.limits.branches, 3);
    assert.ok(!JSON.stringify(v).includes('secret_'));
  });
}
