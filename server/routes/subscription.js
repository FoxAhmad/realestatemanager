const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const subs = require('../services/subscriptionService');
const handle = require('./handle');

// The tenant admin's own subscription: read it, attach a card, upgrade (only with a card), or ask the platform
// admin. Plans, prices, features and limits can never be edited from here.
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';
const API_URL = (req) => process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

router.get('/', auth, adminOnly, handle((req) => subs.tenantView(req.tenantId)));

router.post('/payment-method/setup', auth, adminOnly, handle((req) =>
  subs.beginAttach({
    tenant: req.tenant, user: req.user, providerName: req.body.provider || 'stripe',
    successUrl: `${APP_URL()}/my-plan?card=added`, cancelUrl: `${APP_URL()}/my-plan?card=cancelled`,
  })));

router.delete('/payment-method', auth, adminOnly, handle((req) => subs.removeMethod(req.tenantId, { id: req.user.id, role: 'admin' })));

router.post('/upgrade', auth, adminOnly, handle((req) =>
  subs.startUpgrade({
    tenantId: req.tenantId, user: req.user, planCode: req.body.plan, cycle: req.body.cycle,
    returnUrl: `${API_URL(req)}/api/billing/return/hosted`,
    callbackUrl: `${API_URL(req)}/api/billing/callback/opay`,
    cancelUrl: `${APP_URL()}/my-plan?payment=cancelled`,
  })));

router.post('/upgrade-request', auth, adminOnly, handle((req) =>
  subs.createUpgradeRequest(req.tenantId, req.user.id, req.body.plan, req.body.message), 201));

module.exports = router;
