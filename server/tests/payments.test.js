// Pure logic, no database or network. Signature checks use the algorithms from each provider's docs,
// so these prove tamper/replay rejection, NOT compatibility with the live provider (needs sandbox keys).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { effectiveStatus } = require('../services/entitlementService');
const stripe = require('../services/payments/stripe');
const jazzcash = require('../services/payments/jazzcash');
const opay = require('../services/payments/opay');

const DAY = 86400000;

test('effectiveStatus: active -> grace -> expired by end date; others never revive', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const sub = (status, daysAgo) => ({ status, end_date: new Date(now.getTime() - daysAgo * DAY) });
  assert.strictEqual(effectiveStatus(sub('active', -5), now, 7), 'active');
  assert.strictEqual(effectiveStatus(sub('active', 3), now, 7), 'grace');
  assert.strictEqual(effectiveStatus(sub('active', 8), now, 7), 'expired');
  assert.strictEqual(effectiveStatus(sub('trial', 8), now, 7), 'expired');
  assert.strictEqual(effectiveStatus(sub('grace', -2), now, 7), 'active'); // renewed into the future
  assert.strictEqual(effectiveStatus({ status: 'active', end_date: null }, now, 7), 'active'); // never expires
  for (const s of ['cancelled', 'suspended', 'expired']) assert.strictEqual(effectiveStatus(sub(s, -30), now, 7), s);
});

test('stripe webhook signature: valid, tampered, wrong secret, stale', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'x' });
  const t = Math.floor(Date.now() / 1000);
  const sig = (ts, b, s = secret) => `t=${ts},v1=${crypto.createHmac('sha256', s).update(`${ts}.${b}`).digest('hex')}`;
  assert.doesNotThrow(() => stripe.verifySignature(body, sig(t, body), secret));
  assert.throws(() => stripe.verifySignature(body + ' ', sig(t, body), secret), /Invalid/);
  assert.throws(() => stripe.verifySignature(body, sig(t, body, 'other'), secret), /Invalid/);
  assert.throws(() => stripe.verifySignature(body, sig(t - 3600, body), secret), /tolerance/);
  assert.throws(() => stripe.verifySignature(body, '', secret), /Missing/);
});

test('jazzcash: hash covers every field, tampering is rejected', () => {
  process.env.JAZZCASH_INTEGRITY_SALT = 'salt123';
  const fields = { pp_Amount: '500000', pp_TxnRefNo: 'UP-1-1', pp_ResponseCode: '000', pp_TxnCurrency: 'PKR', pp_Language: 'EN', pp_Empty: '' };
  const signed = { ...fields, pp_SecureHash: jazzcash.secureHash(fields, 'salt123') };
  const evt = jazzcash.verifyCallback(signed);
  assert.deepStrictEqual([evt.status, evt.amount, evt.reference], ['succeeded', 5000, 'UP-1-1']);
  assert.throws(() => jazzcash.verifyCallback({ ...signed, pp_Amount: '100' }), /Invalid/); // amount tampered
  assert.throws(() => jazzcash.verifyCallback({ ...signed, pp_SecureHash: 'ABC' }), /Invalid/);
  assert.throws(() => jazzcash.verifyCallback({ ...fields }), /Invalid/); // unsigned
  assert.strictEqual(jazzcash.verifyCallback({ ...fields, pp_ResponseCode: '124', pp_SecureHash: jazzcash.secureHash({ ...fields, pp_ResponseCode: '124' }, 'salt123') }).status, 'failed');
});

test('opay callback: HMAC-SHA512(timestamp + body), tampering rejected', () => {
  process.env.OPAY_PRIVATE_KEY = 'private-key';
  const body = JSON.stringify({ payload: { reference: 'UP-1-1', orderNo: 'o1', status: 'SUCCESS', amount: { total: 500000, currency: 'PKR' } } });
  const ts = '1631106688000';
  const authorization = opay.hmac512('private-key', `${ts}${body}`);
  const evt = opay.verifyCallback(body, { authorization, requesttimestamp: ts });
  assert.deepStrictEqual([evt.status, evt.amount, evt.currency, evt.reference], ['succeeded', 5000, 'PKR', 'UP-1-1']);
  assert.throws(() => opay.verifyCallback(body.replace('SUCCESS', 'FAIL'), { authorization, requesttimestamp: ts }), /Invalid/);
  assert.throws(() => opay.verifyCallback(body, { authorization, requesttimestamp: '1' }), /Invalid/);
  assert.throws(() => opay.verifyCallback(body, { authorization: '', requesttimestamp: ts }), /Invalid/);
  assert.throws(() => opay.verifyCallback(body, {}), /Invalid/);
});
