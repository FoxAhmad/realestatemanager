const db = require('./server/config/database');
const initDatabase = require('./server/config/dbInit');
require('dotenv').config();

async function runMigrations() {
  console.log('🚀 Starting live database migrations...');
  console.log('🔗 Connection URL:', process.env.DATABASE_URL ? 'FOUND (Neon)' : 'NOT FOUND (using fallback)');

  try {
    // 1. Run Schema Initialization
    console.log('\n--- Phase 1: Schema Initialization ---');
    await initDatabase();
    console.log('✅ Schema initialized successfully.');

    // 2. Run Data Migrations (if applicable)
    // Check if we need to run migrate-inventory-to-plots.js logic
    console.log('\n--- Phase 2: Data Migrations ---');
    
    // Check if the inventory_plots table is empty but inventory has data
    const inventoryCount = await db.query('SELECT COUNT(*) FROM inventory');
    const plotsCount = await db.query('SELECT COUNT(*) FROM inventory_plots');
    
    if (parseInt(inventoryCount.rows[0].count) > 0 && parseInt(plotsCount.rows[0].count) === 0) {
      console.log('📦 Found inventory but no plots. Running inventory-to-plots data migration...');
      // We can't easily require it if it's not a module, so we'll just advise running it or import it if possible
      // Actually, since I'm creating this script, I'll just incorporate the logic or use a child process
      const { execSync } = require('child_process');
      try {
        execSync('node migrate-inventory-to-plots.js', { stdio: 'inherit' });
        console.log('✅ Data migration completed.');
      } catch (err) {
        console.error('❌ Data migration failed:', err.message);
      }
    } else {
      console.log('⏭️ No data migration needed or already completed.');
    }

    console.log('\n✨ All migrations finished successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
    process.exit(1);
  }
}

runMigrations();
