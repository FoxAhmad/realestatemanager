const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all inventory requests (Admin sees all, Salespersons see only their own)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT ir.*, i.category, i.address as inventory_address, i.price as inventory_price,
               u.name as salesperson_name, u.email as salesperson_email,
               COALESCE(
                 (SELECT json_agg(json_build_object('id', ip.id, 'plot_number', ip.plot_number))
                  FROM inventory_plots ip
                  WHERE ip.id = ANY(ir.requested_plot_ids)),
                 '[]'::json
               ) as requested_plots
        FROM inventory_requests ir
        LEFT JOIN inventory i ON ir.inventory_id = i.id
        LEFT JOIN users u ON ir.salesperson_id = u.id
        ORDER BY ir.created_at DESC
      `);
    } else {
      // Salespersons see only their own requests
      result = await db.query(`
        SELECT ir.*, i.category, i.address as inventory_address, i.price as inventory_price,
               COALESCE(
                 (SELECT json_agg(json_build_object('id', ip.id, 'plot_number', ip.plot_number))
                  FROM inventory_plots ip
                  WHERE ip.id = ANY(ir.requested_plot_ids)),
                 '[]'::json
               ) as requested_plots
        FROM inventory_requests ir
        LEFT JOIN inventory i ON ir.inventory_id = i.id
        WHERE ir.salesperson_id = $1
        ORDER BY ir.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get request by ID
router.get('/:id', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT ir.*, i.category, i.address as inventory_address, i.price as inventory_price,
               u.name as salesperson_name, u.email as salesperson_email
        FROM inventory_requests ir
        LEFT JOIN inventory i ON ir.inventory_id = i.id
        LEFT JOIN users u ON ir.salesperson_id = u.id
        WHERE ir.id = $1
      `, [req.params.id]);
    } else {
      result = await db.query(`
        SELECT ir.*, i.category, i.address as inventory_address, i.price as inventory_price
        FROM inventory_requests ir
        LEFT JOIN inventory i ON ir.inventory_id = i.id
        WHERE ir.id = $1 AND ir.salesperson_id = $2
      `, [req.params.id, req.user.id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create inventory request (Salesperson only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dealer') {
      return res.status(403).json({ message: 'Only salespersons can request inventory' });
    }

    const { inventory_id, plot_ids } = req.body;

    if (!inventory_id) {
      return res.status(400).json({ message: 'Inventory ID is required' });
    }

    // Check if inventory is available
    const inventoryCheck = await db.query(
      'SELECT * FROM inventory WHERE id = $1 AND status = $2',
      [inventory_id, 'available']
    );

    if (inventoryCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Inventory is not available for assignment' });
    }

    // If plot_ids provided, validate them
    if (plot_ids && Array.isArray(plot_ids) && plot_ids.length > 0) {
      // Check if all plots belong to this inventory and are available
      const plotCheck = await db.query(`
        SELECT id, status, plot_number
        FROM inventory_plots
        WHERE id = ANY($1::int[]) AND inventory_id = $2
      `, [plot_ids, inventory_id]);

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

      // Check if there's already a pending request for any of these plots
      const existingPlotRequest = await db.query(
        `SELECT ir.* FROM inventory_requests ir
         WHERE ir.inventory_id = $1 AND ir.salesperson_id = $2 AND ir.status = $3
         AND ir.requested_plot_ids && $4::int[]`,
        [inventory_id, req.user.id, 'pending', plot_ids]
      );

      if (existingPlotRequest.rows.length > 0) {
        return res.status(400).json({ message: 'You already have a pending request for some of these plots' });
      }
    } else {
      // Check if there's already a pending request for this inventory by this salesperson
      const existingRequest = await db.query(
        'SELECT * FROM inventory_requests WHERE inventory_id = $1 AND salesperson_id = $2 AND status = $3',
        [inventory_id, req.user.id, 'pending']
      );

      if (existingRequest.rows.length > 0) {
        return res.status(400).json({ message: 'You already have a pending request for this inventory' });
      }
    }

    const result = await db.query(`
      INSERT INTO inventory_requests (inventory_id, salesperson_id, status, requested_plot_ids)
      VALUES ($1, $2, 'pending', $3)
      RETURNING *
    `, [inventory_id, req.user.id, plot_ids && plot_ids.length > 0 ? plot_ids : null]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Approve inventory request (Admin only)
router.post('/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const { admin_notes } = req.body;

    // Get the request
    const requestResult = await db.query(
      'SELECT * FROM inventory_requests WHERE id = $1',
      [req.params.id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    // Check if inventory is still available
    const inventoryCheck = await db.query(
      'SELECT * FROM inventory WHERE id = $1 AND status = $2',
      [request.inventory_id, 'available']
    );

    if (inventoryCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Inventory is no longer available' });
    }

    // Update request status
    await db.query(
      'UPDATE inventory_requests SET status = $1, admin_notes = $2 WHERE id = $3',
      ['approved', admin_notes || null, req.params.id]
    );

    // If plot_ids were requested, assign those specific plots
    if (request.requested_plot_ids && request.requested_plot_ids.length > 0) {
      const plotIds = request.requested_plot_ids;
      const inventory = inventoryCheck.rows[0];
      const pricePerPlot = parseFloat(inventory.price);
      const totalPlots = plotIds.length;
      const totalAmount = totalPlots * pricePerPlot;

      // Create assignment record
      await db.query(`
        INSERT INTO inventory_plot_assignments (
          inventory_id, salesperson_id, assignment_date, 
          total_plots_assigned, total_amount, amount_paid
        )
        VALUES ($1, $2, CURRENT_DATE, $3, $4, 0)
      `, [request.inventory_id, request.salesperson_id, totalPlots, totalAmount]);

      // Update plots
      await db.query(`
        UPDATE inventory_plots
        SET assigned_to = $1, status = 'assigned', assigned_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
      `, [request.salesperson_id, plotIds]);

      // Update inventory status if all plots are assigned
      const remainingPlots = await db.query(`
        SELECT COUNT(*) as count
        FROM inventory_plots
        WHERE inventory_id = $1 AND status = 'available'
      `, [request.inventory_id]);

      if (parseInt(remainingPlots.rows[0].count) === 0) {
        await db.query(`
          UPDATE inventory SET status = 'assigned'
          WHERE id = $1
        `, [request.inventory_id]);
      }
    } else {
      // Legacy: Assign entire inventory
      await db.query(
        'UPDATE inventory SET assigned_to = $1, status = $2 WHERE id = $3',
        [request.salesperson_id, 'assigned', request.inventory_id]
      );
    }

    // Reject all other pending requests for the same inventory (or same plots)
    if (request.requested_plot_ids && request.requested_plot_ids.length > 0) {
      await db.query(
        `UPDATE inventory_requests 
         SET status = $1 
         WHERE inventory_id = $2 AND id != $3 AND status = $4
         AND (requested_plot_ids && $5::int[] OR requested_plot_ids IS NULL)`,
        ['rejected', request.inventory_id, req.params.id, 'pending', request.requested_plot_ids]
      );
    } else {
      await db.query(
        'UPDATE inventory_requests SET status = $1 WHERE inventory_id = $2 AND id != $3 AND status = $4',
        ['rejected', request.inventory_id, req.params.id, 'pending']
      );
    }

    res.json({ message: 'Request approved and inventory assigned successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reject inventory request (Admin only)
router.post('/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const { admin_notes } = req.body;

    const requestResult = await db.query(
      'SELECT * FROM inventory_requests WHERE id = $1',
      [req.params.id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (requestResult.rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    await db.query(
      'UPDATE inventory_requests SET status = $1, admin_notes = $2 WHERE id = $3',
      ['rejected', admin_notes || null, req.params.id]
    );

    res.json({ message: 'Request rejected successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete request (Salesperson can delete their own pending requests)
router.delete('/:id', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        'DELETE FROM inventory_requests WHERE id = $1 RETURNING id',
        [req.params.id]
      );
    } else {
      result = await db.query(
        'DELETE FROM inventory_requests WHERE id = $1 AND salesperson_id = $2 AND status = $3 RETURNING id',
        [req.params.id, req.user.id, 'pending']
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found or cannot be deleted' });
    }

    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

