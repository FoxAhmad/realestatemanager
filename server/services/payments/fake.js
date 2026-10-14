// DEVELOPMENT ONLY (PAYMENTS_FAKE=1). Pretends to be a card provider so the upgrade UI can be exercised
// without provider keys. Charges succeed unless the amount ends in .13. Never enable in production.
module.exports = {
  name: 'fake',
  currencies: ['USD', 'PKR'],
  savesMethods: true,
  isConfigured: () => process.env.PAYMENTS_FAKE === '1',
  async startSetup({ tenant, successUrl }) {
    return {
      url: successUrl,
      customerId: `fake_cus_${tenant.id}`,
      attached: { methodId: `fake_pm_${tenant.id}`, brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
    };
  },
  async chargeSaved({ amount, reference }) {
    const ok = !String(amount).endsWith('.13');
    return { status: ok ? 'succeeded' : 'failed', providerRef: `fake_${reference}`, message: ok ? 'ok' : 'declined' };
  },
};
