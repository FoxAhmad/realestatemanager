/**
 * Import NT Certificate Finance Entries
 * 
 * Reads "Certificate Breakup.xlsx" and creates Finance entries
 * (account 8 = ADVANCE_FOR_CERTIFICATE) for each investor's payments.
 * 
 * Each investor's individual payments (Cash/Online/Cheque/Pay-order) are
 * imported as Credit entries so they can later be linked to certificate
 * balance entries in ManageBalances.
 * 
 * Run with: node import-nt-certificate-finance.js
 * Add --dry-run to preview without inserting.
 */

require('dotenv').config();
const { Client } = require('pg');

const isDryRun = process.argv.includes('--dry-run');

// ── Raw data extracted from "NT CERTIFICATE" sheet ──────────────────────────
// Structure: { investor, payments: [{ mode, amount, description }] }
// Amounts are in PKR (Rupees).
// Source rows 8–15 of the Excel sheet (data_only values).
const investorData = [
  {
    name: 'AZAM KHAN',
    totalForms: 372.75,
    payments: [
      { mode: 'Plot', ref: '156-C', amount: 3000000, note: 'Plot 156-C' },
      { mode: 'Plot', ref: '713-E', amount: 3000000, note: 'Plot 713-E' },
      { mode: 'Online', ref: null, amount: 665000, note: 'Online Transfer' },
      { mode: 'Cash', ref: null, amount: 500000, note: 'Cash Payment' },
      { mode: 'Online', ref: 'Zain', amount: 100000, note: 'Online Transfer (via Zain)' },
      { mode: 'Online', ref: null, amount: 190000, note: 'Online Transfer' },
      // Remaining: 1,046,179 (Electricity Bill) + 1,189,957 (Electricity Bill ASK) + 932,300 (142-D Commercial) - from deduction rows
      // Total: 7,455,000 ✓ (3M + 3M + 665K + 500K + 100K + 190K = 7,455,000 ✓)
    ],
  },
  {
    name: 'ADIL SIRAJ',
    totalForms: 549.5,
    payments: [
      { mode: 'Cash', ref: null, amount: 1500000, note: 'Cash Payment' },
      { mode: 'Online', ref: null, amount: 500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 1500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 500000, note: 'Online Transfer' },
      { mode: 'Cash', ref: null, amount: 2000000, note: 'Cash Payment' },
      { mode: 'Pay Order', ref: null, amount: 4990000, note: 'Pay Order' },
      // Total: 10,990,000 ✓
    ],
  },
  {
    name: 'GHULAM MURTAZA',
    totalForms: 563,
    payments: [
      { mode: 'Cash', ref: null, amount: 3500000, note: 'Cash Payment' },
      { mode: 'Online', ref: null, amount: 1500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 1400000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 2750000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 2110000, note: 'Online Transfer' },
      // Total: 11,260,000 ✓
    ],
  },
  {
    name: 'ZAIN-UL-ARFEEN',
    totalForms: 250,
    payments: [
      { mode: 'Cash', ref: null, amount: 5000000, note: 'Cash Payment' },
      // Total: 5,000,000 ✓
    ],
  },
  {
    name: 'HAFIZ SHAHID',
    totalForms: 500,
    payments: [
      { mode: 'Cheque', ref: null, amount: 5000000, note: 'Cheque Payment' },
      { mode: 'Cheque', ref: null, amount: 2500000, note: 'Cheque Payment' },
      { mode: 'Cheque', ref: null, amount: 2500000, note: 'Cheque Payment' },
      // Total: 10,000,000 ✓
    ],
  },
  {
    name: 'ASIF',
    totalForms: 341.75,
    payments: [
      { mode: 'Cash', ref: null, amount: 5500000, note: 'Cash Payment' },
      { mode: 'Cash', ref: null, amount: 200000, note: 'Cash Payment (additional)' },
      { mode: 'Cash', ref: null, amount: 1335000, note: 'Cash Payment' },
      // Total: 7,035,000... but Excel shows 6,835,000.
      // Actually: 5,500,000 + 1,335,000 = 6,835,000 (200K is a sub-entry, not separate)
      // Corrected: 5,500,000 + 1,335,000 = 6,835,000
    ],
  },
  {
    name: 'UMAR KHAN',
    totalForms: 52,
    payments: [
      { mode: 'Cash', ref: null, amount: 1040000, note: 'Cash Payment' },
      // Total: 1,040,000 ✓
    ],
  },
];

// Fix ASIF — 200K is included in the 5.5M figure, total should be 6,835,000
// Remove the 200K separate entry
investorData[5].payments = [
  { mode: 'Cash', ref: null, amount: 5500000, note: 'Cash Payment' },
  { mode: 'Cash', ref: null, amount: 1335000, note: 'Cash Payment' },
];

// ── Account IDs (from ledgerService) ────────────────────────────────────────
const ACCOUNT_IDS = {
  CASH_BANK: 1,
  ADVANCE_FOR_CERTIFICATE: 8,
};

// ── Reference date for these historical entries ──────────────────────────────
const ENTRY_DATE = new Date('2026-01-01'); // Adjust as needed

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN MODE — No data will be inserted.' : '🚀 LIVE MODE — Data will be inserted.');
  console.log('');

  const dbUrl = process.env.DATABASE_URL || process.env.LIVE_DB_URL;
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to database.\n');

  if (!isDryRun) {
    await client.query('BEGIN');
  }

  try {
    let totalInserted = 0;
    let grandTotal = 0;

    for (const investor of investorData) {
      const investorTotal = investor.payments.reduce((s, p) => s + p.amount, 0);
      console.log(`\n── ${investor.name} ──`);
      console.log(`   Total Forms: ${investor.totalForms} | Total Amount: Rs. ${investorTotal.toLocaleString()}`);

      // Find or create customer
      let customerId;
      const custRes = await client.query(
        `SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [investor.name]
      );

      if (custRes.rows.length > 0) {
        customerId = custRes.rows[0].id;
        console.log(`   Found customer ID: ${customerId}`);
      } else {
        console.log(`   ⚠️  Customer "${investor.name}" not found in DB.`);
        if (!isDryRun) {
          const newCust = await client.query(
            `INSERT INTO customers (name, status, created_by) VALUES ($1, 'successful', 1) RETURNING id`,
            [investor.name]
          );
          customerId = newCust.rows[0].id;
          console.log(`   Created new customer ID: ${customerId}`);
        } else {
          customerId = `<new:${investor.name}>`;
        }
      }

      // Insert one Finance entry per payment installment
      for (const payment of investor.payments) {
        const desc = `NT Certificate Advance — ${investor.name}${payment.ref ? ` (${payment.ref})` : ''}: ${payment.note}`;
        const instrument = payment.mode === 'Plot' ? 'Property Transfer' :
                          payment.mode === 'Pay Order' ? 'Pay Order' :
                          payment.mode;

        console.log(`   [${instrument}] Rs. ${payment.amount.toLocaleString()} — ${desc}`);

        if (!isDryRun) {
          // Insert transaction header
          const transRes = await client.query(
            `INSERT INTO transactions 
               (transaction_date, description, reference_type, instrument) 
             VALUES ($1, $2, 'DEPOSIT', $3) RETURNING id`,
            [ENTRY_DATE, desc, instrument]
          );
          const transId = transRes.rows[0].id;

          // Credit ADVANCE_FOR_CERTIFICATE (customer receives certificate forms)
          await client.query(
            `INSERT INTO transaction_lines 
               (transaction_id, account_id, customer_id, debit, credit) 
             VALUES ($1, $2, $3, 0, $4)`,
            [transId, ACCOUNT_IDS.ADVANCE_FOR_CERTIFICATE, customerId, payment.amount]
          );

          // Debit CASH_BANK (money received)
          await client.query(
            `INSERT INTO transaction_lines 
               (transaction_id, account_id, debit, credit) 
             VALUES ($1, $2, $3, 0)`,
            [transId, ACCOUNT_IDS.CASH_BANK, payment.amount]
          );

          totalInserted++;
          grandTotal += payment.amount;
        } else {
          totalInserted++;
          grandTotal += payment.amount;
        }
      }
    }

    if (!isDryRun) {
      await client.query('COMMIT');
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(isDryRun ? '✅ DRY RUN COMPLETE' : '✅ IMPORT COMPLETE');
    console.log(`   Entries processed : ${totalInserted}`);
    console.log(`   Grand total       : Rs. ${grandTotal.toLocaleString()}`);
    console.log('══════════════════════════════════════════════\n');

    console.log('ℹ️  Next steps:');
    console.log('   1. Go to ManageBalances → "Advance for Certificate" tab');
    console.log('   2. These entries should now appear in Finance (Finance & Earnings page)');
    console.log('   3. When adding certificate balance entries, you can link them to these finance entries');

  } catch (err) {
    if (!isDryRun) {
      await client.query('ROLLBACK');
    }
    console.error('\n❌ ERROR:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
