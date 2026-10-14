const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const tenantService = require('../services/tenantService');

// Branch management. Plan rules (Platinum-only creation/activation/assignment) live in tenantService,
// so they hold for any caller; routes only add authentication and role checks.
// Branch tables have no RLS, so every call passes req.tenantId (from the authenticated user, never the body).

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
};

// Any user: the branches they can access, plus whether the tenant can manage more than one.
// Deliberately independent of the branch selected via X-Branch-Id: this is the management view.
router.get('/', auth, handle(async (req) => {
  const ctx = await tenantService.loadContext(req.user, null);
  return {
    plan: ctx.tenant.plan,
    multiBranch: ctx.multiBranch,
    limit: ctx.entitlements.limits.branches,
    branches: ctx.branches.filter((b) => ctx.readBranchIds.includes(b.id)),
  };
}));

router.post('/', auth, adminOnly, handle((req) => tenantService.createBranch(req.tenantId, req.body.name, req.user.id)));

router.put('/:id', auth, adminOnly, handle((req) =>
  tenantService.updateBranch(req.tenantId, Number(req.params.id), req.body, req.user.id)));

router.get('/:id/users', auth, adminOnly, handle((req) => tenantService.getBranchUsers(req.tenantId, Number(req.params.id))));

router.put('/:id/users', auth, adminOnly, handle(async (req) => ({
  userIds: await tenantService.setBranchUsers(req.tenantId, Number(req.params.id), req.body.userIds, req.user.id),
})));

module.exports = router;
