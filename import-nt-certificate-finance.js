/**
 * Import NT Certificate Finance Entries
 * 
 * Reads "Certificate Breakup.xlsx" and creates Finance entries
 * (account 9 = DEALER_FINANCE) for each investor's payments.
 * 
 * Each investor's individual payments (Cash/Online/Cheque/Pay-order) are
 * imported as Credit entries to DEALER_FINANCE so they can later be linked 
 * to certificate balance entries in ManageBalances via the 
 * "Transfer from Finance" dropdown.
 */

require('dotenv').config();
const { Client } = require('pg');

const isDryRun = process.argv.includes('--dry-run');
const isLiveDb = process.argv.includes('--live');

const investorData = [
  {
    name: 'AZAM KHAN',
    searchName: '%Azam%',
    payments: [
      { mode: 'Plot', ref: '156-C', amount: 3000000, note: 'Plot 156-C' },
      { mode: 'Plot', ref: '713-E', amount: 3000000, note: 'Plot 713-E' },
      { mode: 'Online', ref: null, amount: 665000, note: 'Online Transfer' },
      { mode: 'Cash', ref: null, amount: 500000, note: 'Cash Payment' },
      { mode: 'Online', ref: 'Zain', amount: 100000, note: 'Online Transfer (via Zain)' },
      { mode: 'Online', ref: null, amount: 190000, note: 'Online Transfer' },
    ],
  },
  {
    name: 'ADIL SIRAJ',
    searchName: '%Adil%',
    payments: [
      { mode: 'Cash', ref: null, amount: 1500000, note: 'Cash Payment' },
      { mode: 'Online', ref: null, amount: 500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 1500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 500000, note: 'Online Transfer' },
      { mode: 'Cash', ref: null, amount: 2000000, note: 'Cash Payment' },
      { mode: 'Pay Order', ref: null, amount: 4990000, note: 'Pay Order' },
    ],
  },
  {
    name: 'GHULAM MURTAZA',
    searchName: '%Murtaza%',
    payments: [
      { mode: 'Cash', ref: null, amount: 3500000, note: 'Cash Payment' },
      { mode: 'Online', ref: null, amount: 1500000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 1400000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 2750000, note: 'Online Transfer' },
      { mode: 'Online', ref: null, amount: 2110000, note: 'Online Transfer' },
    ],
  },
  {
    name: 'ZAIN-UL-ARFEEN',
    searchName: '%Zain%',
    payments: [
      { mode: 'Cash', ref: null, amount: 5000000, note: 'Cash Payment' },
    ],
  },
  {
    name: 'HAFIZ SHAHID',
    searchName: '%Hafiz%',
    payments: [
      { mode: 'Cheque', ref: null, amount: 5000000, note: 'Cheque Payment' },
      { mode: 'Cheque', ref: null, amount: 2500000, note: 'Cheque Payment' },
      { mode: 'Cheque', ref: null, amount: 2500000, note: 'Cheque Payment' },
    ],
  },
  {
    name: 'ASIF',
    searchName: '%Asif%',
    payments: [
      { mode: 'Cash', ref: null, amount: 5500000, note: 'Cash Payment' },
      { mode: 'Cash', ref: null, amount: 1335000, note: 'Cash Payment' },
    ],
  },
  {
    name: 'UMAR KHAN',
    searchName: 'Umar Khan',
    payments: [
      { mode: 'Cash', ref: null, amount: 1040000, note: 'Cash Payment' },
    ],
  },
];

const ACCOUNT_IDS = {
  CASH_BANK: 1,
  DEALER_FINANCE: 9,
};

const ENTRY_DATE = new Date('2026-01-01');

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN MODE' : '🚀 LIVE MODE');
  console.log(isLiveDb ? '🌐 Target: LIVE DB' : '🖥️  Target: LOCAL DB');
  const dbUrl = isLiveDb ? process.env.LIVE_DB_URL : (process.env.DATABASE_URL || process.env.LIVE_DB_URL);
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  if (!isDryRun) await client.query('BEGIN');

  try {
    let totalInserted = 0;
    let grandTotal = 0;

    for (const investor of investorData) {
      console.log(`\n── ${investor.name} ──`);
      
      const userRes = await client.query(`SELECT id, name FROM users WHERE name ILIKE $1 LIMIT 1`, [investor.searchName]);
      if (userRes.rows.length === 0) {
        throw new Error(`User not found for search: ${investor.searchName}`);
      }
      const userId = userRes.rows[0].id;
      console.log(`   Found User: ${userRes.rows[0].name} (ID: ${userId})`);

      for (const payment of investor.payments) {
        const desc = `NT Certificate Advance — ${investor.name}${payment.ref ? ` (${payment.ref})` : ''}: ${payment.note}`;
        const instrument = payment.mode === 'Plot' ? 'Property Transfer' :
                          payment.mode === 'Pay Order' ? 'Pay Order' :
                          payment.mode;

        console.log(`   [${instrument}] Rs. ${payment.amount.toLocaleString()} — ${desc}`);

        if (!isDryRun) {
          const transRes = await client.query(
            `INSERT INTO transactions (transaction_date, description, reference_type, instrument) 
             VALUES ($1, $2, 'DEPOSIT', $3) RETURNING id`,
            [ENTRY_DATE, desc, instrument]
          );
          const transId = transRes.rows[0].id;

          // Credit DEALER_FINANCE (dealer wallet receives funds)
          await client.query(
            `INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) 
             VALUES ($1, $2, $3, 0, $4)`,
            [transId, ACCOUNT_IDS.DEALER_FINANCE, userId, payment.amount]
          );

          // Debit CASH_BANK (money received in bank)
          await client.query(
            `INSERT INTO transaction_lines (transaction_id, account_id, debit, credit) 
             VALUES ($1, $2, $3, 0)`,
            [transId, ACCOUNT_IDS.CASH_BANK, payment.amount]
          );
        }
        totalInserted++;
        grandTotal += payment.amount;
      }
    }

    if (!isDryRun) await client.query('COMMIT');
    console.log('\n✅ IMPORT COMPLETE');
    console.log(`   Entries processed : ${totalInserted}`);
    console.log(`   Grand total       : Rs. ${grandTotal.toLocaleString()}`);

  } catch (err) {
    if (!isDryRun) await client.query('ROLLBACK');
    console.error('❌ ERROR:', err.message);
  } finally {
    await client.end();
  }
}

main();
