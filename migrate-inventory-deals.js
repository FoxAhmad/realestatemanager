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
    console.log('Starting migration...\n');

    // 1. Add inventory_id to deals table (if it doesn't exist)
    console.log('1. Adding inventory_id column to deals table...');
    try {
      await client.query(`
        ALTER TABLE deals 
        ADD COLUMN IF NOT EXISTS inventory_id INTEGER;
      `);
      
      // Add foreign key constraint if it doesn't exist
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'deals_inventory_id_fkey'
          ) THEN
            ALTER TABLE deals 
            ADD CONSTRAINT deals_inventory_id_fkey 
            FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      
      console.log('   ✅ inventory_id column added to deals table');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️  inventory_id column already exists');
      } else {
        throw error;
      }
    }

    // 2. Add quantity to inventory table (if it doesn't exist)
    console.log('2. Adding quantity column to inventory table...');
    try {
      await client.query(`
        ALTER TABLE inventory 
        ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1 NOT NULL;
      `);
      console.log('   ✅ quantity column added to inventory table');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️  quantity column already exists');
      } else {
        throw error;
      }
    }

    // 2a. Add inventory_quantity_used to deals table (if it doesn't exist)
    console.log('2a. Adding inventory_quantity_used column to deals table...');
    try {
      await client.query(`
        ALTER TABLE deals 
        ADD COLUMN IF NOT EXISTS inventory_quantity_used INTEGER DEFAULT 1;
      `);
      console.log('   ✅ inventory_quantity_used column added to deals table');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️  inventory_quantity_used column already exists');
      } else {
        throw error;
      }
    }

    // 3. Create inventory_requests table (if it doesn't exist)
    console.log('3. Creating inventory_requests table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_requests (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        salesperson_id INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ inventory_requests table created');

    // 4. Create indexes
    console.log('4. Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_requests_status ON inventory_requests(status)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_requests_salesperson ON inventory_requests(salesperson_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_inventory ON deals(inventory_id)
    `);
    
    console.log('   ✅ Indexes created');

    // 5. Create trigger for inventory_requests updated_at
    console.log('5. Creating triggers...');
    
    // Ensure the function exists
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_inventory_requests_updated_at ON inventory_requests;
      CREATE TRIGGER update_inventory_requests_updated_at
        BEFORE UPDATE ON inventory_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    
    console.log('   ✅ Triggers created');

    // 6. Update existing inventory records to have quantity = 1 if null
    console.log('6. Updating existing inventory records...');
    await client.query(`
      UPDATE inventory 
      SET quantity = 1 
      WHERE quantity IS NULL OR quantity < 1
    `);
    console.log('   ✅ Existing inventory records updated');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nSummary:');
    console.log('  - Added inventory_id to deals table');
    console.log('  - Added quantity to inventory table');
    console.log('  - Created inventory_requests table');
    console.log('  - Created necessary indexes and triggers');
    
    await client.end();
  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

migrate();

