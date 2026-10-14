const bcrypt = require('bcryptjs');
const db = require('../config/database');
const ent = require('./entitlementService');
const subscriptions = require('./subscriptionService');

const pool = db.admin; // owner-level: every statement below carries an explicit tenant_id

const { httpError } = ent;
const STATUSES = ['active', 'suspended'];

// Pure: which branches may this user read/write on this request?
//  - Without the multi_branch feature only the default branch is writable. Branches left over from a downgrade
//    stay readable (no data "disappears") but are frozen.
//  - With it: admins see every branch, others only their user_branches (default branch if none assigned).
//    X-Branch-Id narrows the request to one branch the user may access.
//  - branchLimit freezes branches beyond the plan's limit (default branch first, then oldest) as read-only.
//  - canWrite=false (expired/cancelled/suspended subscription) makes everything read-only.
const resolveBranchAccess = ({ multiBranch, canWrite = true, branchLimit = null, branches, role, userBranchIds = [], requestedBranchId = null }) => {
  const def = branches.find((b) => b.is_default);
  if (!def) throw httpError(500, 'Tenant has no default branch');

  const active = branches.filter((b) => b.is_active);
  const withinLimit = branchLimit === null || branchLimit === undefined ? active : active.slice(0, Math.max(0, branchLimit));
  const writable = (list) => (canWrite ? list.filter((b) => withinLimit.some((w) => w.id === b.id)).map((b) => b.id) : []);

  if (!multiBranch) {
    const w = writable([def]);
    return { readIds: branches.map((b) => b.id), writeIds: w, insertId: w[0] || null };
  }

  let accessible = branches;
  if (role !== 'admin') {
    accessible = userBranchIds.length ? branches.filter((b) => userBranchIds.includes(b.id)) : [def];
  }

  if (requestedBranchId) {
    const b = accessible.find((x) => x.id === Number(requestedBranchId));
    if (!b) throw httpError(403, 'You do not have access to this branch');
    const w = writable([b]);
    return { readIds: [b.id], writeIds: w, insertId: w[0] || null };
  }

  const w = writable(accessible);
  const insertId = w.includes(def.id) ? def.id : (w[0] || null);
  return { readIds: accessible.map((b) => b.id), writeIds: w, insertId };
};

// Builds the request context for an authenticated (non super_admin) user.
const loadContext = async (user, requestedBranchId) => {
  const t = await pool.query('SELECT id, name, plan, status FROM tenants WHERE id = $1', [user.tenant_id]);
  if (!t.rows.length) throw httpError(403, 'Tenant not found');
  const tenant = t.rows[0];
  if (tenant.status !== 'active') throw httpError(403, 'This account is suspended', 'TENANT_SUSPENDED');

  const [branches, assigned, entitlements] = await Promise.all([
    pool.query('SELECT id, name, is_default, is_active FROM branches WHERE tenant_id = $1 ORDER BY is_default DESC, id', [tenant.id]),
    pool.query('SELECT branch_id FROM user_branches WHERE user_id = $1', [user.id]),
    ent.getEntitlements(tenant.id),
  ]);
  const multiBranch = entitlements.features.has('multi_branch');
  const access = resolveBranchAccess({
    multiBranch,
    canWrite: entitlements.canWrite,
    branchLimit: entitlements.limits.branches,
    branches: branches.rows,
    role: user.role,
    userBranchIds: assigned.rows.map((r) => r.branch_id),
    requestedBranchId,
  });
  return {
    tenantId: tenant.id,
    tenant,
    branches: branches.rows,
    multiBranch,
    entitlements,
    readOnly: !entitlements.canWrite,
    readBranchIds: access.readIds,
    writeBranchIds: access.writeIds,
    insertBranchId: access.insertId,
  };
};

const audit = (tenantId, userId, action, detail) =>
  pool.query('INSERT INTO audit_log (tenant_id, user_id, action, detail) VALUES ($1, $2, $3, $4)',
    [tenantId, userId || null, action, detail ? JSON.stringify(detail) : null]).catch((e) => console.error('audit failed', e.message));

const getTenant = async (tenantId) => {
  const r = await pool.query('SELECT id, name, slug, plan, status FROM tenants WHERE id = $1', [tenantId]);
  if (!r.rows.length) throw httpError(404, 'Tenant not found');
  return r.rows[0];
};

// ---- Branch management -------------------------------------------------------------------------

const listBranches = async (tenantId) =>
  (await pool.query('SELECT id, name, is_default, is_active FROM branches WHERE tenant_id = $1 ORDER BY is_default DESC, id', [tenantId])).rows;

// Creating a branch needs the multi_branch feature AND room under the plan's branch limit. Enforced here, in the
// service, so no caller (route, script, test) can skip it.
const assertCanAddBranch = async (tenantId) => {
  const e = await ent.getEntitlements(tenantId);
  await ent.assertFeature(tenantId, e, 'multi_branch', 'Multiple branches');
  if (!e.canWrite) throw httpError(403, `Your subscription is ${e.subscription.status}.`, 'SUBSCRIPTION_INACTIVE');
  await ent.assertLimit(tenantId, e, 'branches', 1);
};

const createBranch = async (tenantId, name, actorId) => {
  await assertCanAddBranch(tenantId);
  if (!name || !String(name).trim()) throw httpError(400, 'Branch name is required');
  try {
    const r = await pool.query(
      'INSERT INTO branches (tenant_id, name) VALUES ($1, $2) RETURNING id, name, is_default, is_active',
      [tenantId, String(name).trim()]
    );
    await audit(tenantId, actorId, 'branch.create', { branchId: r.rows[0].id, name: r.rows[0].name });
    return r.rows[0];
  } catch (e) {
    if (e.code === '23505') throw httpError(400, 'A branch with this name already exists');
    throw e;
  }
};

// Rename is allowed on any plan (including the default branch); (de)activating needs multi_branch (and room
// under the limit when re-activating) and never touches the default branch. Branches are never deleted.
const updateBranch = async (tenantId, branchId, { name, is_active }, actorId) => {
  const r = await pool.query('SELECT * FROM branches WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
  if (!r.rows.length) throw httpError(404, 'Branch not found');
  const branch = r.rows[0];
  if (is_active !== undefined && is_active !== branch.is_active) {
    const e = await ent.getEntitlements(tenantId);
    await ent.assertFeature(tenantId, e, 'multi_branch', 'Multiple branches');
    if (branch.is_default) throw httpError(400, 'The default branch cannot be deactivated');
    if (is_active) await ent.assertLimit(tenantId, e, 'branches', 1);
  }
  const u = await pool.query(
    'UPDATE branches SET name = COALESCE($1, name), is_active = COALESCE($2, is_active) WHERE id = $3 AND tenant_id = $4 RETURNING id, name, is_default, is_active',
    [name ? String(name).trim() : null, is_active === undefined ? null : !!is_active, branchId, tenantId]
  );
  await audit(tenantId, actorId, 'branch.update', { branchId, name, is_active });
  return u.rows[0];
};

const getBranchUsers = async (tenantId, branchId) =>
  (await pool.query(
    `SELECT u.id, u.name, u.email, u.role FROM user_branches ub
     JOIN users u ON u.id = ub.user_id JOIN branches b ON b.id = ub.branch_id
     WHERE ub.branch_id = $1 AND b.tenant_id = $2 AND u.tenant_id = $2 ORDER BY u.name`, [branchId, tenantId])).rows;

// Replaces the user list of a branch. Both the branch and every user must belong to the tenant.
const setBranchUsers = async (tenantId, branchId, userIds, actorId) => {
  const e = await ent.getEntitlements(tenantId);
  await ent.assertFeature(tenantId, e, 'multi_branch', 'Multiple branches');
  const b = await pool.query('SELECT id FROM branches WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
  if (!b.rows.length) throw httpError(404, 'Branch not found');
  const ids = [...new Set((userIds || []).map(Number))];
  const ok = await pool.query('SELECT id FROM users WHERE tenant_id = $1 AND id = ANY($2)', [tenantId, ids]);
  if (ok.rows.length !== ids.length) throw httpError(400, 'One or more users do not belong to this tenant');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_branches WHERE branch_id = $1', [branchId]);
    for (const id of ids) await client.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)', [id, branchId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await audit(tenantId, actorId, 'branch.users', { branchId, userIds: ids });
  return ids;
};

// ---- Tenant management (super_admin) -----------------------------------------------------------

const createTenant = async ({ name, slug, plan = 'basic', billingCycle = 'monthly', currency = 'PKR', trial = false, adminName, adminEmail, adminPassword }, actorId) => {
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) throw httpError(400, 'name, slug, adminName, adminEmail and adminPassword are required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT code FROM plans WHERE code = $1 AND is_active', [plan]);
    if (!p.rows.length) throw httpError(400, `Unknown or inactive plan: ${plan}`);
    const t = await client.query('INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id, name, slug, plan, status', [name, slug, plan]);
    const tenant = t.rows[0];
    const b = await client.query(`INSERT INTO branches (tenant_id, name, is_default) VALUES ($1, 'Main Branch', TRUE) RETURNING id`, [tenant.id]);
    await client.query(
      `INSERT INTO users (name, email, password, role, tenant_id) VALUES ($1, $2, $3, 'admin', $4)`,
      [adminName, adminEmail, await bcrypt.hash(adminPassword, 10), tenant.id]
    );
    await client.query(
      `INSERT INTO app_settings (tenant_id, setting_key, setting_value, description) VALUES
         ($1, 'ADJUSTMENT_FORM_DEFAULT_COST', '20000', 'Default cost price for adjustment forms (certificates)'),
         ($1, 'ADJUSTMENT_FORM_CUSTOMER_VALUE', '40000', 'Default value credited toward deal for adjustment forms')`,
      [tenant.id]
    );
    await subscriptions.activate(tenant.id, plan, { billingCycle, currency, trial }, { id: actorId, role: 'super_admin' }, client);
    await client.query('COMMIT');
    await audit(tenant.id, actorId, 'tenant.create', { slug, plan, defaultBranchId: b.rows[0].id });
    return tenant;
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw httpError(400, 'Tenant slug or admin email already exists');
    throw e;
  } finally {
    client.release();
  }
};

// Plan changes go through the subscription service (history + warnings). Nothing is ever deleted.
const updateTenant = async (tenantId, { plan, status }, actorId) => {
  if (status && !STATUSES.includes(status)) throw httpError(400, `status must be one of: ${STATUSES.join(', ')}`);
  await getTenant(tenantId);
  let warnings = [];
  if (plan) ({ warnings } = await subscriptions.changePlan(tenantId, plan, { id: actorId, role: 'super_admin' }));
  if (status) await pool.query('UPDATE tenants SET status = $1 WHERE id = $2', [status, tenantId]);
  await audit(tenantId, actorId, 'tenant.update', { plan, status });
  return { ...(await getTenant(tenantId)), warnings };
};

const listTenants = async () =>
  (await pool.query(
    `SELECT t.id, t.name, t.slug, t.plan, t.status, p.name AS plan_name, s.status AS subscription_status, s.end_date,
            (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id)::int AS branch_count,
            (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)::int AS user_count
     FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id LEFT JOIN plans p ON p.id = s.plan_id
     ORDER BY t.id`)).rows;

module.exports = {
  httpError, resolveBranchAccess, loadContext, audit,
  getTenant, listBranches, createBranch, updateBranch, getBranchUsers, setBranchUsers,
  createTenant, updateTenant, listTenants,
};
