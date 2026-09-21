// One-off script: wipe current inventory/deals/payments (+ their ledger entries),
// then re-import the Union Town units from the "Dealer Account Statement" PDF
// the user provided. Run with: node server/scripts/reimport_union_town.js
//
// Uses the live HTTP API (as admin) for the import so all normal business logic
// (plot creation, double-entry ledger postings, adjustment-form ledger entries)
// runs exactly as it would from the UI. Uses a direct DB connection only for the
// wipe step, since there is no bulk-delete endpoint and the ledger cleanup needs
// to reach across tables the API doesn't expose.

const pool = require('../config/database');

// API base and admin login are read from the environment so nothing sensitive
// is hardcoded here - set these before running:
//   IMPORT_API_URL=http://localhost:5000/api
//   IMPORT_ADMIN_EMAIL=admin@uhcrm.com
//   IMPORT_ADMIN_PASSWORD=********
const API = process.env.IMPORT_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.IMPORT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.IMPORT_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set IMPORT_ADMIN_EMAIL and IMPORT_ADMIN_PASSWORD environment variables before running this script.');
  process.exit(1);
}

let TOKEN = null;

const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
};

// ---------------------------------------------------------------------------
// Source data transcribed from "CamScanner 09-15-2026 20.25.pdf" (12 Union
// Town "Dealer Account Statement" pages). Each unit's `payments` array lists
// every line in the printed table that actually shows a Received amount.
// `correction` is the handwritten "For/Till Nth Installment: Cash X, Form Y"
// note reconciled against the printed balance (see chat for the arithmetic
// cross-check). `installment_no` on the correction's cash leg is what the
// note was written against; for the two "Till 3rd" cumulative notes (374-A,
// 375-A) it's tagged "1st-3rd" since it covers three installments at once.
// ---------------------------------------------------------------------------

const FORM_VALUE = 40000; // Rs per adjustment form, customer-facing credit
const FORM_COST = 20000; // Rs per adjustment form, cost side (matches app default)

const UNITS = [
  {
    customer: 'AK Developers', salesperson: 'Murad',
    unit_no: '444-E', plot_type: 'R', plot_category: 'corner', block: 'E', size: '3.33 Marla',
    price: 7364500, sale_price: 8484869,
    form_number: 'UTR-01889-1 - Code - UT-R-3455-3483-3473', membership_no: '80017', registration_no: '10964',
    payments: [
      { type: 'down_payment', amount: 1995000, date: '2025-10-04', voucher_no: 'FISS # 1973', instrument: 'other' },
      { type: 'installment', installment_no: '1st', amount: 455000, date: '2026-02-16', voucher_no: 'RCVD # 9540', instrument: 'cash', lps: 84175 },
      { type: 'form_fee', amount: 1000, date: '2025-10-06', voucher_no: 'RCVD # 5587', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 145000, date: '2026-02-16', voucher_no: 'RCVD # 9540', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 310000, date: '2026-02-17', voucher_no: 'CADN # 1868', instrument: 'cdn', lps: 42625 },
      { type: 'installment', installment_no: '3rd', amount: 290000, date: '2026-02-17', voucher_no: 'CADN # 1868', instrument: 'cdn', lps: 580 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 85000, form: 80000 },
  },
  {
    customer: 'Universal Holdings', salesperson: 'Murad',
    unit_no: '344-E', plot_type: 'R', plot_category: 'general', block: 'E', size: '5.76 Marla',
    price: 11495000, sale_price: 13747123,
    form_number: 'UTR-02941-1 - Code - UT-R-77-120-91', membership_no: '81211', registration_no: '10662',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2026-02-10', voucher_no: 'FISS # 3185', instrument: 'other' },
      { type: 'installment', installment_no: '1st', amount: 520000, date: '2026-03-25', voucher_no: 'RCVD # 10591', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 130000, date: '2026-03-26', voucher_no: 'CADN # 2740', instrument: 'cdn', lps: 144430 },
      { type: 'installment', installment_no: '2nd', amount: 350000, date: '2026-03-26', voucher_no: 'CADN # 2740', instrument: 'cdn' },
      { type: 'installment', installment_no: '2nd', amount: 140000, date: '2026-05-25', voucher_no: 'RCVD # 14023', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 160000, date: '2026-06-03', voucher_no: 'CADN # 4694', instrument: 'cdn', lps: 104590 },
      { type: 'form_fee', amount: 1000, date: '2026-02-11', voucher_no: 'RCVD # 9172', instrument: 'cash' },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 330000, form: 320000 },
  },
  {
    customer: 'Punjab Real Estate & Builders', salesperson: 'Murad',
    unit_no: '878-E', plot_type: 'R', plot_category: 'park_face', block: 'E', size: '5.00 Marla',
    price: 12644500, sale_price: 13145500,
    form_number: 'UTR-00687-1 - Code - UT-R-1915-1943-1933', membership_no: '81638', registration_no: '10016',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2025-07-22', voucher_no: 'FISS # 684', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-22', voucher_no: 'RCVD # 2201', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 520000, date: '2026-03-25', voucher_no: 'RCVD # 10588', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 225000, date: '2026-03-26', voucher_no: 'CADN # 2739', instrument: 'cdn', lps: 155615 },
      { type: 'installment', installment_no: '2nd', amount: 255000, date: '2026-03-26', voucher_no: 'CADN # 2739', instrument: 'cdn' },
      { type: 'installment', installment_no: '2nd', amount: 250000, date: '2026-05-25', voucher_no: 'RCVD # 14020', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 240000, date: '2026-06-03', voucher_no: 'CADN # 4700', instrument: 'cdn', lps: 129155 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 385000, form: 360000 },
  },
  {
    customer: 'Universal Holdings', salesperson: 'Murad',
    unit_no: '312-E', plot_type: 'R', plot_category: 'general', block: 'E', size: '10.20 Marla',
    price: 22995000, sale_price: 24464485,
    form_number: 'UTR-00345-1 - Code - UT-R-487-515-505', membership_no: '81844', registration_no: '10662',
    payments: [
      { type: 'down_payment', amount: 7495000, date: '2025-07-17', voucher_no: 'FISS # 334', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-17', voucher_no: 'RCVD # 1649', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 600000, date: '2026-03-25', voucher_no: 'RCVD # 10589', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 600000, date: '2026-03-26', voucher_no: 'CADN # 2741', instrument: 'cdn', lps: 267000 },
      { type: 'installment', installment_no: '2nd', amount: 600000, date: '2026-05-25', voucher_no: 'RCVD # 14022', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 600000, date: '2026-06-03', voucher_no: 'CADN # 4625', instrument: 'cdn', lps: 234600 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 600000, form: 600000 },
  },
  {
    customer: 'Universal Holdings', salesperson: 'Murad',
    unit_no: '320-E', plot_type: 'R', plot_category: 'general', block: 'E', size: '10.82 Marla',
    price: 22995000, sale_price: 25890481,
    form_number: 'UTR-00346-1 - Code - UT-R-253-281-271', membership_no: '81847', registration_no: '10662',
    payments: [
      { type: 'down_payment', amount: 7495000, date: '2025-07-17', voucher_no: 'FISS # 336', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-17', voucher_no: 'RCVD # 1650', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 1200000, date: '2026-02-14', voucher_no: 'DINS # 1208', instrument: 'other', lps: 219600 },
      { type: 'installment', installment_no: '2nd', amount: 1200000, date: '2026-06-03', voucher_no: 'CADN # 4697', instrument: 'cdn', lps: 240000 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 600000, form: 600000 },
  },
  {
    customer: 'Land Advisor', salesperson: 'Muzamil',
    unit_no: '759-E', plot_type: 'R', plot_category: 'general', block: 'E', size: '5.00 Marla',
    price: 11495000, sale_price: 11995000,
    form_number: 'UTR-01100-1 - Code - UT-R-2611-2639-2629', membership_no: '80342', registration_no: '12776',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2025-07-31', voucher_no: 'FISS # 1100', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-31', voucher_no: 'RCVD # 2890', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 330000, date: '2026-03-25', voucher_no: 'RCVD # 10590', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 320000, date: '2026-03-26', voucher_no: 'CADN # 2742', instrument: 'cdn', lps: 144620 },
      { type: 'installment', installment_no: '2nd', amount: 330000, date: '2026-05-25', voucher_no: 'RCVD # 14021', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 320000, date: '2026-06-03', voucher_no: 'CADN # 4622', instrument: 'cdn', lps: 127030 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 330000, form: 320000 },
  },
  {
    customer: 'Al Mannan Estate & Developers', salesperson: 'Murad',
    unit_no: '876-E', plot_type: 'R', plot_category: 'park_face', block: 'E', size: '5.00 Marla',
    price: 12644500, sale_price: 13145500,
    form_number: 'UTR-00782-1 - Code - UT-R-1331-1359-1349', membership_no: '81636', registration_no: '12808',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2025-07-23', voucher_no: 'FISS # 779', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-23', voucher_no: 'RCVD # 2299', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 400000, date: '2025-11-21', voucher_no: 'DINS # 906', instrument: 'other' },
      { type: 'installment', installment_no: '1st', amount: 345000, date: '2025-11-24', voucher_no: 'CADN # 479', instrument: 'cdn', lps: 74045 },
      { type: 'installment', installment_no: '2nd', amount: 55000, date: '2025-11-24', voucher_no: 'CADN # 479', instrument: 'cdn' },
      { type: 'installment', installment_no: '2nd', amount: 370000, date: '2026-01-26', voucher_no: 'RCVD # 8523', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 320000, date: '2026-01-27', voucher_no: 'CADN # 1409', instrument: 'cdn', lps: 50495 },
      { type: 'installment', installment_no: '3rd', amount: 40000, date: '2026-01-27', voucher_no: 'CADN # 1409', instrument: 'cdn' },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 385000, form: 320000 },
  },
  {
    customer: 'Universal Holdings', salesperson: 'Murad',
    unit_no: '66-B', plot_type: 'C', plot_category: 'general', block: 'B', size: '6.05 Marla',
    price: 59495000, sale_price: 61193554,
    form_number: 'UTC-00125-2 - Code - UT-C-491-601-499', membership_no: '90064', registration_no: '10662',
    payments: [
      { type: 'down_payment', amount: 16495000, date: '2025-09-20', voucher_no: 'FISS # 1894', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-09-22', voucher_no: 'RCVD # 4426', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 1880000, date: '2026-01-21', voucher_no: 'RCVD # 8341', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 1870000, date: '2026-08-06', voucher_no: 'CADN # 5344', instrument: 'cdn', lps: 964640 },
      { type: 'installment', installment_no: '2nd', amount: 10000, date: '2026-08-06', voucher_no: 'CADN # 5344', instrument: 'cdn', lps: 2640 },
    ],
    // Explicit "Till 2nd Installment ✓" note (the "Till 3rd" alternative on this
    // page was crossed out) - a cumulative correction for the 2nd installment.
    correction: { installment_no: '2nd', date: '2026-05-15', cash: 1880000, form: 1880000 },
  },
  {
    customer: 'Al Haram Real Estate', salesperson: 'Murad',
    unit_no: '374-A', plot_type: 'R', plot_category: 'corner', block: 'A', size: '3.11 Marla',
    price: 8244500, sale_price: 8850852,
    form_number: 'UTR-02911-1 - Code - UT-R-1427-2145-1441', membership_no: '85374', registration_no: '10027',
    payments: [
      { type: 'down_payment', amount: 2495000, date: '2026-02-02', voucher_no: 'FISS # 3140', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2026-02-02', voucher_no: 'RCVD # 8881', instrument: 'cash' },
    ],
    // "Till 3rd Installment" cumulative note (covers 1st+2nd+3rd together).
    correction: { installment_no: '1st-3rd', date: '2026-08-15', cash: 699880, form: 680000 },
  },
  {
    customer: 'ASK Marketing', salesperson: 'Universal Holding',
    unit_no: '375-A', plot_type: 'R', plot_category: 'corner', block: 'A', size: '3.11 Marla',
    price: 8244500, sale_price: 8850852,
    form_number: 'UTR-02100-1 - Code - UT-R-1755-804-712', membership_no: '85375', registration_no: '10990',
    payments: [
      { type: 'down_payment', amount: 2495000, date: '2025-12-18', voucher_no: 'FISS # 2246', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-12-18', voucher_no: 'RCVD # 7005', instrument: 'cash' },
    ],
    correction: { installment_no: '1st-3rd', date: '2026-08-15', cash: 699880, form: 680000 },
  },
  {
    customer: 'Fit Marketing PK', salesperson: 'Murad',
    unit_no: '145-E', plot_type: 'R', plot_category: 'park_face', block: 'E', size: '5.04 Marla',
    price: 12644500, sale_price: 13257896,
    form_number: 'UTR-00026-1 - Code - UT-R-115-143-133', membership_no: '80055', registration_no: '10645',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2025-07-07', voucher_no: 'FISS # 26', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-17', voucher_no: 'RCVD # 1600', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 650000, date: '2025-08-29', voucher_no: 'DINS # 369', instrument: 'other' },
      { type: 'installment', installment_no: '1st', amount: 95000, date: '2025-11-19', voucher_no: 'CADN # 392', instrument: 'cdn', lps: 18220 },
      { type: 'installment', installment_no: '2nd', amount: 545000, date: '2025-11-19', voucher_no: 'CADN # 392', instrument: 'cdn' },
      { type: 'installment', installment_no: '2nd', amount: 10000, date: '2026-02-12', voucher_no: 'RCVD # 9295', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 110000, date: '2026-02-20', voucher_no: 'RCVD # 9754', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 80000, date: '2026-03-03', voucher_no: 'CADN # 2382', instrument: 'cdn', lps: 22380 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 385000, form: 360000 },
  },
  {
    customer: 'Universal Holdings', salesperson: 'Muzamil',
    unit_no: '175-B', plot_type: 'R', plot_category: 'general', block: 'B', size: '5.25 Marla',
    price: 11495000, sale_price: 12572691,
    form_number: 'UTR-00084-1 - Code - UT-R-837-865-855', membership_no: '80097', registration_no: '10662',
    payments: [
      { type: 'down_payment', amount: 3495000, date: '2025-07-11', voucher_no: 'FISS # 83', instrument: 'other' },
      { type: 'form_fee', amount: 1000, date: '2025-07-11', voucher_no: 'RCVD # 1056', instrument: 'cash' },
      { type: 'installment', installment_no: '1st', amount: 650000, date: '2026-01-26', voucher_no: 'RCVD # 8522', instrument: 'cash', lps: 106600 },
      { type: 'installment', installment_no: '2nd', amount: 10000, date: '2026-01-26', voucher_no: 'RCVD # 8522', instrument: 'cash' },
      { type: 'installment', installment_no: '2nd', amount: 640000, date: '2026-01-27', voucher_no: 'CADN # 1408', instrument: 'cdn', lps: 47440 },
    ],
    correction: { installment_no: '3rd', date: '2026-02-15', cash: 330000, form: 320000 },
  },
];

const wipeExisting = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delTx1 = await client.query(
      `DELETE FROM transactions WHERE reference_type IN ('DEAL','ADJUSTMENT','COMMISSION') AND reference_id IN (SELECT id FROM deals)`
    );
    const delTx2 = await client.query(
      `DELETE FROM transactions WHERE id IN (SELECT ledger_transaction_id FROM inventory_payments WHERE ledger_transaction_id IS NOT NULL)`
    );
    const delDeals = await client.query('DELETE FROM deals');
    const delInventory = await client.query('DELETE FROM inventory');
    await client.query('COMMIT');
    console.log(`Wiped: ${delDeals.rowCount} deals, ${delInventory.rowCount} inventory, ${delTx1.rowCount + delTx2.rowCount} ledger transactions (cascades handled payments/plots/adjustments).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const findOrCreateCustomer = async (customers, name) => {
  const existing = customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await api('POST', '/customers', { name });
  customers.push(created);
  return created.id;
};

const findOrCreateDealer = async (dealers, name) => {
  const existing = dealers.find((d) => d.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'salesperson';
  const email = `${slug}.${Date.now()}@placeholder.local`;
  const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const created = await api('POST', '/dealers', { name, email, password });
  dealers.push(created);
  return created.id;
};

const run = async () => {
  console.log('--- Wiping existing inventory/deals/payments/ledger entries ---');
  await wipeExisting();

  console.log('--- Logging in ---');
  const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  TOKEN = login.token;

  const projects = await api('GET', '/balance-projects');
  const unionTown = projects.find((p) => p.name.trim().toLowerCase() === 'union town');
  if (!unionTown) throw new Error('Union Town project not found in balance_projects');

  let customers = await api('GET', '/customers');
  let dealers = await api('GET', '/dealers');

  const results = [];

  for (const unit of UNITS) {
    console.log(`--- ${unit.unit_no} (${unit.customer}) ---`);
    const customerId = await findOrCreateCustomer(customers, unit.customer);
    const dealerId = await findOrCreateDealer(dealers, unit.salesperson);

    const inventory = await api('POST', '/inventory', {
      category: 'plot',
      address: `Block ${unit.block}, Union Town`,
      price: unit.price,
      quantity: 1,
      plot_numbers: unit.unit_no,
      plot_type: unit.plot_type,
      plot_category: unit.plot_category,
      size: unit.size,
      project_id: unionTown.id,
      block: unit.block,
      membership_no: unit.membership_no,
      registration_no: unit.registration_no,
      form_number: unit.form_number,
    });

    const plots = await api('GET', `/inventory/${inventory.id}/plots`);
    const plotId = plots[0].id;

    const deal = await api('POST', '/deals', {
      customer_id: customerId,
      dealer_id: dealerId,
      inventory_id: inventory.id,
      plot_id: plotId,
      property_type: 'plot',
      original_price: unit.price,
      sale_price: unit.sale_price,
    });

    for (const p of unit.payments) {
      await api('POST', '/payments', {
        deal_id: deal.id,
        payment_type: p.type,
        amount: p.amount,
        payment_date: p.date,
        instrument: p.instrument || null,
        voucher_no: p.voucher_no || null,
        lps_amount: p.lps || 0,
        installment_no: p.installment_no || null,
        notes: 'Imported from Union Town dealer account statement (29-Aug-2026)',
      });
    }

    if (unit.correction) {
      const c = unit.correction;
      const cashPayment = await api('POST', '/payments', {
        deal_id: deal.id,
        payment_type: 'installment',
        amount: c.cash,
        payment_date: c.date,
        instrument: 'cash',
        installment_no: c.installment_no,
        notes: `Cash portion of handwritten correction for installment ${c.installment_no}`,
      });

      const formsQty = Math.round(c.form / FORM_VALUE);
      await api('POST', '/balance-transactions/adjust-deal', {
        deal_id: deal.id,
        user_id: dealerId,
        quantity: formsQty,
        customer_price: c.form,
        cost_price: formsQty * FORM_COST,
        date: c.date,
        notes: `Adjustment Forms portion of handwritten correction for installment ${c.installment_no}`,
        payment_id: cashPayment.id,
      });
    }

    results.push({ unit: unit.unit_no, deal_id: deal.id, inventory_id: inventory.id, customer_id: customerId, dealer_id: dealerId });
  }

  console.log('--- Done ---');
  console.table(results);
  await pool.end();
};

run().catch((err) => {
  console.error('FAILED:', err);
  pool.end();
  process.exit(1);
});
