const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'CRM-DB',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Add created_by column to customers table
    await client.query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS created_by INTEGER;
    `);

    // Add foreign key constraint
    await client.query(`
      ALTER TABLE customers 
      DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
    `);

    await client.query(`
      ALTER TABLE customers 
      ADD CONSTRAINT customers_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    `);

    // For existing customers, try to assign them to dealers based on their deals
    await client.query(`
      UPDATE customers c
      SET created_by = (
        SELECT d.dealer_id 
        FROM deals d 
        WHERE d.customer_id = c.id 
        ORDER BY d.created_at ASC 
        LIMIT 1
      )
      WHERE created_by IS NULL;
    `);

    console.log('✅ Migration completed successfully!');
    console.log('Added created_by column to customers table');
    console.log('Existing customers assigned to dealers based on their deals');
    
    await client.end();
  } catch (error) {
    console.error('Migration error:', error);
    await client.end();
    process.exit(1);
  }
}

migrate();

