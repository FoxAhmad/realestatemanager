const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  }
  : {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uh_crm',
    port: process.env.DB_PORT || 5432,
  };

const pool = new Pool(poolConfig);

const dealers = [
  { name: 'Adil', email: 'adil@example.com' },
  { name: 'Azam', email: 'azam@example.com' },
  { name: 'Murtaza', email: 'murtaza@example.com' },
  { name: 'Umair Ahmed Khan', email: 'umair@example.com' }
];

const entries = [
  // Adil
  { dealer: 'Adil', description: 'Online to UDPL - Adil Tansfer online to UDPL on 14-May-26', amount: 3000000 },
  { dealer: 'Adil', description: "BML Cheque - Shafeeq's cheque deposite in uDPL", amount: 5000000 },
  { dealer: 'Adil', description: 'Adil given cash to Azam Si - This Amount not deposite in UDPL', amount: 1000000 },

  // Azam
  { dealer: 'Azam', description: 'Azam Deposite to UDPL (10M)', amount: 1000000 },
  { dealer: 'Azam', description: 'Hassan Ghaffor given P.O', amount: 14000000 },

  // Murtaza
  { dealer: 'Murtaza', description: 'Azam Deposite 60 lac Chq - Payment Deposite against 40-L', amount: 5000000 },
  { dealer: 'Murtaza', description: 'Murtaza Given via Online - Payment Deposite against 35-D 10M', amount: 5000000 },
  { dealer: 'Murtaza', description: 'Murtaza transfer online to - Not deposite in UDPL', amount: 700000 },

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

    // 1. Get Accounts
    // Assuming ledgerService.getAccountMap is same as:
    const accMap = {
      CASH_BANK: 1,
      ACCOUNTS_RECEIVABLE: 2,
      DEALER_ADVANCES: 3,
      SAVINGS_DEPOSITS: 4,
      COMMISSION_PAYABLE: 5,
      CORPORATE_REVENUE: 6,
      DEALER_COMMISSION_EXPENSE: 7,
      DEALER_FINANCE: 9
    };

    // 2. Ensure dealers exist
    const dealerIdMap = {};
    for (const d of dealers) {
      let res = await client.query('SELECT id FROM users WHERE name = $1 AND role = $2', [d.name, 'dealer']);
      if (res.rows.length === 0) {
        // Create
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

    // 3. Insert finance entries
    for (const entry of entries) {
      const dealerId = dealerIdMap[entry.dealer];
      const val = parseFloat(entry.amount);

      // Create Transaction Record
      const transRes = await client.query(
          `INSERT INTO transactions 
              (transaction_date, description, reference_type) 
          VALUES ($1, $2, $3) RETURNING id`,
          [new Date(), entry.description, 'BALANCE_UPDATE']
      );
      const transId = transRes.rows[0].id;

      // Type is credit (adding finance)
      const financeLine = { account_id: accMap.DEALER_FINANCE, user_id: dealerId, debit: 0, credit: val };
      const cashLine = { account_id: accMap.CASH_BANK, user_id: null, debit: val, credit: 0 };

      // Insert Lines
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
    console.log('Successfully completed data insertion');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inserting data:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
