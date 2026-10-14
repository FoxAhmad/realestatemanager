// Pure logic, no database. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { resolveBranchAccess } = require('../services/tenantService');

const branches = [
  { id: 1, is_default: true, is_active: true },
  { id: 2, is_default: false, is_active: true },
  { id: 3, is_default: false, is_active: false },
  { id: 4, is_default: false, is_active: true },
];

test('without multi_branch only the default branch is writable, X-Branch-Id is ignored', () => {
  const r = resolveBranchAccess({ multiBranch: false, branches, role: 'admin', requestedBranchId: 2 });
  assert.deepStrictEqual(r.writeIds, [1]);
  assert.strictEqual(r.insertId, 1);
  assert.deepStrictEqual(r.readIds, [1, 2, 3, 4]); // leftovers from a downgrade stay readable
});

test('multi_branch admin: all branches readable, active ones writable', () => {
  const r = resolveBranchAccess({ multiBranch: true, branches, role: 'admin' });
  assert.deepStrictEqual(r.readIds, [1, 2, 3, 4]);
  assert.deepStrictEqual(r.writeIds, [1, 2, 4]);
  assert.strictEqual(r.insertId, 1);
});

test('a plan branch limit freezes the excess branches as read-only (default first, then oldest)', () => {
  const r = resolveBranchAccess({ multiBranch: true, branchLimit: 2, branches, role: 'admin' });
  assert.deepStrictEqual(r.writeIds, [1, 2]);
  assert.deepStrictEqual(r.readIds, [1, 2, 3, 4]);
});

test('user sees only assigned branches; default when none assigned', () => {
  assert.deepStrictEqual(resolveBranchAccess({ multiBranch: true, branches, role: 'dealer', userBranchIds: [2] }).readIds, [2]);
  assert.deepStrictEqual(resolveBranchAccess({ multiBranch: true, branches, role: 'dealer', userBranchIds: [] }).readIds, [1]);
});

test('requesting a branch the user cannot access is 403', () => {
  assert.throws(
    () => resolveBranchAccess({ multiBranch: true, branches, role: 'dealer', userBranchIds: [1], requestedBranchId: 2 }),
    (e) => e.status === 403
  );
});

test('an inactive branch is read-only', () => {
  const r = resolveBranchAccess({ multiBranch: true, branches, role: 'admin', requestedBranchId: 3 });
  assert.deepStrictEqual(r.readIds, [3]);
  assert.deepStrictEqual(r.writeIds, []);
  assert.strictEqual(r.insertId, null);
});

test('an inactive subscription makes everything read-only', () => {
  for (const multiBranch of [true, false]) {
    const r = resolveBranchAccess({ multiBranch, canWrite: false, branches, role: 'admin' });
    assert.deepStrictEqual(r.writeIds, []);
    assert.strictEqual(r.insertId, null);
    assert.ok(r.readIds.length > 0);
  }
});
