const express = require('express');
const router = express.Router();
const payments = require('../services/payments');
const subs = require('../services/subscriptionService');

// Provider -> us. NOT authenticated with a user token: every request is accepted only after its provider
// signature/hash is verified (and, for OPay, confirmed server-to-server). Payments only ever change a plan
// through subscriptionService.finalizePayment (idempotent, amount-checked).
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

const rawText = (req) => (req.rawBody ? req.rawBody.toString('utf8') : '');
const fail = (res, e) => {
  if (!e.status || e.status >= 500) console.error('billing callback error:', e.message);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'Server error' });
};

// Stripe webhooks (card saved, payment succeeded/failed)
router.post('/webhook/stripe', async (req, res) => {
  try {
    const evt = await payments.getProvider('stripe').parseWebhook(req.rawBody || Buffer.alloc(0), req.headers);
    const out = evt ? await subs.handleProviderEvent('stripe', evt) : { ignored: true };
    res.json({ received: true, ...out });
  } catch (e) { fail(res, e); }
});

// OPay server-to-server callback. Signature check, then confirm with OPay's status API before trusting it.
router.post('/callback/opay', async (req, res) => {
  try {
    const opay = payments.getProvider('opay');
    const evt = opay.verifyCallback(rawText(req), {
      authorization: req.headers.authorization, requesttimestamp: req.headers.requesttimestamp,
    });
    const confirmed = await opay.queryStatus(evt.reference);
    if (!confirmed || confirmed.status !== 'SUCCESS') {
      if (confirmed && ['FAIL', 'CLOSE'].includes(confirmed.status)) await subs.finalizePayment(evt.reference, { status: 'failed' });
      return res.json({ received: true, status: confirmed ? confirmed.status : 'unknown' });
    }
    const out = await subs.handleProviderEvent('opay', { ...evt, status: 'succeeded', amount: confirmed.amount, currency: confirmed.currency, providerRef: confirmed.providerRef || evt.providerRef });
    res.json({ received: true, ...out });
  } catch (e) { fail(res, e); }
});

// Browser returns from a hosted page. JazzCash POSTs signed fields here; the tenant is then sent back to the app.
// (For OPay the browser return carries nothing we trust: the callback above is what activates the plan.)
router.post('/return/hosted', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const evt = payments.getProvider('jazzcash').verifyCallback(req.body);
    const out = await subs.handleProviderEvent('jazzcash', evt);
    res.redirect(`${APP_URL()}/my-plan?payment=${out.status === 'succeeded' || out.already ? 'success' : 'failed'}`);
  } catch (e) {
    console.error('hosted return error:', e.message);
    res.redirect(`${APP_URL()}/my-plan?payment=failed`);
  }
});

module.exports = router;
