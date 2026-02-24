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

    // Update users role constraint to include 'dealer'
    await client.query(`
      ALTER TABLE users 
      DROP CONSTRAINT IF EXISTS users_role_check;
    `);
    
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'dealer'));
    `);

    // Check if agent_id column exists, then rename to dealer_id
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deals' AND column_name IN ('agent_id', 'dealer_id')
    `);
    
    const hasAgentId = columnCheck.rows.some(row => row.column_name === 'agent_id');
    const hasDealerId = columnCheck.rows.some(row => row.column_name === 'dealer_id');
    
    if (hasAgentId && !hasDealerId) {
      // Rename agent_id to dealer_id in deals table
      await client.query(`
        ALTER TABLE deals 
        RENAME COLUMN agent_id TO dealer_id;
      `);
      console.log('Renamed agent_id to dealer_id in deals table');
    } else if (hasDealerId) {
      console.log('dealer_id column already exists, skipping rename');
    } else {
      console.log('Neither agent_id nor dealer_id found in deals table');
    }

    // Rename index
    await client.query(`
      DROP INDEX IF EXISTS idx_deals_agent;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_dealer ON deals(dealer_id);
    `);

    // Update any existing 'agent' roles to 'dealer'
    await client.query(`
      UPDATE users 
      SET role = 'dealer' 
      WHERE role = 'agent';
    `);

    console.log('✅ Migration completed successfully!');
    console.log('All agent_id columns have been renamed to dealer_id');
    console.log('All agent roles have been updated to dealer');
    
    await client.end();
  } catch (error) {
    console.error('Migration error:', error);
    await client.end();
    process.exit(1);
  }
}

migrate();

