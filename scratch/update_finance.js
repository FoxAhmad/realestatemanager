const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uh_crm',
    port: process.env.DB_PORT || 5432,
  };

const pool = new Pool(poolConfig);

const oldDescriptions = [
  'Online to UDPL - Adil Tansfer online to UDPL on 14-May-26',
  "BML Cheque - Shafeeq's cheque deposite in uDPL",
  'Adil given cash to Azam Si - This Amount not deposite in UDPL',
  'Azam Deposite to UDPL (10M)',
  'Hassan Ghaffor given P.O',
  'Azam Deposite 60 lac Chq - Payment Deposite against 40-L',
  'Murtaza Given via Online - Payment Deposite against 35-D 10M',
  'Murtaza transfer online to - Not deposite in UDPL',
  'UBL Chq of Zahid Kaleem',
  'Umair transfer Online via - Not Deposite in UDPL this amount consider in Liberty/ 286-E',
  'Umair transfer Online via - Not Deposite in UDPL this amount Adil will confirm'
];

const dealers = [
  { name: 'adil siraj', oldName: 'Adil', email: 'adil@example.com' },
  { name: 'azam khan', oldName: 'Azam', email: 'azam@example.com' },
  { name: 'ghulam murtaza', oldName: 'Murtaza', email: 'murtaza@example.com' },
  { name: 'Umair Ahmed Khan', oldName: 'Umair Ahmed Khan', email: 'umair@example.com' }
];

const entries = [
  // adil siraj
  { dealer: 'adil siraj', description: 'Online to UDPL - Adil Tansfer online to UDPL on 14-May-26', amount: 3000000 },
  { dealer: 'adil siraj', description: "BML Cheque - Shafeeq's cheque deposite in uDPL", amount: 5000000 },
  { dealer: 'adil siraj', description: 'Adil given cash to Azam Si - This Amount not deposite in UDPL', amount: 1000000 },

  // azam khan
  { dealer: 'azam khan', description: 'Azam Deposite to UDPL (10M)', amount: 1000000 },
  { dealer: 'azam khan', description: 'Hassan Ghaffor given P.O', amount: 14000000 },

  // ghulam murtaza
  { dealer: 'ghulam murtaza', description: 'Azam Deposite 60 lac Chq - Payment Deposite against 40-L', amount: 5000000 },
  { dealer: 'ghulam murtaza', description: 'Murtaza Given via Online - Payment Deposite against 35-D 10M', amount: 5000000 },
  { dealer: 'ghulam murtaza', description: 'Murtaza transfer online to - Not deposite in UDPL', amount: 700000 },

  // Umair Ahmed Khan
  { dealer: 'Umair Ahmed Khan', description: 'UBL Chq of Zahid Kaleem', amount: 3000000 },
  { dealer: 'Umair Ahmed Khan', description: 'UBL Chq of Zahid Kaleem', amount: 2250000 },
  { dealer: 'Umair Ahmed Khan', description: 'Umair transfer Online via - Not Deposite in UDPL this amount consider in Liberty/ 286-E', amount: 1000000 },
  { dealer: 'Umair Ahmed Khan', description: 'Umair transfer Online via - Not Deposite in UDPL this amount consider in Liberty/ 286-E', amount: 200000 },
  { dealer: 'Umair Ahmed Khan', description: 'Umair transfer Online via - Not Deposite in UDPL this amount Adil will confirm', amount: 200000 },
  { dealer: 'Umair Ahmed Khan', description: 'Umair transfer Online via - Not Deposite in UDPL this amount Adil will confirm', amount: 100000 },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Deleting previous entries...');
    for (const desc of oldDescriptions) {
      await client.query(
        "DELETE FROM transactions WHERE reference_type = 'BALANCE_UPDATE' AND description = $1",
        [desc]
      );
    }

    const accMap = {
      CASH_BANK: 1,
      DEALER_FINANCE: 9
    };

    const dealerIdMap = {};
    for (const d of dealers) {
      if (d.oldName !== d.name) {
        await client.query('UPDATE users SET name = $1 WHERE name = $2 AND role = $3', [d.name, d.oldName, 'dealer']);
      }

      let res = await client.query('SELECT id FROM users WHERE name = $1 AND role = $2', [d.name, 'dealer']);
      if (res.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        res = await client.query(
          'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
          [d.name, d.email, hashedPassword, 'dealer']
        );
        console.log(`Created dealer ${d.name} with id ${res.rows[0].id}`);
      } else {
        console.log(`Found dealer ${d.name} with id ${res.rows[0].id}`);
      }
      dealerIdMap[d.name] = res.rows[0].id;
    }

    console.log('Inserting new entries...');
    for (const entry of entries) {
      const dealerId = dealerIdMap[entry.dealer];
      const val = parseFloat(entry.amount);

      const transRes = await client.query(
          `INSERT INTO transactions 
              (transaction_date, description, reference_type) 
          VALUES ($1, $2, $3) RETURNING id`,
          [new Date(), entry.description, 'BALANCE_UPDATE']
      );
      const transId = transRes.rows[0].id;

      const financeLine = { account_id: accMap.DEALER_FINANCE, user_id: dealerId, debit: 0, credit: val };
      const cashLine = { account_id: accMap.CASH_BANK, user_id: null, debit: val, credit: 0 };

      await client.query(
          'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
          [transId, financeLine.account_id, financeLine.user_id, financeLine.debit, financeLine.credit]
      );
      await client.query(
          'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
          [transId, cashLine.account_id, null, cashLine.debit, cashLine.credit]
      );
      console.log(`Added entry for ${entry.dealer}: ${entry.amount} - ${entry.description}`);
    }

    await client.query('COMMIT');
    console.log('Successfully completed data update');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating data:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
