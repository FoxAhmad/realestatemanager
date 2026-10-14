const crypto = require('crypto');

// JazzCash hosted checkout (page redirection). PKR only.
// NOT VERIFIED AGAINST THE SANDBOX: built from JazzCash's 2019 integration guide (v4.2) and community
// implementations. Re-check the field list, the hash rule and the endpoint in your merchant portal before going live.
//
// Hash rule used (community sources): HMAC-SHA256 with the Integrity Salt as key over
//   salt + '&' + <non-empty pp_* values sorted by field name, joined with '&'>   (pp_SecureHash excluded), uppercase hex.
const env = (k) => process.env[`JAZZCASH_${k}`];

const secureHash = (fields, salt) => {
  const values = Object.keys(fields)
    .filter((k) => k.toLowerCase().startsWith('pp') && k !== 'pp_SecureHash')
    .sort()
    .map((k) => fields[k])
    .filter((v) => v !== undefined && v !== null && String(v) !== '');
  return crypto.createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
};

// JazzCash timestamps are yyyyMMddHHmmss in Pakistan time (UTC+5)
const stamp = (d) => new Date(d.getTime() + 5 * 3600000).toISOString().replace(/[-T:]/g, '').slice(0, 14);

module.exports = {
  name: 'jazzcash',
  currencies: ['PKR'],
  savesMethods: false, // hosted checkout per payment
  isConfigured: () => !!(env('MERCHANT_ID') && env('PASSWORD') && env('INTEGRITY_SALT') && env('CHECKOUT_URL')),
  secureHash,

  // Returns { form: { action, fields } }: the client POSTs the form so the tenant lands on JazzCash's page.
  async createCheckout({ reference, amount, description, returnUrl }) {
    const now = new Date();
    const fields = {
      pp_Version: '1.1', pp_TxnType: '', pp_Language: 'EN', pp_MerchantID: env('MERCHANT_ID'), pp_SubMerchantID: '',
      pp_Password: env('PASSWORD'), pp_BankID: 'TBANK', pp_ProductID: 'RETL', pp_TxnRefNo: reference,
      pp_Amount: String(Math.round(amount * 100)), // paisa
      pp_TxnCurrency: 'PKR', pp_TxnDateTime: stamp(now), pp_BillReference: 'billRef', pp_Description: description,
      pp_TxnExpiryDateTime: stamp(new Date(now.getTime() + 3600000)), pp_ReturnURL: returnUrl,
      ppmpf_1: '', ppmpf_2: '', ppmpf_3: '', ppmpf_4: '', ppmpf_5: '',
    };
    fields.pp_SecureHash = secureHash(fields, env('INTEGRITY_SALT'));
    return { form: { action: env('CHECKOUT_URL'), method: 'POST', fields } };
  },

  // body: the urlencoded POST JazzCash sends to the return URL / IPN. Never trust it without the hash.
  verifyCallback(body) {
    const given = String(body.pp_SecureHash || '').toUpperCase();
    const expected = secureHash(body, env('INTEGRITY_SALT'));
    if (!given || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw Object.assign(new Error('Invalid JazzCash signature'), { status: 400 });
    }
    return {
      type: 'payment', reference: body.pp_TxnRefNo, providerRef: body.pp_RetreivalReferenceNo || null,
      status: body.pp_ResponseCode === '000' ? 'succeeded' : 'failed',
      amount: Number(body.pp_Amount) / 100, currency: body.pp_TxnCurrency || 'PKR',
    };
  },
};
