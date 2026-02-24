const db = require('./server/config/database');
require('dotenv').config();

const migrateInventoryToPlots = async () => {
  try {
    console.log('Starting inventory to plots migration...');

    // First, ensure plot_id column exists in inventory_payments table
    console.log('Checking and adding plot_id column to inventory_payments...');
    try {
      await db.query(`
        ALTER TABLE inventory_payments 
        ADD COLUMN IF NOT EXISTS plot_id INTEGER REFERENCES inventory_plots(id) ON DELETE SET NULL
      `);
      console.log('plot_id column added/verified in inventory_payments table');
    } catch (error) {
      if (error.code !== '42703') { // Column already exists error code
        throw error;
      }
      console.log('plot_id column already exists');
    }

    // Get all existing inventory items
    const inventoryResult = await db.query('SELECT * FROM inventory ORDER BY id');

    console.log(`Found ${inventoryResult.rows.length} inventory items to migrate`);

    for (const inventory of inventoryResult.rows) {
      console.log(`Processing inventory ID ${inventory.id}: ${inventory.category} - ${inventory.address}`);

      // Check if plots already exist for this inventory
      const existingPlots = await db.query(
        'SELECT COUNT(*) as count FROM inventory_plots WHERE inventory_id = $1',
        [inventory.id]
      );

      if (parseInt(existingPlots.rows[0].count) > 0) {
        console.log(`  Skipping - plots already exist for inventory ${inventory.id}`);
        continue;
      }

      const quantity = parseInt(inventory.quantity || 1);

      // Create placeholder plot numbers if plot_numbers_input is empty
      if (!inventory.plot_numbers_input || inventory.plot_numbers_input.trim() === '') {
        // Create plots with placeholder names
        for (let i = 1; i <= quantity; i++) {
          const plotNumber = `${inventory.category}-${inventory.id}-${i}`;
          await db.query(`
            INSERT INTO inventory_plots (inventory_id, plot_number, status, assigned_to, assigned_at)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            inventory.id,
            plotNumber,
            inventory.status === 'assigned' || inventory.status === 'paid' ? 'assigned' : 'available',
            inventory.assigned_to || null,
            inventory.assigned_to ? new Date() : null
          ]);
        }
        console.log(`  Created ${quantity} placeholder plots`);
      } else {
        // Parse existing plot numbers
        const plotNumbers = inventory.plot_numbers_input
          .split(/[,\n;]/)
          .map(num => num.trim())
          .filter(num => num.length > 0);

        if (plotNumbers.length > 0) {
          for (const plotNumber of plotNumbers) {
            await db.query(`
              INSERT INTO inventory_plots (inventory_id, plot_number, status, assigned_to, assigned_at)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              inventory.id,
              plotNumber,
              inventory.status === 'assigned' || inventory.status === 'paid' ? 'assigned' : 'available',
              inventory.assigned_to || null,
              inventory.assigned_to ? new Date() : null
            ]);
          }
          console.log(`  Created ${plotNumbers.length} plots from plot_numbers_input`);
        } else {
          // Fallback to placeholder if parsing failed
          for (let i = 1; i <= quantity; i++) {
            const plotNumber = `${inventory.category}-${inventory.id}-${i}`;
            await db.query(`
              INSERT INTO inventory_plots (inventory_id, plot_number, status, assigned_to, assigned_at)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              inventory.id,
              plotNumber,
              inventory.status === 'assigned' || inventory.status === 'paid' ? 'assigned' : 'available',
              inventory.assigned_to || null,
              inventory.assigned_to ? new Date() : null
            ]);
          }
          console.log(`  Created ${quantity} placeholder plots (parsing failed)`);
        }
      }

      // Migrate inventory assignments to inventory_plot_assignments if inventory is assigned
      if (inventory.assigned_to) {
        const plotsResult = await db.query(
          'SELECT id FROM inventory_plots WHERE inventory_id = $1',
          [inventory.id]
        );

        if (plotsResult.rows.length > 0) {
          const plotIds = plotsResult.rows.map(p => p.id);
          const totalAmount = plotsResult.rows.length * parseFloat(inventory.price || 0);

          // Check if assignment already exists
          const existingAssignment = await db.query(
            'SELECT id FROM inventory_plot_assignments WHERE inventory_id = $1 AND salesperson_id = $2',
            [inventory.id, inventory.assigned_to]
          );

          if (existingAssignment.rows.length === 0) {
            await db.query(`
              INSERT INTO inventory_plot_assignments (
                inventory_id, salesperson_id, assignment_date,
                total_plots_assigned, total_amount, amount_paid
              )
              VALUES ($1, $2, CURRENT_DATE, $3, $4, 0)
            `, [inventory.id, inventory.assigned_to, plotsResult.rows.length, totalAmount]);

            console.log(`  Created assignment record for ${plotsResult.rows.length} plots`);
          }
        }
      }
    }

    // Migrate existing inventory_payments to link to plots where possible
    console.log('\nMigrating inventory payments...');
    const paymentsResult = await db.query(`
      SELECT ip.*, i.assigned_to
      FROM inventory_payments ip
      INNER JOIN inventory i ON ip.inventory_id = i.id
      WHERE ip.plot_id IS NULL
    `);

    console.log(`Found ${paymentsResult.rows.length} payments to potentially migrate`);

    for (const payment of paymentsResult.rows) {
      // Try to find a plot for this inventory that matches the salesperson
      const plotResult = await db.query(`
        SELECT id FROM inventory_plots
        WHERE inventory_id = $1 AND assigned_to = $2
        LIMIT 1
      `, [payment.inventory_id, payment.salesperson_id]);

      if (plotResult.rows.length > 0) {
        await db.query(`
          UPDATE inventory_payments
          SET plot_id = $1
          WHERE id = $2
        `, [plotResult.rows[0].id, payment.id]);
        console.log(`  Linked payment ${payment.id} to plot ${plotResult.rows[0].id}`);
      }
    }

    console.log('\nMigration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

migrateInventoryToPlots();

