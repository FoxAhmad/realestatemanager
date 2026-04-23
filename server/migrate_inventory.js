const db = require('./config/database');

async function migrate() {
  try {
    console.log('Starting migration...');
    
    // Add size column to inventory_plots if it doesn't exist
    await db.query(`
      ALTER TABLE inventory_plots 
      ADD COLUMN IF NOT EXISTS size VARCHAR(50);
    `);
    
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
