const express = require('express');
const router = express.Router();
const { auth, adminOnly, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

// GET /available removed as part of removing inventory requests

// Get all inventory (Admin, Accountant, and Employees see all)
router.get('/', auth, async (req, res) => {
  try {
    const userResult = await db.query('SELECT role, is_employee FROM users WHERE id = $1', [req.user.id]);
    const userData = userResult.rows[0];
    const seeAll = userData.role === 'admin' || userData.role === 'accountant' || userData.is_employee || userData.role === 'dealer';

    let result;
    if (seeAll) {
      result = await db.query(`
        SELECT i.*, u.name as assigned_to_name,
               COALESCE(SUM(CASE WHEN d.status != 'deal_not_done' THEN d.inventory_quantity_used ELSE 0 END), 0) as used_quantity,
               (SELECT plot_type FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as plot_type,
               (SELECT plot_category FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as plot_category,
               (SELECT size FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as size
        FROM inventory i
        LEFT JOIN users u ON i.assigned_to = u.id
        LEFT JOIN deals d ON i.id = d.inventory_id
        GROUP BY i.id, u.name
        ORDER BY i.created_at DESC
      `);
      
      // Fetch all plot assignments with details for each inventory item
      for (let item of result.rows) {
        const plotsResult = await db.query(`
          SELECT 
            ip.id as plot_id,
            ip.plot_number,
            ip.status as plot_status,
            ip.size,
            ip.plot_category,
            ip.plot_type,
            u.id as assigned_to_id,
            u.name as assigned_to_name
          FROM inventory_plots ip
          LEFT JOIN users u ON ip.assigned_to = u.id
          WHERE ip.inventory_id = $1
          ORDER BY ip.plot_number ASC
        `, [item.id]);
        
        item.plots = plotsResult.rows;
      }
    } else {
      // Salespersons see ALL assigned inventory (either via inventory.assigned_to OR via plot assignments)
      // Show inventory if:
      // 1. Directly assigned to them (status assigned/paid/sold)
      // 2. OR has plots assigned to them (regardless of inventory status)
      result = await db.query(`
        SELECT DISTINCT i.*, u.name as assigned_to_name,
               COALESCE(SUM(CASE WHEN d.status != 'deal_not_done' THEN d.inventory_quantity_used ELSE 0 END), 0) as used_quantity,
               (SELECT plot_type FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as plot_type,
               (SELECT plot_category FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as plot_category,
               (SELECT size FROM inventory_plots WHERE inventory_id = i.id LIMIT 1) as size,
               CASE 
                 WHEN i.assigned_to = $1 THEN true
                 WHEN EXISTS (SELECT 1 FROM inventory_plots ip WHERE ip.inventory_id = i.id AND ip.assigned_to = $1) THEN true
                 ELSE false
               END as is_assigned_to_me
        FROM inventory i
        LEFT JOIN users u ON i.assigned_to = u.id
        LEFT JOIN deals d ON i.id = d.inventory_id
        WHERE (i.assigned_to = $1 AND i.status IN ('assigned', 'paid', 'sold'))
           OR EXISTS (SELECT 1 FROM inventory_plots ip WHERE ip.inventory_id = i.id AND ip.assigned_to = $1 AND ip.status IN ('assigned', 'paid'))
        GROUP BY i.id, u.name
        ORDER BY i.created_at DESC
      `, [req.user.id]);
      
      // Fetch assigned plots separately for each inventory item with investor info
      for (let item of result.rows) {
        const plotsResult = await db.query(`
          SELECT ip.id, ip.plot_number, ip.status
          FROM inventory_plots ip
          WHERE ip.inventory_id = $1 AND ip.assigned_to = $2 AND ip.status IN ('assigned', 'paid')
          ORDER BY ip.plot_number ASC
        `, [item.id, req.user.id]);
        
        // For each plot, get investor contributions
        for (let plot of plotsResult.rows) {
          const investorsResult = await db.query(`
            SELECT 
              inv.id as investor_id,
              inv.name as investor_name,
              COALESCE(SUM(ipay.amount), 0) as amount_contributed
            FROM investors inv
            INNER JOIN inventory_payments ipay ON inv.id = ipay.investor_id
            WHERE ipay.inventory_id = $1 AND ipay.plot_id = $2
            GROUP BY inv.id, inv.name
            ORDER BY inv.name
          `, [item.id, plot.id]);
          plot.investors = investorsResult.rows;
        }
        
        item.assigned_plots = plotsResult.rows;
      }
    }
    
    // Calculate available quantity for each item
    const inventoryWithAvailability = result.rows.map(item => ({
      ...item,
      available_quantity: item.quantity - parseInt(item.used_quantity || 0),
      assigned_plots: item.assigned_plots || []
    }));
    
    res.json(inventoryWithAvailability);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get plots for an inventory item
router.get('/:id/plots', auth, async (req, res) => {
  try {
    // Check if we should only return available plots (for request modal)
    const availableOnly = req.query.available_only === 'true';
    
    // First check if user has access to this inventory
    let inventoryCheck;
    if (req.user.role === 'admin') {
      inventoryCheck = await db.query('SELECT id FROM inventory WHERE id = $1', [req.params.id]);
    } else {
      // Salespersons can view plots for:
      // 1. Inventory assigned to them
      // 2. Available inventory (for making requests)
      inventoryCheck = await db.query(
        `SELECT id FROM inventory 
         WHERE id = $1 
         AND (
           assigned_to = $2 
           OR EXISTS (SELECT 1 FROM inventory_plots ip WHERE ip.inventory_id = inventory.id AND ip.assigned_to = $2)
           OR (status = 'available' AND assigned_to IS NULL)
         )`,
        [req.params.id, req.user.id]
      );
    }

    if (inventoryCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    let query = `
      SELECT ip.*, u.name as assigned_to_name
      FROM inventory_plots ip
      LEFT JOIN users u ON ip.assigned_to = u.id
      WHERE ip.inventory_id = $1
    `;
    
    // If available_only is true, only return available plots
    if (availableOnly) {
      query += ` AND ip.status = 'available' AND ip.assigned_to IS NULL`;
    }
    
    query += ` ORDER BY ip.plot_number ASC`;

    const result = await db.query(query, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get inventory by ID
router.get('/:id', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT i.*, u.name as assigned_to_name,
               COUNT(ip.id) as plot_count
        FROM inventory i
        LEFT JOIN users u ON i.assigned_to = u.id
        LEFT JOIN inventory_plots ip ON i.id = ip.inventory_id
        WHERE i.id = $1
        GROUP BY i.id, u.name
      `, [req.params.id]);
    } else {
      // Salespersons can only view inventory assigned to them
      result = await db.query(`
        SELECT i.*, u.name as assigned_to_name,
               COUNT(ip.id) as plot_count
        FROM inventory i
        LEFT JOIN users u ON i.assigned_to = u.id
        LEFT JOIN inventory_plots ip ON i.id = ip.inventory_id
        WHERE i.id = $1 AND i.assigned_to = $2
        GROUP BY i.id, u.name
      `, [req.params.id, req.user.id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to parse plot numbers
const parsePlotNumbers = (plotNumbersInput) => {
  if (!plotNumbersInput || typeof plotNumbersInput !== 'string') {
    return [];
  }
  
  // Split by comma, newline, or semicolon, then trim and filter empty
  return plotNumbersInput
    .split(/[,\n;]/)
    .map(num => num.trim())
    .filter(num => num.length > 0);
};

// Create inventory (Admin and Accountant)
router.post('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { category, address, price, quantity, plot_numbers, plot_type, plot_category, size } = req.body;

    if (!category || !address || !price) {
      return res.status(400).json({ message: 'Category, address, and price are required' });
    }

    if (!['plot', 'house', 'shop_office'].includes(category)) {
      return res.status(400).json({ message: 'Invalid category. Must be plot, house, or shop_office' });
    }

    const qty = parseInt(quantity || 1);
    const plotNumbersInput = plot_numbers || '';
    const parsedPlotNumbers = parsePlotNumbers(plotNumbersInput);

    // If plot numbers are provided, validate quantity matches
    if (plotNumbersInput && parsedPlotNumbers.length > 0) {
      if (parsedPlotNumbers.length !== qty) {
        return res.status(400).json({ 
          message: `Quantity (${qty}) must match the number of plot numbers provided (${parsedPlotNumbers.length})` 
        });
      }
    }

    // Create inventory record
    const result = await db.query(`
      INSERT INTO inventory (category, address, price, quantity, status, plot_numbers_input)
      VALUES ($1, $2, $3, $4, 'available', $5)
      RETURNING *
    `, [category, address, price, qty, plotNumbersInput || null]);

    const inventoryId = result.rows[0].id;

    // Create individual plot records if plot numbers are provided
    if (parsedPlotNumbers.length > 0) {
      for (const plotNumber of parsedPlotNumbers) {
        await db.query(`
          INSERT INTO inventory_plots (inventory_id, plot_number, status, plot_type, plot_category, size)
          VALUES ($1, $2, 'available', $3, $4, $5)
        `, [inventoryId, plotNumber, plot_type || 'R', plot_category || 'standard', size || null]);
      }
    } else {
      // If no plot numbers provided, create placeholder plots based on quantity
      for (let i = 1; i <= qty; i++) {
        await db.query(`
          INSERT INTO inventory_plots (inventory_id, plot_number, status, plot_type, plot_category, size)
          VALUES ($1, $2, 'available', $3, $4, $5)
        `, [inventoryId, `${category}-${i}`, plot_type || 'R', plot_category || 'standard', size || null]);
      }
    }

    // Fetch inventory with plot count
    const inventoryResult = await db.query(`
      SELECT i.*, COUNT(ip.id) as plot_count
      FROM inventory i
      LEFT JOIN inventory_plots ip ON i.id = ip.inventory_id
      WHERE i.id = $1
      GROUP BY i.id
    `, [inventoryId]);

    res.status(201).json(inventoryResult.rows[0] || result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'Duplicate plot number found. Each plot number must be unique within an inventory item.' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update inventory (Admin and Accountant)
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { category, address, price, quantity, status, assigned_to, plot_numbers, merge_ids, plot_type, plot_category, size } = req.body;

    await db.query('BEGIN');

    // 1. Update the main record
    const result = await db.query(`
      UPDATE inventory 
      SET category = COALESCE($1, category),
          address = COALESCE($2, address),
          price = COALESCE($3, price),
          quantity = COALESCE($4, quantity),
          status = COALESCE($5, status),
          assigned_to = COALESCE($6, assigned_to)
      WHERE id = $7
      RETURNING *
    `, [category, address, price, quantity ? parseInt(quantity) : null, status, assigned_to || null, req.params.id]);

    if (result.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory not found' });
    }

    const inventoryId = req.params.id;
    
    // 1.5 Update global plot fields for all plots in this inventory item if provided
    if (plot_type || plot_category || size) {
      await db.query(`
        UPDATE inventory_plots 
        SET plot_type = COALESCE($1, plot_type),
            plot_category = COALESCE($2, plot_category),
            size = COALESCE($3, size)
        WHERE inventory_id = $4
      `, [plot_type, plot_category, size, inventoryId]);
    }

    // 2. Handle Mercury/Merge if merge_ids provided
    if (merge_ids && Array.isArray(merge_ids)) {
      const otherIds = merge_ids.filter(id => id.toString() !== inventoryId.toString());
      if (otherIds.length > 0) {
        // Move all plots from other records to this record
        await db.query(`
          UPDATE inventory_plots 
          SET inventory_id = $1 
          WHERE inventory_id = ANY($2::int[])
        `, [inventoryId, otherIds]);

        // Move all deals from other records to this record
        await db.query(`
          UPDATE deals 
          SET inventory_id = $1 
          WHERE inventory_id = ANY($2::int[])
        `, [inventoryId, otherIds]);

        // Delete the other inventory records
        await db.query(`
          DELETE FROM inventory 
          WHERE id = ANY($1::int[])
        `, [otherIds]);
      }
    }

    // 3. Update plot numbers if provided
    if (plot_numbers !== undefined) {
      const parsePlotNumbers = (input) => {
        if (!input) return [];
        return input.split(/[,\n;]/).map(num => num.trim()).filter(num => num.length > 0);
      };

      const newPlotNumbers = parsePlotNumbers(plot_numbers);
      
      // Get current plots for this inventory
      const currentPlotsResult = await db.query('SELECT plot_number FROM inventory_plots WHERE inventory_id = $1', [inventoryId]);
      const currentPlotNumbers = currentPlotsResult.rows.map(r => r.plot_number);

      // Plots to add
      const toAdd = newPlotNumbers.filter(n => !currentPlotNumbers.includes(n));
      // Plots to remove (only if safe - for now we allow it but usually we should check for deals)
      const toRemove = currentPlotNumbers.filter(n => !newPlotNumbers.includes(n));

      // Add new plots
      for (const plotNumber of toAdd) {
        await db.query(`
          INSERT INTO inventory_plots (inventory_id, plot_number, status)
          VALUES ($1, $2, 'available')
          ON CONFLICT (inventory_id, plot_number) DO NOTHING
        `, [inventoryId, plotNumber]);
      }

      // Remove deleted plots
      if (toRemove.length > 0) {
        await db.query(`
          DELETE FROM inventory_plots 
          WHERE inventory_id = $1 AND plot_number = ANY($2)
        `, [inventoryId, toRemove]);
      }
    }

    await db.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Assign inventory endpoint removed


// Delete inventory (Admin and Accountant)
router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM inventory WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    res.json({ message: 'Inventory deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update specific plot (Admin and Accountant)
router.put('/plots/:plotId', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { plot_number, plot_category, plot_type, size } = req.body;
    
    // Add validation 
    if (!plot_number) {
      return res.status(400).json({ message: 'Plot number is required' });
    }

    const result = await db.query(`
      UPDATE inventory_plots 
      SET plot_number = COALESCE($1, plot_number),
          plot_category = COALESCE($2, plot_category),
          plot_type = COALESCE($3, plot_type),
          size = COALESCE($4, size)
      WHERE id = $5
      RETURNING *
    `, [plot_number, plot_category, plot_type, size, req.params.plotId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Plot not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'Duplicate plot number found.' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

