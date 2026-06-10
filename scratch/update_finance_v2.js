const { Pool } = require('pg');
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

const entriesData = [
  // adil
  { targetName: 'adil', description: 'Online to UDPL - Adil Tansfer online to UDPL on 14-May-26', amount: 3000000 },
  { targetName: 'adil', description: "BML Cheque - Shafeeq's cheque deposite in uDPL", amount: 5000000 },
  { targetName: 'adil', description: 'Adil given cash to Azam Si - This Amount not deposite in UDPL', amount: 1000000 },

  // azam
  { targetName: 'azam', description: 'Azam Deposite to UDPL (10M)', amount: 1000000 },
  { targetName: 'azam', description: 'Hassan Ghaffor given P.O', amount: 14000000 },

  // murtaza
  { targetName: 'murtaza', description: 'Azam Deposite 60 lac Chq - Payment Deposite against 40-L', amount: 5000000 },
  { targetName: 'murtaza', description: 'Murtaza Given via Online - Payment Deposite against 35-D 10M', amount: 5000000 },
  { targetName: 'murtaza', description: 'Murtaza transfer online to - Not deposite in UDPL', amount: 700000 },

  // umair
  { targetName: 'umair', description: 'UBL Chq of Zahid Kaleem', amount: 3000000 },
  { targetName: 'umair', description: 'UBL Chq of Zahid Kaleem', amount: 2250000 },
  { targetName: 'umair', description: 'Umair transfer Online via - Not Deposite in UDPL this amount consider in Liberty/ 286-E', amount: 1000000 },
  { targetName: 'umair', description: 'Umair transfer Online via - Not Deposite in UDPL this amount consider in Liberty/ 286-E', amount: 200000 },
  { targetName: 'umair', description: 'Umair transfer Online via - Not Deposite in UDPL this amount Adil will confirm', amount: 200000 },
  { targetName: 'umair', description: 'Umair transfer Online via - Not Deposite in UDPL this amount Adil will confirm', amount: 100000 },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Deleting previous entries...');
    // Only delete BALANCE_UPDATE entries with specific descriptions to avoid deleting user's valid entries
    const allDescriptions = entriesData.map(e => e.description);
    await client.query(
      "DELETE FROM transactions WHERE reference_type = 'BALANCE_UPDATE' AND description = ANY($1)",
      [allDescriptions]
    );

    const accMap = {
      CASH_BANK: 1,
      DEALER_FINANCE: 9
    };

    // Find User IDs
    const userIdMap = {};
    const lookups = [
      { key: 'adil', sql: "SELECT id FROM users WHERE name ILIKE '%adil siraj%'" },
      { key: 'azam', sql: "SELECT id FROM users WHERE name ILIKE '%azam khan%'" },
      { key: 'murtaza', sql: "SELECT id FROM users WHERE name ILIKE '%murtaza%'" },
      { key: 'umair', sql: "SELECT id FROM users WHERE name ILIKE '%umair%'" },
    ];

    for (const lookup of lookups) {
      const res = await client.query(lookup.sql);
      if (res.rows.length === 0) {
        throw new Error(`User not found for lookup: ${lookup.key}`);
      }
      // Just take the first matching user
      userIdMap[lookup.key] = res.rows[0].id;
      console.log(`Found ${lookup.key} with id ${res.rows[0].id}`);
    }

    console.log('Inserting new entries...');
    for (const entry of entriesData) {
      const dealerId = userIdMap[entry.targetName];
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
      console.log(`Added entry for ${entry.targetName}: ${entry.amount} - ${entry.description}`);
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
