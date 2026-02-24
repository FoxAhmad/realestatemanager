const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get available inventory for requests (all users can see available inventory)
// Shows inventory that has at least one available plot
router.get('/available', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT i.*
      FROM inventory i
      WHERE i.status = 'available' 
        AND i.assigned_to IS NULL
        AND EXISTS (
          SELECT 1 FROM inventory_plots ip 
          WHERE ip.inventory_id = i.id 
          AND ip.status = 'available'
          AND ip.assigned_to IS NULL
        )
      ORDER BY i.created_at DESC
    `);
    
    // For each inventory item, fetch available plots
    for (let item of result.rows) {
      const availablePlotsResult = await db.query(`
        SELECT ip.id, ip.plot_number, ip.status
        FROM inventory_plots ip
        WHERE ip.inventory_id = $1 
          AND ip.status = 'available'
          AND ip.assigned_to IS NULL
        ORDER BY ip.plot_number ASC
      `, [item.id]);
      item.available_plots = availablePlotsResult.rows;
    }
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all inventory (Admin sees all, Salespersons see only assigned to them)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT i.*, u.name as assigned_to_name,
               COALESCE(SUM(CASE WHEN d.status != 'deal_not_done' THEN d.inventory_quantity_used ELSE 0 END), 0) as used_quantity
        FROM inventory i
        LEFT JOIN users u ON i.assigned_to = u.id
        LEFT JOIN deals d ON i.id = d.inventory_id
        GROUP BY i.id, u.name
        ORDER BY i.created_at DESC
      `);
      
      // Fetch all plot assignments with assignee details for each inventory item
      for (let item of result.rows) {
        const plotsWithAssigneesResult = await db.query(`
          SELECT 
            ip.id as plot_id,
            ip.plot_number,
            ip.status as plot_status,
            u.id as assigned_to_id,
            u.name as assigned_to_name,
            u.email as assigned_to_email
          FROM inventory_plots ip
          LEFT JOIN users u ON ip.assigned_to = u.id
          WHERE ip.inventory_id = $1
          ORDER BY ip.plot_number ASC
        `, [item.id]);
        
        // Group plots by assignee
        const assigneesMap = new Map();
        const unassignedPlots = [];
        
        plotsWithAssigneesResult.rows.forEach(plot => {
          if (plot.assigned_to_id) {
            if (!assigneesMap.has(plot.assigned_to_id)) {
              assigneesMap.set(plot.assigned_to_id, {
                id: plot.assigned_to_id,
                name: plot.assigned_to_name,
                email: plot.assigned_to_email,
                plots: []
              });
            }
            assigneesMap.get(plot.assigned_to_id).plots.push({
              id: plot.plot_id,
              plot_number: plot.plot_number,
              status: plot.plot_status
            });
          } else {
            unassignedPlots.push({
              id: plot.plot_id,
              plot_number: plot.plot_number,
              status: plot.plot_status
            });
          }
        });
        
        item.plot_assignments = Array.from(assigneesMap.values());
        item.unassigned_plots = unassignedPlots;
        
        // Also keep the old all_assignees for backward compatibility
        item.all_assignees = Array.from(assigneesMap.values()).map(a => ({
          id: a.id,
          name: a.name,
          email: a.email
        }));
      }
    } else {
      // Salespersons see ALL assigned inventory (either via inventory.assigned_to OR via plot assignments)
      // Show inventory if:
      // 1. Directly assigned to them (status assigned/paid/sold)
      // 2. OR has plots assigned to them (regardless of inventory status)
      result = await db.query(`
        SELECT DISTINCT i.*, u.name as assigned_to_name,
               COALESCE(SUM(CASE WHEN d.status != 'deal_not_done' THEN d.inventory_quantity_used ELSE 0 END), 0) as used_quantity,
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

// Create inventory (Admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { category, address, price, quantity, plot_numbers } = req.body;

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
          INSERT INTO inventory_plots (inventory_id, plot_number, status)
          VALUES ($1, $2, 'available')
        `, [inventoryId, plotNumber]);
      }
    } else {
      // If no plot numbers provided, create placeholder plots based on quantity
      for (let i = 1; i <= qty; i++) {
        await db.query(`
          INSERT INTO inventory_plots (inventory_id, plot_number, status)
          VALUES ($1, $2, 'available')
        `, [inventoryId, `${category}-${i}`]);
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

// Update inventory (Admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { category, address, price, quantity, status, assigned_to } = req.body;

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
      return res.status(404).json({ message: 'Inventory not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Assign inventory to salesperson (Admin only)
router.post('/:id/assign', auth, adminOnly, async (req, res) => {
  try {
    const { salesperson_id, plot_ids, amount_paid, notes } = req.body;

    if (!salesperson_id) {
      return res.status(400).json({ message: 'Salesperson ID is required' });
    }

    // Check if salesperson exists and is a dealer
    const userCheck = await db.query(
      'SELECT id, role FROM users WHERE id = $1 AND role = $2',
      [salesperson_id, 'dealer']
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    // Get inventory details
    const inventoryResult = await db.query(
      'SELECT * FROM inventory WHERE id = $1',
      [req.params.id]
    );

    if (inventoryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    const inventory = inventoryResult.rows[0];
    const pricePerPlot = parseFloat(inventory.price);

    // If plot_ids are provided, assign specific plots
    if (plot_ids && Array.isArray(plot_ids) && plot_ids.length > 0) {
      // Validate all plots belong to this inventory and are available
      const plotCheck = await db.query(`
        SELECT id, status, plot_number
        FROM inventory_plots
        WHERE id = ANY($1::int[]) AND inventory_id = $2
      `, [plot_ids, req.params.id]);

      if (plotCheck.rows.length !== plot_ids.length) {
        return res.status(400).json({ message: 'Some plot IDs are invalid or do not belong to this inventory' });
      }

      // Check if all plots are available
      const unavailablePlots = plotCheck.rows.filter(p => p.status !== 'available');
      if (unavailablePlots.length > 0) {
        return res.status(400).json({ 
          message: `Some plots are not available: ${unavailablePlots.map(p => p.plot_number).join(', ')}` 
        });
      }

      const totalPlots = plot_ids.length;
      const totalAmount = totalPlots * pricePerPlot;
      const paidAmount = parseFloat(amount_paid || 0);

      // Create assignment record
      const assignmentResult = await db.query(`
        INSERT INTO inventory_plot_assignments (
          inventory_id, salesperson_id, assignment_date, 
          total_plots_assigned, total_amount, amount_paid, notes
        )
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
        RETURNING *
      `, [req.params.id, salesperson_id, totalPlots, totalAmount, paidAmount, notes || null]);

      // Update plots
      await db.query(`
        UPDATE inventory_plots
        SET assigned_to = $1, status = 'assigned', assigned_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
      `, [salesperson_id, plot_ids]);

      // Update inventory status if all plots are assigned
      const remainingPlots = await db.query(`
        SELECT COUNT(*) as count
        FROM inventory_plots
        WHERE inventory_id = $1 AND status = 'available'
      `, [req.params.id]);

      if (parseInt(remainingPlots.rows[0].count) === 0) {
        await db.query(`
          UPDATE inventory SET status = 'assigned'
          WHERE id = $1
        `, [req.params.id]);
      }

      res.json({
        assignment: assignmentResult.rows[0],
        plots_assigned: totalPlots,
        total_amount: totalAmount,
        amount_paid: paidAmount,
        remaining_balance: totalAmount - paidAmount
      });
    } else {
      // Legacy assignment - assign entire inventory (for backward compatibility)
      const result = await db.query(`
        UPDATE inventory 
        SET assigned_to = $1, status = 'assigned'
        WHERE id = $2
        RETURNING *
      `, [salesperson_id, req.params.id]);

      res.json(result.rows[0]);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Delete inventory (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
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

module.exports = router;

