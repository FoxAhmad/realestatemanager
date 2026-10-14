const stripe = require('./stripe');
const jazzcash = require('./jazzcash');
const opay = require('./opay');
const fake = require('./fake');

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

const registry = { stripe, jazzcash, opay, fake };

// Tests (or a future provider) can swap adapters without touching the subscription logic.
const register = (name, impl) => { registry[name] = impl; };

const getProvider = (name) => {
  const p = registry[name];
  if (!p) throw httpError(400, 'Unknown payment provider', 'UNKNOWN_PROVIDER');
  if (!p.isConfigured()) throw httpError(503, `Payment provider "${name}" is not configured on this server`, 'PROVIDER_NOT_CONFIGURED');
  return p;
};

// USD -> Stripe. PKR -> JazzCash or OPay (PKR_PROVIDER env, default jazzcash).
const providerForCurrency = (currency) => (currency === 'USD' ? 'stripe' : (process.env.PKR_PROVIDER || 'jazzcash'));

const status = () => Object.fromEntries(Object.entries(registry)
  .filter(([n]) => n !== 'fake' || process.env.PAYMENTS_FAKE === '1')
  .map(([n, p]) => [n, { configured: p.isConfigured(), currencies: p.currencies, savesMethods: p.savesMethods }]));

module.exports = { getProvider, register, providerForCurrency, status, registry };
