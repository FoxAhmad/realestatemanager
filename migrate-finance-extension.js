const { Client } = require('pg');
require('dotenv').config();

// One-off, idempotent migration for the loans/investments/owner-equity ledger extension.
// dbInit.js applies these same changes on every boot for fresh environments -- run this
// manually against an already-deployed DB that won't get a fresh boot right away.
async function run() {
  const connectionConfig = process.env.DATABASE_URL
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

  const client = new Client(connectionConfig);

  try {
    await client.connect();
    console.log('Connected to Database. Applying finance ledger extension...');

    await client.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_reference_type_check`);
    await client.query(`
      ALTER TABLE transactions ADD CONSTRAINT transactions_reference_type_check
        CHECK (reference_type IN (
          'DEAL', 'DEPOSIT', 'ADJUSTMENT', 'TRANSFER', 'COMMISSION', 'BALANCE_UPDATE',
          'LOAN_DISBURSED', 'LOAN_REPAYMENT', 'LOAN_TAKEN', 'LOAN_REPAID',
          'INVESTMENT_MADE', 'INVESTMENT_RETURN', 'OWNER_DRAWING', 'OWNER_CONTRIBUTION'
        ))
    `);
    console.log('✅ reference_type constraint widened.');

    const newParentAccounts = [
      ['Investments', 'Asset'],
      ['Loans Receivable', 'Asset'],
      ['Loans Payable', 'Liability'],
      ['Owner Equity / Drawings', 'Equity']
    ];
    for (const [name, type] of newParentAccounts) {
      await client.query(`
        INSERT INTO accounts (name, type)
        SELECT $1::varchar, $2::varchar
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = $1::varchar AND parent_id IS NULL)
      `, [name, type]);
    }
    console.log('✅ Parent accounts seeded: Investments, Loans Receivable, Loans Payable, Owner Equity / Drawings.');

    await client.query(`ALTER TABLE inventory_payments ADD COLUMN IF NOT EXISTS ledger_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE dealer_exchanges ADD COLUMN IF NOT EXISTS ledger_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL`);
    console.log('✅ ledger_transaction_id added to inventory_payments and dealer_exchanges.');

    console.log('Finance ledger extension applied successfully.');
  } catch (error) {
    console.error('Error applying finance ledger extension:', error.message);
  } finally {
    await client.end();
  }
}

run();
