// Pure logic, no database. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { resolveBranchAccess, assertMultiBranch } = require('../services/tenantService');

const branches = [
  { id: 1, is_default: true, is_active: true },
  { id: 2, is_default: false, is_active: true },
  { id: 3, is_default: false, is_active: false },
];
const platinum = { plan: 'platinum', status: 'active' };
const basic = { plan: 'basic', status: 'active' };

test('non-platinum writes only the default branch, ignores X-Branch-Id', () => {
  const r = resolveBranchAccess({ tenant: basic, branches, role: 'admin', requestedBranchId: 2 });
  assert.deepStrictEqual(r.writeIds, [1]);
  assert.strictEqual(r.insertId, 1);
  assert.deepStrictEqual(r.readIds, [1, 2, 3]); // leftovers from a downgrade stay readable
});

test('platinum admin: all branches readable, active ones writable', () => {
  const r = resolveBranchAccess({ tenant: platinum, branches, role: 'admin' });
  assert.deepStrictEqual(r.readIds, [1, 2, 3]);
  assert.deepStrictEqual(r.writeIds, [1, 2]);
  assert.strictEqual(r.insertId, 1);
});

test('platinum user sees only assigned branches; default when none assigned', () => {
  assert.deepStrictEqual(resolveBranchAccess({ tenant: platinum, branches, role: 'dealer', userBranchIds: [2] }).readIds, [2]);
  assert.deepStrictEqual(resolveBranchAccess({ tenant: platinum, branches, role: 'dealer', userBranchIds: [] }).readIds, [1]);
});

test('requesting a branch the user cannot access is 403', () => {
  assert.throws(
    () => resolveBranchAccess({ tenant: platinum, branches, role: 'dealer', userBranchIds: [1], requestedBranchId: 2 }),
    (e) => e.status === 403
  );
});

test('an inactive branch is read-only', () => {
  const r = resolveBranchAccess({ tenant: platinum, branches, role: 'admin', requestedBranchId: 3 });
  assert.deepStrictEqual(r.readIds, [3]);
  assert.deepStrictEqual(r.writeIds, []);
  assert.strictEqual(r.insertId, null);
});

test('multi-branch needs an active Platinum tenant', () => {
  assert.throws(() => assertMultiBranch(basic), (e) => e.code === 'PLAN_REQUIRED');
  assert.throws(() => assertMultiBranch({ plan: 'platinum', status: 'suspended' }), (e) => e.code === 'PLAN_REQUIRED');
  assert.doesNotThrow(() => assertMultiBranch(platinum));
});
