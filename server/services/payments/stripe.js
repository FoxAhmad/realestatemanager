const crypto = require('crypto');

// Stripe via its REST API (no SDK dependency). USD only. Saves a card with Checkout in "setup" mode,
// so the card number never touches this server; we keep only Stripe's customer/payment-method ids.
const KEY = () => process.env.STRIPE_SECRET_KEY;

// Stripe wants application/x-www-form-urlencoded with bracketed nesting: metadata[tenant_id]=1
const encode = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.flatMap((x, i) => encode({ [i]: x }, key));
    if (typeof v === 'object') return encode(v, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(v)}`];
  });

const api = async (method, path, params = {}) => {
  const body = encode(params).join('&');
  const res = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error((json.error && json.error.message) || 'Stripe request failed'),
      { status: 502, code: 'PROVIDER_ERROR', stripe: json.error });
  }
  return json;
};

// Stripe-Signature: t=timestamp,v1=hmac(secret, `${t}.${rawBody}`)  (stripe.com/docs/webhooks)
const verifySignature = (rawBody, header, secret, toleranceSec = 300, now = Date.now()) => {
  if (!header || !secret) throw Object.assign(new Error('Missing Stripe signature'), { status: 400 });
  const items = header.split(',').map((p) => p.split('='));
  const t = Number((items.find(([k]) => k === 't') || [])[1]);
  const sigs = items.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) throw Object.assign(new Error('Malformed Stripe signature'), { status: 400 });
  if (Math.abs(now / 1000 - t) > toleranceSec) {
    throw Object.assign(new Error('Stripe signature timestamp outside tolerance'), { status: 400 });
  }
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw Object.assign(new Error('Invalid Stripe signature'), { status: 400 });
};

module.exports = {
  name: 'stripe',
  currencies: ['USD'],
  savesMethods: true,
  isConfigured: () => !!KEY(),
  verifySignature,

  // Returns { url, customerId }: send the tenant admin to url to enter a card on Stripe's page.
  async startSetup({ tenant, user, customerId, successUrl, cancelUrl }) {
    let customer = customerId;
    if (!customer) {
      customer = (await api('POST', '/customers', { email: user.email, name: tenant.name, metadata: { tenant_id: tenant.id } })).id;
    }
    const session = await api('POST', '/checkout/sessions', {
      mode: 'setup', customer, currency: 'usd', payment_method_types: ['card'],
      success_url: successUrl, cancel_url: cancelUrl, metadata: { tenant_id: tenant.id },
    });
    return { url: session.url, customerId: customer };
  },

  // Off-session charge of the saved card. Only 'succeeded' counts as paid.
  async chargeSaved({ customerId, methodId, amount, currency, reference, description }) {
    try {
      const pi = await api('POST', '/payment_intents', {
        amount: Math.round(amount * 100), currency: currency.toLowerCase(), customer: customerId, payment_method: methodId,
        confirm: true, off_session: true, description, metadata: { reference },
      });
      return { status: pi.status === 'succeeded' ? 'succeeded' : 'failed', providerRef: pi.id, message: pi.status };
    } catch (e) {
      if (e.stripe) return { status: 'failed', providerRef: (e.stripe.payment_intent && e.stripe.payment_intent.id) || null, message: e.message };
      throw e;
    }
  },

  // rawBody: Buffer exactly as received. Returns a normalized event, or null for events we ignore.
  async parseWebhook(rawBody, headers) {
    const text = rawBody.toString('utf8');
    verifySignature(text, headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    const event = JSON.parse(text);
    const obj = event.data && event.data.object;
    if (event.type === 'checkout.session.completed' && obj.mode === 'setup') {
      const si = await api('GET', `/setup_intents/${obj.setup_intent}`, { expand: ['payment_method'] });
      const pm = si.payment_method || {};
      const card = pm.card || {};
      return {
        id: event.id, type: 'method_attached', tenantId: Number(obj.metadata && obj.metadata.tenant_id),
        customerId: obj.customer, methodId: pm.id,
        brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year,
      };
    }
    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      return {
        id: event.id, type: 'payment', reference: obj.metadata && obj.metadata.reference, providerRef: obj.id,
        status: event.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed',
        amount: obj.amount / 100, currency: String(obj.currency).toUpperCase(),
      };
    }
    return null;
  },
};
