const express = require('express');
const router = express.Router();
const { auth, superAdminOnly } = require('../middleware/auth');
const subs = require('../services/subscriptionService');
const handle = require('./handle');

// Subscription administration: super admin only.
const guard = [auth, superAdminOnly];
const tid = (req) => Number(req.params.tenantId);
const actor = (req) => ({ id: req.user.id, role: 'super_admin' });

router.get('/', ...guard, handle((req) => subs.listSubscriptions({ status: req.query.status })));
router.get('/expiring', ...guard, handle((req) => subs.listExpiring(Number(req.query.days) || 14)));
router.get('/report', ...guard, handle(() => subs.report()));
router.get('/upgrade-requests', ...guard, handle(() => subs.listUpgradeRequests()));
router.post('/upgrade-requests/:id/close', ...guard, handle((req) => subs.closeUpgradeRequest(Number(req.params.id))));

router.get('/:tenantId', ...guard, handle((req) => subs.detail(tid(req))));
router.post('/:tenantId/activate', ...guard, handle((req) =>
  subs.activate(tid(req), req.body.plan, { billingCycle: req.body.billingCycle, currency: req.body.currency, trial: !!req.body.trial }, actor(req))));
router.post('/:tenantId/change-plan', ...guard, handle((req) =>
  subs.changePlan(tid(req), req.body.plan, actor(req), { billingCycle: req.body.billingCycle, currency: req.body.currency })));
router.post('/:tenantId/renew', ...guard, handle((req) => subs.renew(tid(req), actor(req), { billingCycle: req.body.billingCycle })));
router.post('/:tenantId/cancel', ...guard, handle((req) => subs.cancel(tid(req), actor(req))));
router.post('/:tenantId/suspend', ...guard, handle((req) => subs.suspend(tid(req), actor(req))));
router.post('/:tenantId/reactivate', ...guard, handle((req) => subs.reactivate(tid(req), actor(req))));
router.post('/:tenantId/addons', ...guard, handle((req) => subs.addAddon(tid(req), req.body.addon, req.body.quantity, actor(req)), 201));
router.delete('/:tenantId/addons/:id', ...guard, handle((req) => subs.removeAddon(tid(req), Number(req.params.id), actor(req))));
// JazzCash/OPay cannot save a card: enabling them for a tenant is the "payment method attached" step.
router.post('/:tenantId/payment-method/enable', ...guard, handle((req) => subs.enableHosted(tid(req), req.body.provider, actor(req))));
router.delete('/:tenantId/payment-method', ...guard, handle((req) => subs.removeMethod(tid(req), actor(req))));

module.exports = router;
