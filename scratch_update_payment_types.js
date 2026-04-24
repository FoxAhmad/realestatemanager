const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Updating payments check constraint...');
    
    // Drop existing constraint
    await client.query(`
      ALTER TABLE payments 
      DROP CONSTRAINT IF EXISTS payments_payment_type_check;
    `);

    // Add new constraint including 'other'
    await client.query(`
      ALTER TABLE payments 
      ADD CONSTRAINT payments_payment_type_check 
      CHECK (payment_type IN ('down_payment', 'installment', 'other'));
    `);

    console.log('Constraint updated successfully!');
    await client.end();
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
