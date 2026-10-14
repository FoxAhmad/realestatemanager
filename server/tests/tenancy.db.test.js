// Database-backed isolation tests. Needs a THROWAWAY Postgres database (they create tenants and rows):
//   RUN_DB_TESTS=1 DB_HOST=localhost DB_PORT=5544 DB_USER=postgres DB_NAME=uh_crm_test npm test
process.env.DB_STRICT = '1';
const test = require('node:test');
const assert = require('node:assert');

if (process.env.RUN_DB_TESTS !== '1') {
  test('db tests skipped (set RUN_DB_TESTS=1 with a throwaway DB)', { skip: true }, () => {});
} else {
  const db = require('../config/database');
  const initDatabase = require('../config/dbInit');
  const ts = require('../services/tenantService');

  const uniq = Date.now().toString(36);
  let A, B, adminA, adminB, defaultA;

  const adminId = async (tenant) =>
    (await db.admin.query(`SELECT id FROM users WHERE tenant_id=$1 AND role='admin' LIMIT 1`, [tenant.id])).rows[0].id;
  // Same context the auth middleware builds for a request.
  const ctxFor = async (tenant, role = 'admin', userId = null, header = null) =>
    ts.loadContext({ id: userId || (await adminId(tenant)), tenant_id: tenant.id, role }, header);
  const q = (ctx, sql, params) => db.runAs(ctx, () => db.query(sql, params));

  test.before(async () => {
    // These tests create tenants and rows. Never run them on a real database (DATABASE_URL in .env wins over DB_*).
    const { rows } = await db.admin.query('SELECT current_database() AS name');
    if (!/test/i.test(rows[0].name)) {
      throw new Error(`Refusing to run on database "${rows[0].name}": its name must contain "test". Unset DATABASE_URL (DATABASE_URL= npm test) and set DB_NAME.`);
    }
    await initDatabase();
    A = await ts.createTenant({ name: 'A', slug: `a-${uniq}`, plan: 'platinum', adminName: 'A', adminEmail: `a-${uniq}@t.test`, adminPassword: 'x' });
    B = await ts.createTenant({ name: 'B', slug: `b-${uniq}`, plan: 'basic', adminName: 'B', adminEmail: `b-${uniq}@t.test`, adminPassword: 'x' });
    adminA = await ctxFor(A);
    adminB = await ctxFor(B);
    defaultA = adminA.insertBranchId;
  });
  test.after(() => db.end());

  test('no tenant context is rejected (strict mode)', async () => {
    await assert.rejects(() => db.query('SELECT 1'), /without tenant context/);
  });

  test('tenant B cannot read, update or delete tenant A rows', async () => {
    const ins = await q(adminA, `INSERT INTO customers (name) VALUES ('iso-a') RETURNING id, tenant_id`);
    assert.strictEqual(ins.rows[0].tenant_id, A.id); // tenant comes from context, not the caller
    const id = ins.rows[0].id;
    assert.strictEqual((await q(adminB, 'SELECT * FROM customers WHERE id=$1', [id])).rowCount, 0);
    assert.strictEqual((await q(adminB, `UPDATE customers SET name='hacked' WHERE id=$1`, [id])).rowCount, 0);
    assert.strictEqual((await q(adminB, 'DELETE FROM customers WHERE id=$1', [id])).rowCount, 0);
    assert.strictEqual((await q(adminA, 'SELECT name FROM customers WHERE id=$1', [id])).rows[0].name, 'iso-a');
  });

  test('tenant B cannot insert a row for tenant A', async () => {
    await assert.rejects(() => q(adminB, `INSERT INTO customers (name, tenant_id) VALUES ('x', $1)`, [A.id]), /row-level security/);
  });

  test('tenant-wide tables return only own rows even with an unfiltered query', async () => {
    await q(adminA, `INSERT INTO agencies (name) VALUES ('agency-a')`);
    const rows = (await q(adminB, 'SELECT * FROM agencies')).rows;
    assert.ok(rows.every((r) => r.tenant_id === B.id));
  });

  test('a tenant user can never become (or create) a platform super_admin', async () => {
    await assert.rejects(() => q(adminB, "UPDATE users SET role='super_admin' WHERE tenant_id=$1", [B.id]), /row-level security|violates/);
    await assert.rejects(() => q(adminB, "INSERT INTO users (name,email,password,role) VALUES ('x','x@x.test','x','super_admin')"), /row-level security|violates/);
  });

  test('users are tenant-scoped', async () => {
    const rows = (await q(adminB, 'SELECT tenant_id FROM users')).rows;
    assert.ok(rows.length >= 1 && rows.every((r) => r.tenant_id === B.id));
  });

  test('cnic is unique per tenant, not globally', async () => {
    const cnic = `35202-${uniq}`;
    await q(adminA, `INSERT INTO customers (name, cnic) VALUES ('c', $1)`, [cnic]);
    await q(adminB, `INSERT INTO customers (name, cnic) VALUES ('c', $1)`, [cnic]); // other tenant: fine
    await assert.rejects(() => q(adminA, `INSERT INTO customers (name, cnic) VALUES ('d', $1)`, [cnic]), /duplicate key/);
  });

  test('standard accounts are shared, sub-accounts are private', async () => {
    assert.strictEqual((await q(adminB, 'SELECT id FROM accounts WHERE id BETWEEN 1 AND 9')).rowCount, 9);
    const parent = (await q(adminA, `SELECT id FROM accounts WHERE name='Loans Receivable' AND parent_id IS NULL`)).rows[0].id;
    const sub = await q(adminA, `INSERT INTO accounts (name, type, parent_id) VALUES ('Loan > Bob', 'Asset', $1) RETURNING id`, [parent]);
    assert.strictEqual((await q(adminB, 'SELECT id FROM accounts WHERE id=$1', [sub.rows[0].id])).rowCount, 0);
  });

  test('non-platinum tenant cannot create/activate branches or assign users (service level)', async () => {
    await assert.rejects(() => ts.createBranch(B.id, 'Second'), (e) => e.code === 'FEATURE_NOT_IN_PLAN' && e.status === 403);
    const [def] = await ts.listBranches(B.id);
    await assert.rejects(() => ts.updateBranch(B.id, def.id, { is_active: false }), (e) => e.code === 'FEATURE_NOT_IN_PLAN');
    await assert.rejects(() => ts.setBranchUsers(B.id, def.id, []), (e) => e.code === 'FEATURE_NOT_IN_PLAN');
    assert.strictEqual((await ts.updateBranch(B.id, def.id, { name: 'HQ' })).name, 'HQ'); // rename is allowed
  });

  test('platinum: branches are isolated and access-controlled', async () => {
    const x = await ts.createBranch(A.id, 'Branch X');
    const dealer = (await db.admin.query(
      `INSERT INTO users (name, email, password, role, tenant_id) VALUES ('d', $1, 'x', 'dealer', $2) RETURNING id`, [`d-${uniq}@t.test`, A.id])).rows[0].id;

    const allA = await ctxFor(A); // reloaded: the context is per request, so it must see the new branch
    const inX = await ctxFor(A, 'admin', null, x.id);
    const rowX = (await q(inX, `INSERT INTO customers (name) VALUES ('in-x') RETURNING id, branch_id`)).rows[0];
    assert.strictEqual(rowX.branch_id, x.id);
    const rowDef = (await q(adminA, `INSERT INTO customers (name) VALUES ('in-default') RETURNING id, branch_id`)).rows[0];
    assert.strictEqual(rowDef.branch_id, defaultA);

    // admin selecting X sees X rows only; with no selection sees all branches
    assert.strictEqual((await q(inX, 'SELECT 1 FROM customers WHERE id=$1', [rowDef.id])).rowCount, 0);
    assert.strictEqual((await q(allA, 'SELECT 1 FROM customers WHERE id = ANY($1)', [[rowX.id, rowDef.id]])).rowCount, 2);

    // dealer with no assignment: default branch only; forging X-Branch-Id is rejected
    const dealerCtx = await ctxFor(A, 'dealer', dealer);
    assert.strictEqual((await q(dealerCtx, 'SELECT 1 FROM customers WHERE id=$1', [rowX.id])).rowCount, 0);
    await assert.rejects(() => ctxFor(A, 'dealer', dealer, x.id), (e) => e.status === 403);

    // after assignment the dealer can work in X
    await ts.setBranchUsers(A.id, x.id, [dealer]);
    const dealerX = await ctxFor(A, 'dealer', dealer, x.id);
    assert.strictEqual((await q(dealerX, 'SELECT 1 FROM customers WHERE id=$1', [rowX.id])).rowCount, 1);

    // cannot write into a branch outside the allowed set (forged branch_id)
    await assert.rejects(() => q(dealerCtx, `INSERT INTO customers (name, branch_id) VALUES ('f', $1)`, [x.id]), /row-level security/);

    // a user from another tenant cannot be assigned
    const foreign = (await db.admin.query('SELECT id FROM users WHERE tenant_id=$1 LIMIT 1', [B.id])).rows[0].id;
    await assert.rejects(() => ts.setBranchUsers(A.id, x.id, [foreign]), (e) => e.status === 400);
  });

  test('downgrade keeps data, freezes extra branches, blocks multi-branch operations', async () => {
    const x = (await ts.listBranches(A.id)).find((b) => b.name === 'Branch X');
    const count = async () => (await db.admin.query('SELECT count(*)::int n FROM customers WHERE tenant_id=$1', [A.id])).rows[0].n;
    const before = await count();
    await ts.updateTenant(A.id, { plan: 'basic' });

    assert.strictEqual(await count(), before);
    await assert.rejects(() => ts.createBranch(A.id, 'Another'), (e) => e.code === 'FEATURE_NOT_IN_PLAN');

    const ctx = await ctxFor(A);
    assert.ok(ctx.readBranchIds.includes(x.id));   // still readable
    assert.ok(!ctx.writeBranchIds.includes(x.id)); // but frozen
    await assert.rejects(() => q(ctx, `INSERT INTO customers (name, branch_id) VALUES ('late', $1)`, [x.id]), /row-level security/);
    await q(ctx, `INSERT INTO customers (name) VALUES ('after-downgrade')`); // default branch still works
  });
}
