const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all deals
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT d.*, c.name as customer_name, c.phone_number as customer_phone, 
               u.name as dealer_name, i.address as inventory_address, i.category as inventory_category
        FROM deals d 
        LEFT JOIN customers c ON d.customer_id = c.id 
        LEFT JOIN users u ON d.dealer_id = u.id 
        LEFT JOIN inventory i ON d.inventory_id = i.id
        ORDER BY d.created_at DESC
      `);
    } else {
      // Salespersons see only their own deals
      result = await db.query(`
        SELECT d.*, c.name as customer_name, c.phone_number as customer_phone, 
               u.name as dealer_name, i.address as inventory_address, i.category as inventory_category
        FROM deals d 
        LEFT JOIN customers c ON d.customer_id = c.id 
        LEFT JOIN users u ON d.dealer_id = u.id 
        LEFT JOIN inventory i ON d.inventory_id = i.id
        WHERE d.dealer_id = $1 
        ORDER BY d.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get plots for a deal
router.get('/:id/plots', auth, async (req, res) => {
  try {
    // Check if user has access to this deal
    let dealCheck;
    if (req.user.role === 'admin') {
      dealCheck = await db.query('SELECT id FROM deals WHERE id = $1', [req.params.id]);
    } else {
      dealCheck = await db.query('SELECT id FROM deals WHERE id = $1 AND dealer_id = $2', [req.params.id, req.user.id]);
    }

    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    const result = await db.query(`
      SELECT ip.*, i.address as inventory_address, i.category as inventory_category
      FROM deal_plots dp
      INNER JOIN inventory_plots ip ON dp.plot_id = ip.id
      INNER JOIN inventory i ON ip.inventory_id = i.id
      WHERE dp.deal_id = $1
      ORDER BY ip.plot_number ASC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get deal by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
       `SELECT d.*, c.name as customer_name, c.cnic, c.phone_number as customer_phone, 
              c.address as customer_address, u.name as dealer_name, u.id as dealer_id 
       FROM deals d 
       LEFT JOIN customers c ON d.customer_id = c.id 
       LEFT JOIN users u ON d.dealer_id = u.id 
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    // Get payments for this deal
    const paymentsResult = await db.query(
      'SELECT * FROM payments WHERE deal_id = $1 ORDER BY payment_date DESC',
      [req.params.id]
    );

    // Get agreement for this deal
    const agreementsResult = await db.query(
      'SELECT * FROM agreements WHERE deal_id = $1',
      [req.params.id]
    );

    // Get plots for this deal
    const plotsResult = await db.query(`
      SELECT ip.*, i.address as inventory_address, i.category as inventory_category
      FROM deal_plots dp
      INNER JOIN inventory_plots ip ON dp.plot_id = ip.id
      INNER JOIN inventory i ON ip.inventory_id = i.id
      WHERE dp.deal_id = $1
      ORDER BY ip.plot_number ASC
    `, [req.params.id]);

    res.json({
      ...result.rows[0],
      payments: paymentsResult.rows,
      agreement: agreementsResult.rows[0] || null,
      plots: plotsResult.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create deal
router.post('/', auth, async (req, res) => {
  try {
    const {
      customer_id,
      inventory_id, // For backward compatibility
      inventory_ids, // New: array of inventory IDs
      inventory_quantity_used,
      plot_ids,
      property_type,
      original_price,
      sale_price,
      demand_price,
      plot_info,
      house_address,
      house_info,
      sale_price_location
    } = req.body;

    if (!property_type) {
      return res.status(400).json({ message: 'Property type is required' });
    }

    let quantityToUse = 1;
    let selectedPlotIds = [];
    let inventoryIdsToProcess = [];

    // Only support single inventory_id (multiple selection removed)
    if (inventory_id) {
      inventoryIdsToProcess = [inventory_id];
    } else if (inventory_ids && Array.isArray(inventory_ids) && inventory_ids.length > 0) {
      // Legacy support: if inventory_ids is sent, use only the first one
      inventoryIdsToProcess = [inventory_ids[0]];
    }

    // Validate inventory assignment and quantity if inventory is provided
    if (inventoryIdsToProcess.length > 0) {
      // Validate all inventory items exist
      const inventoryCheck = await db.query(
        'SELECT * FROM inventory WHERE id = ANY($1::int[])',
        [inventoryIdsToProcess]
      );

      if (inventoryCheck.rows.length !== inventoryIdsToProcess.length) {
        return res.status(404).json({ message: 'Some inventory items not found' });
      }

      // Use first inventory for backward compatibility in deal record
      const primaryInventory = inventoryCheck.rows[0];

      // If plot_ids are provided, validate and use them
      if (plot_ids && Array.isArray(plot_ids) && plot_ids.length > 0) {
        // Validate all plots belong to one of the selected inventories
        const plotCheck = await db.query(`
          SELECT ip.*, ip.assigned_to as plot_assigned_to, ip.inventory_id
          FROM inventory_plots ip
          WHERE ip.id = ANY($1::int[]) AND ip.inventory_id = ANY($2::int[])
        `, [plot_ids, inventoryIdsToProcess]);

        if (plotCheck.rows.length !== plot_ids.length) {
          return res.status(400).json({ message: 'Some plot IDs are invalid or do not belong to the selected inventories' });
        }

        // Check assignment rules for plots
        if (req.user.role === 'dealer') {
          // Salespersons can only use plots assigned to them
          const unassignedPlots = plotCheck.rows.filter(p => !p.plot_assigned_to || p.plot_assigned_to !== req.user.id);
          if (unassignedPlots.length > 0) {
            return res.status(403).json({ 
              message: 'You can only use plots assigned to you' 
            });
          }
        } else {
          // Admin can use unassigned plots or any plots
          // No restriction for admin
        }

        // Check plot status - should be assigned or paid
        const unavailablePlots = plotCheck.rows.filter(p => !['assigned', 'paid'].includes(p.status));
        if (unavailablePlots.length > 0) {
          return res.status(400).json({ 
            message: `Some plots are not available for use in deals: ${unavailablePlots.map(p => p.plot_number).join(', ')}` 
          });
        }

        selectedPlotIds = plot_ids;
        quantityToUse = plot_ids.length;
      } else {
        // Legacy mode: When no plot_ids provided, use first inventory only
        // Check assignment rules for primary inventory
        if (req.user.role === 'dealer') {
          // Salespersons can only use inventory assigned to them
          if (!primaryInventory.assigned_to || primaryInventory.assigned_to !== req.user.id) {
            return res.status(403).json({ 
              message: 'You can only create deals for inventory assigned to you' 
            });
          }
        } else {
          // Admin can only use unassigned inventory
          if (primaryInventory.assigned_to) {
            return res.status(403).json({ 
              message: 'Admin can only create deals for unassigned inventory' 
            });
          }
        }

        // Check quantity availability (legacy mode - uses first inventory only)
        quantityToUse = parseInt(inventory_quantity_used || 1);
        if (quantityToUse < 1) {
          return res.status(400).json({ message: 'Quantity used must be at least 1' });
        }

        // Calculate how many units are already used in other deals
        const usedQuantityResult = await db.query(
          `SELECT COALESCE(SUM(inventory_quantity_used), 0) as total_used 
           FROM deals 
           WHERE inventory_id = $1 AND status != 'deal_not_done'`,
          [primaryInventory.id]
        );

        const totalUsed = parseInt(usedQuantityResult.rows[0].total_used || 0);
        const availableQuantity = primaryInventory.quantity - totalUsed;

        if (quantityToUse > availableQuantity) {
          return res.status(400).json({ 
            message: `Insufficient inventory quantity. Available: ${availableQuantity}, Requested: ${quantityToUse}` 
          });
        }
      }
    }

    // Convert empty strings to null for numeric fields
    const parseNumeric = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };

    const parsedOriginalPrice = parseNumeric(original_price);
    const parsedSalePrice = parseNumeric(sale_price);
    const parsedDemandPrice = parseNumeric(demand_price);

    // Calculate profit
    let profit = null;
    let profit_percentage = null;
    if (parsedOriginalPrice && parsedSalePrice) {
      profit = parsedSalePrice - parsedOriginalPrice;
      profit_percentage = ((profit / parsedOriginalPrice) * 100).toFixed(2);
    }

    // Use first inventory_id for backward compatibility (deal.inventory_id is single value)
    const dealInventoryId = inventoryIdsToProcess.length > 0 ? inventoryIdsToProcess[0] : (inventory_id || null);

    const result = await db.query(
      `INSERT INTO deals (
        customer_id, dealer_id, inventory_id, inventory_quantity_used, property_type, original_price, sale_price, 
        profit, profit_percentage, demand_price, plot_info, house_address, 
        house_info, sale_price_location, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'in_progress')
      RETURNING id`,
      [
        customer_id || null,
        req.user.role === 'dealer' ? req.user.id : (req.body.dealer_id || req.user.id),
        dealInventoryId,
        dealInventoryId ? quantityToUse : null,
        property_type,
        parsedOriginalPrice,
        parsedSalePrice,
        profit,
        profit_percentage,
        parsedDemandPrice,
        plot_info || null,
        house_address || null,
        house_info || null,
        sale_price_location || null
      ]
    );

    const dealId = result.rows[0].id;

    // Create deal_plots records if plot_ids provided
    if (selectedPlotIds.length > 0) {
      for (const plotId of selectedPlotIds) {
        await db.query(`
          INSERT INTO deal_plots (deal_id, plot_id)
          VALUES ($1, $2)
        `, [dealId, plotId]);

        // Update plot status to 'used_in_deal'
        await db.query(`
          UPDATE inventory_plots
          SET status = 'used_in_deal'
          WHERE id = $1
        `, [plotId]);
      }
    }

    const dealResult = await db.query(
      `SELECT d.*, c.name as customer_name, u.name as dealer_name, 
              i.address as inventory_address, i.category as inventory_category
       FROM deals d 
       LEFT JOIN customers c ON d.customer_id = c.id 
       LEFT JOIN users u ON d.dealer_id = u.id 
       LEFT JOIN inventory i ON d.inventory_id = i.id
       WHERE d.id = $1`,
      [dealId]
    );

    res.status(201).json(dealResult.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update deal (Admin only for edit/delete permissions)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    // First, get the current deal to preserve existing values
    const currentDealResult = await db.query(
      'SELECT * FROM deals WHERE id = $1',
      [req.params.id]
    );

    if (currentDealResult.rows.length === 0) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    const currentDeal = currentDealResult.rows[0];

    const {
      customer_id,
      inventory_id,
      property_type,
      status,
      original_price,
      sale_price,
      demand_price,
      difference_amount,
      remaining_price,
      remaining_price_time,
      plot_info,
      house_address,
      house_info,
      sale_price_location,
      is_build,
      admin_cash
    } = req.body;

    // Convert empty strings to null for numeric fields
    const parseNumeric = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };

    const parsedOriginalPrice = parseNumeric(original_price);
    const parsedSalePrice = parseNumeric(sale_price);
    const parsedDemandPrice = parseNumeric(demand_price);
    const parsedDifferenceAmount = parseNumeric(difference_amount);
    const parsedRemainingPrice = parseNumeric(remaining_price);

    // Use provided values or keep existing ones (for required fields)
    const finalPropertyType = property_type || currentDeal.property_type;
    const finalStatus = status || currentDeal.status;

    // Calculate profit
    let profit = null;
    let profit_percentage = null;
    if (parsedOriginalPrice && parsedSalePrice) {
      profit = parsedSalePrice - parsedOriginalPrice;
      profit_percentage = ((profit / parsedOriginalPrice) * 100).toFixed(2);
    } else if (currentDeal.original_price && currentDeal.sale_price) {
      // Recalculate profit if prices exist in current deal
      profit = parseFloat(currentDeal.sale_price) - parseFloat(currentDeal.original_price);
      profit_percentage = ((profit / parseFloat(currentDeal.original_price)) * 100).toFixed(2);
    }

    await db.query(
      `UPDATE deals SET 
        customer_id = $1, inventory_id = $2, property_type = $3, status = $4, original_price = $5, 
        sale_price = $6, profit = $7, profit_percentage = $8, demand_price = $9, 
        difference_amount = $10, remaining_price = $11, remaining_price_time = $12, 
        plot_info = $13, house_address = $14, house_info = $15, sale_price_location = $16, 
        is_build = $17, admin_cash = $18
       WHERE id = $19`,
      [
        customer_id !== undefined ? (customer_id || null) : currentDeal.customer_id,
        inventory_id !== undefined ? (inventory_id || null) : currentDeal.inventory_id,
        finalPropertyType,
        finalStatus,
        parsedOriginalPrice !== null ? parsedOriginalPrice : currentDeal.original_price,
        parsedSalePrice !== null ? parsedSalePrice : currentDeal.sale_price,
        profit !== null ? profit : currentDeal.profit,
        profit_percentage !== null ? profit_percentage : currentDeal.profit_percentage,
        parsedDemandPrice !== null ? parsedDemandPrice : currentDeal.demand_price,
        parsedDifferenceAmount !== null ? parsedDifferenceAmount : currentDeal.difference_amount,
        parsedRemainingPrice !== null ? parsedRemainingPrice : currentDeal.remaining_price,
        remaining_price_time !== undefined ? (remaining_price_time || null) : currentDeal.remaining_price_time,
        plot_info !== undefined ? (plot_info || null) : currentDeal.plot_info,
        house_address !== undefined ? (house_address || null) : currentDeal.house_address,
        house_info !== undefined ? (house_info || null) : currentDeal.house_info,
        sale_price_location !== undefined ? (sale_price_location || null) : currentDeal.sale_price_location,
        is_build !== undefined ? is_build : currentDeal.is_build,
        admin_cash !== undefined ? admin_cash : currentDeal.admin_cash,
        req.params.id
      ]
    );

    const dealResult = await db.query(
      `SELECT d.*, c.name as customer_name, u.name as dealer_name, 
              i.address as inventory_address, i.category as inventory_category
       FROM deals d 
       LEFT JOIN customers c ON d.customer_id = c.id 
       LEFT JOIN users u ON d.dealer_id = u.id 
       LEFT JOIN inventory i ON d.inventory_id = i.id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (dealResult.rows.length === 0) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    res.json(dealResult.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete deal (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM deals WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deal deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
