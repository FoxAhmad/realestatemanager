const crypto = require('crypto');

// OPay Cashier (hosted checkout). Written from the official docs at doc.opaycheckout.com.
// CAVEATS: (1) the docs only show EG/EGP, so PKR support must be confirmed with OPay for your merchant account
// (OPAY_COUNTRY / currency are configurable); (2) the callback signature encoding is not stated in the docs,
// hex is assumed; (3) not verified against the sandbox.
const env = (k) => process.env[`OPAY_${k}`];
const base = () => env('BASE_URL') || 'https://sandboxapi.opaycheckout.com';
const hmac512 = (key, data) => crypto.createHmac('sha512', key).update(data).digest('hex');

const post = async (path, headers, bodyStr) => {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', MerchantId: env('MERCHANT_ID'), ...headers },
    body: bodyStr,
  });
  return res.json();
};

module.exports = {
  name: 'opay',
  currencies: ['PKR'],
  savesMethods: false,
  isConfigured: () => !!(env('MERCHANT_ID') && env('PUBLIC_KEY') && env('PRIVATE_KEY')),
  hmac512,

  async createCheckout({ reference, amount, currency, description, returnUrl, callbackUrl, cancelUrl, user }) {
    const body = {
      country: env('COUNTRY') || 'PK', reference, amount: { total: Math.round(amount * 100), currency },
      returnUrl, callbackUrl, cancelUrl, expireAt: 30,
      userInfo: { userId: String(user.id), userName: user.name, userEmail: user.email },
      product: { name: description, description },
    };
    const r = await post('/api/v1/international/cashier/create', { Authorization: `Bearer ${env('PUBLIC_KEY')}` }, JSON.stringify(body));
    if (!['00000', '00'].includes(String(r.code)) || !r.data || !r.data.cashierUrl) {
      throw Object.assign(new Error(`OPay: ${r.message || 'could not create payment'}`), { status: 502, code: 'PROVIDER_ERROR' });
    }
    return { redirectUrl: r.data.cashierUrl, providerRef: r.data.orderNo };
  },

  // Server-to-server confirmation. Always call this before trusting a callback (OPay's own recommendation).
  async queryStatus(reference) {
    const bodyStr = JSON.stringify({ reference, country: env('COUNTRY') || 'PK' });
    const r = await post('/api/v1/international/cashier/status', { Authorization: `Bearer ${hmac512(env('PRIVATE_KEY'), bodyStr)}` }, bodyStr);
    if (!r.data) return null;
    return {
      status: r.data.status, providerRef: r.data.orderNo,
      amount: r.data.amount && r.data.amount.total / 100, currency: r.data.amount && r.data.amount.currency,
    };
  },

  // Callback signature = HMAC-SHA512(private key, RequestTimestamp + rawBody), sent in the Authorization header.
  verifyCallback(rawBody, headers) {
    const ts = headers.requesttimestamp;
    const given = String(headers.authorization || '').replace(/^Bearer\s+/i, '').toLowerCase();
    const expected = ts ? hmac512(env('PRIVATE_KEY'), `${ts}${rawBody}`) : '';
    if (!expected || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw Object.assign(new Error('Invalid OPay signature'), { status: 400 });
    }
    const body = JSON.parse(rawBody);
    const p = body.payload || body;
    let status = 'pending';
    if (p.status === 'SUCCESS') status = 'succeeded';
    else if (['FAIL', 'CLOSE'].includes(p.status)) status = 'failed';
    return {
      type: 'payment', reference: p.reference, providerRef: p.orderNo || null, status,
      amount: p.amount && Number(p.amount.total) / 100, currency: p.amount && p.amount.currency,
    };
  },
};
