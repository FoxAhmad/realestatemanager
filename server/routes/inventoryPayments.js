const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Get all inventory payments (Admin sees all, Salespersons see only their own)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT ip.*, i.address as inventory_address, i.category as inventory_category,
               inv.name as investor_name, u.name as salesperson_name,
               ip_plot.plot_number as plot_number
        FROM inventory_payments ip
        LEFT JOIN inventory i ON ip.inventory_id = i.id
        LEFT JOIN investors inv ON ip.investor_id = inv.id
        LEFT JOIN users u ON ip.salesperson_id = u.id
        LEFT JOIN inventory_plots ip_plot ON ip.plot_id = ip_plot.id
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `);
    } else {
      // Salespersons see only their own payments
      result = await db.query(`
        SELECT ip.*, i.address as inventory_address, i.category as inventory_category,
               inv.name as investor_name, ip_plot.plot_number as plot_number
        FROM inventory_payments ip
        LEFT JOIN inventory i ON ip.inventory_id = i.id
        LEFT JOIN investors inv ON ip.investor_id = inv.id
        LEFT JOIN inventory_plots ip_plot ON ip.plot_id = ip_plot.id
        WHERE ip.salesperson_id = $1
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get payments for a specific inventory item
router.get('/inventory/:inventoryId', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT ip.*, inv.name as investor_name, u.name as salesperson_name
        FROM inventory_payments ip
        LEFT JOIN investors inv ON ip.investor_id = inv.id
        LEFT JOIN users u ON ip.salesperson_id = u.id
        WHERE ip.inventory_id = $1
        ORDER BY ip.payment_date DESC
      `, [req.params.inventoryId]);
    } else {
      result = await db.query(`
        SELECT ip.*, inv.name as investor_name
        FROM inventory_payments ip
        LEFT JOIN investors inv ON ip.investor_id = inv.id
        WHERE ip.inventory_id = $1 AND ip.salesperson_id = $2
        ORDER BY ip.payment_date DESC
      `, [req.params.inventoryId, req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create inventory payment (supports multiple investors)
router.post('/', auth, async (req, res) => {
  try {
    const { inventory_id, plot_id, investors, payment_date, notes } = req.body;
    // investors is an array of {investor_id, amount}
    // For backward compatibility, also support single investor_id and amount
    const { investor_id, amount } = req.body;

    if (!inventory_id || !payment_date) {
      return res.status(400).json({ message: 'Inventory ID and payment date are required' });
    }

    // Handle both new format (investors array) and old format (single investor_id, amount)
    let investorPayments = [];
    if (investors && Array.isArray(investors) && investors.length > 0) {
      investorPayments = investors;
    } else if (investor_id && amount) {
      investorPayments = [{ investor_id, amount }];
    } else {
      return res.status(400).json({ message: 'Either investors array or investor_id with amount is required' });
    }

    // Validate total amount
    const totalAmount = investorPayments.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    if (totalAmount <= 0) {
      return res.status(400).json({ message: 'Total payment amount must be greater than 0' });
    }

    // Verify inventory is assigned to the salesperson (if not admin)
    if (req.user.role !== 'admin') {
      // Check if plot is assigned to salesperson, or if no plot_id, check inventory
      if (plot_id) {
        const plotCheck = await db.query(
          'SELECT * FROM inventory_plots WHERE id = $1 AND assigned_to = $2',
          [plot_id, req.user.id]
        );

        if (plotCheck.rows.length === 0) {
          return res.status(403).json({ message: 'Plot not found or not assigned to you' });
        }
      } else {
        const inventoryCheck = await db.query(
          'SELECT * FROM inventory WHERE id = $1 AND assigned_to = $2',
          [inventory_id, req.user.id]
        );

        if (inventoryCheck.rows.length === 0) {
          return res.status(403).json({ message: 'You can only add payments for inventory assigned to you' });
        }
      }
    }

    // Verify plot belongs to inventory if plot_id provided
    if (plot_id) {
      const plotCheck = await db.query(
        'SELECT * FROM inventory_plots WHERE id = $1 AND inventory_id = $2',
        [plot_id, inventory_id]
      );

      if (plotCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Plot does not belong to this inventory' });
      }
    }

    // Verify all investors belong to salesperson
    for (const invPayment of investorPayments) {
      if (req.user.role !== 'admin') {
        const investorCheck = await db.query(
          'SELECT * FROM investors WHERE id = $1 AND salesperson_id = $2',
          [invPayment.investor_id, req.user.id]
        );

        if (investorCheck.rows.length === 0) {
          return res.status(403).json({ message: `Investor ${invPayment.investor_id} not found or does not belong to you` });
        }

        // Check if investor has enough remaining balance
        // Calculate remaining balance dynamically (same as balances endpoint) to ensure accuracy
        const investor = investorCheck.rows[0];
        const totalInvested = parseFloat(investor.total_invested || 0);
        
        // Get total used from inventory payments
        const usedBalanceResult = await db.query(
          'SELECT COALESCE(SUM(amount), 0) as used_balance FROM inventory_payments WHERE investor_id = $1',
          [invPayment.investor_id]
        );
        const usedBalance = parseFloat(usedBalanceResult.rows[0].used_balance || 0);
        const remainingBalance = totalInvested - usedBalance;
        
        const paymentAmount = parseFloat(invPayment.amount || 0);
        
        if (paymentAmount > remainingBalance) {
          return res.status(400).json({ 
            message: `Investor ${investor.name} has insufficient balance. Available: $${remainingBalance.toFixed(2)}, Requested: $${paymentAmount.toFixed(2)}` 
          });
        }
      }
    }

    // Create payment records for each investor
    const createdPayments = [];
    for (const invPayment of investorPayments) {
      const result = await db.query(`
        INSERT INTO inventory_payments (inventory_id, plot_id, investor_id, salesperson_id, amount, payment_date, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        inventory_id,
        plot_id || null,
        invPayment.investor_id,
        req.user.id,
        invPayment.amount,
        payment_date,
        notes || null
      ]);

      createdPayments.push(result.rows[0]);

      // Update investor balance
      const investorResult = await db.query(
        'SELECT paid_amount, total_invested FROM investors WHERE id = $1',
        [invPayment.investor_id]
      );

      if (investorResult.rows.length > 0) {
        const currentPaidAmount = parseFloat(investorResult.rows[0].paid_amount || 0);
        const totalInvested = parseFloat(investorResult.rows[0].total_invested || 0);
        const newPaidAmount = currentPaidAmount + parseFloat(invPayment.amount);
        const remainingBalance = totalInvested - newPaidAmount;

        await db.query(`
          UPDATE investors
          SET paid_amount = $1, remaining_balance = $2
          WHERE id = $3
        `, [newPaidAmount, remainingBalance, invPayment.investor_id]);
      }
    }

    // Update plot status if plot_id provided
    if (plot_id) {
      const inventoryResult = await db.query(
        'SELECT price FROM inventory WHERE id = $1',
        [inventory_id]
      );

      if (inventoryResult.rows.length > 0) {
        const totalPaidResult = await db.query(
          'SELECT COALESCE(SUM(amount), 0) as total_paid FROM inventory_payments WHERE plot_id = $1',
          [plot_id]
        );

        const totalPaid = parseFloat(totalPaidResult.rows[0].total_paid);
        const inventoryPrice = parseFloat(inventoryResult.rows[0].price);

        if (totalPaid >= inventoryPrice) {
          await db.query(
            'UPDATE inventory_plots SET status = $1 WHERE id = $2',
            ['paid', plot_id]
          );
        }
      }
    } else {
      // Legacy: Update inventory status to 'paid' if fully paid (when no plot_id)
      const inventoryResult = await db.query(
        'SELECT price FROM inventory WHERE id = $1',
        [inventory_id]
      );

      if (inventoryResult.rows.length > 0) {
        const totalPaidResult = await db.query(
          'SELECT COALESCE(SUM(amount), 0) as total_paid FROM inventory_payments WHERE inventory_id = $1 AND plot_id IS NULL',
          [inventory_id]
        );

        const totalPaid = parseFloat(totalPaidResult.rows[0].total_paid);
        const inventoryPrice = parseFloat(inventoryResult.rows[0].price);

        if (totalPaid >= inventoryPrice) {
          await db.query(
            'UPDATE inventory SET status = $1 WHERE id = $2',
            ['paid', inventory_id]
          );
        }
      }
    }

    // Return all created payments
    res.status(201).json({
      message: 'Payments created successfully',
      payments: createdPayments,
      total_amount: totalAmount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update inventory payment
router.put('/:id', auth, async (req, res) => {
  try {
    const { amount, payment_date, notes } = req.body;

    // Check if payment exists and belongs to salesperson (if not admin)
    let paymentCheck;
    if (req.user.role === 'admin') {
      paymentCheck = await db.query(
        'SELECT * FROM inventory_payments WHERE id = $1',
        [req.params.id]
      );
    } else {
      paymentCheck = await db.query(
        'SELECT * FROM inventory_payments WHERE id = $1 AND salesperson_id = $2',
        [req.params.id, req.user.id]
      );
    }

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const result = await db.query(`
      UPDATE inventory_payments 
      SET amount = COALESCE($1, amount),
          payment_date = COALESCE($2, payment_date),
          notes = COALESCE($3, notes)
      WHERE id = $4
      RETURNING *
    `, [amount, payment_date, notes, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete inventory payment
router.delete('/:id', auth, async (req, res) => {
  try {
    // Get payment details before deletion to update investor balance
    let paymentCheck;
    if (req.user.role === 'admin') {
      paymentCheck = await db.query(
        'SELECT * FROM inventory_payments WHERE id = $1',
        [req.params.id]
      );
    } else {
      paymentCheck = await db.query(
        'SELECT * FROM inventory_payments WHERE id = $1 AND salesperson_id = $2',
        [req.params.id, req.user.id]
      );
    }

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const payment = paymentCheck.rows[0];

    // Delete payment
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        'DELETE FROM inventory_payments WHERE id = $1 RETURNING id',
        [req.params.id]
      );
    } else {
      result = await db.query(
        'DELETE FROM inventory_payments WHERE id = $1 AND salesperson_id = $2 RETURNING id',
        [req.params.id, req.user.id]
      );
    }

    // Update investor balance if payment had investor_id
    if (payment.investor_id) {
      const investorResult = await db.query(
        'SELECT paid_amount, total_invested FROM investors WHERE id = $1',
        [payment.investor_id]
      );

      if (investorResult.rows.length > 0) {
        const currentPaidAmount = parseFloat(investorResult.rows[0].paid_amount || 0);
        const totalInvested = parseFloat(investorResult.rows[0].total_invested || 0);
        const newPaidAmount = Math.max(0, currentPaidAmount - parseFloat(payment.amount));
        const remainingBalance = totalInvested - newPaidAmount;

        await db.query(`
          UPDATE investors
          SET paid_amount = $1, remaining_balance = $2
          WHERE id = $3
        `, [newPaidAmount, remainingBalance, payment.investor_id]);
      }
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get investor contributions to inventory
router.get('/inventory/:inventoryId/investors', auth, async (req, res) => {
  try {
    // Check access
    if (req.user.role !== 'admin') {
      const inventoryCheck = await db.query(
        'SELECT * FROM inventory WHERE id = $1 AND assigned_to = $2',
        [req.params.inventoryId, req.user.id]
      );

      if (inventoryCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const result = await db.query(`
      SELECT 
        inv.id as investor_id,
        inv.name as investor_name,
        ip_plot.id as plot_id,
        ip_plot.plot_number,
        COALESCE(SUM(ip.amount), 0) as total_contributed
      FROM investors inv
      INNER JOIN inventory_payments ip ON inv.id = ip.investor_id
      LEFT JOIN inventory_plots ip_plot ON ip.plot_id = ip_plot.id
      WHERE ip.inventory_id = $1
      GROUP BY inv.id, inv.name, ip_plot.id, ip_plot.plot_number
      ORDER BY inv.name, ip_plot.plot_number
    `, [req.params.inventoryId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salesperson total balance (sum of all investor contributions - used)
router.get('/salesperson/:salespersonId/balance', auth, async (req, res) => {
  try {
    const salespersonId = req.params.salespersonId;
    
    // Check access: admin can see any, salespersons can only see their own
    if (req.user.role !== 'admin' && req.user.id !== parseInt(salespersonId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get total invested from all investors
    const totalInvestedResult = await db.query(`
      SELECT COALESCE(SUM(total_invested), 0) as total_invested
      FROM investors
      WHERE salesperson_id = $1
    `, [salespersonId]);

    // Get total used (sum of all inventory payments)
    const totalUsedResult = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_used
      FROM inventory_payments
      WHERE salesperson_id = $1
    `, [salespersonId]);

    const totalInvested = parseFloat(totalInvestedResult.rows[0].total_invested || 0);
    const totalUsed = parseFloat(totalUsedResult.rows[0].total_used || 0);
    const remainingBalance = totalInvested - totalUsed;

    res.json({
      salesperson_id: parseInt(salespersonId),
      total_invested: totalInvested,
      total_used: totalUsed,
      remaining_balance: remainingBalance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get investor balances (used and remaining) for a salesperson
router.get('/salesperson/:salespersonId/investors/balances', auth, async (req, res) => {
  try {
    const salespersonId = req.params.salespersonId;
    
    // Check access: admin can see any, salespersons can only see their own
    if (req.user.role !== 'admin' && req.user.id !== parseInt(salespersonId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await db.query(`
      SELECT 
        inv.id,
        inv.name,
        inv.total_invested,
        COALESCE(SUM(ip.amount), 0) as used_balance,
        (inv.total_invested - COALESCE(SUM(ip.amount), 0)) as remaining_balance
      FROM investors inv
      LEFT JOIN inventory_payments ip ON inv.id = ip.investor_id
      WHERE inv.salesperson_id = $1
      GROUP BY inv.id, inv.name, inv.total_invested
      ORDER BY inv.name
    `, [salespersonId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get investors for a specific inventory/plot
router.get('/inventory/:inventoryId/plot/:plotId/investors', auth, async (req, res) => {
  try {
    const { inventoryId, plotId } = req.params;
    
    // Check access
    if (req.user.role !== 'admin') {
      const plotCheck = await db.query(
        'SELECT * FROM inventory_plots WHERE id = $1 AND inventory_id = $2 AND assigned_to = $3',
        [plotId, inventoryId, req.user.id]
      );

      if (plotCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const result = await db.query(`
      SELECT 
        inv.id as investor_id,
        inv.name as investor_name,
        COALESCE(SUM(ip.amount), 0) as amount_contributed
      FROM investors inv
      INNER JOIN inventory_payments ip ON inv.id = ip.investor_id
      WHERE ip.inventory_id = $1 AND ip.plot_id = $2
      GROUP BY inv.id, inv.name
      ORDER BY inv.name
    `, [inventoryId, plotId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

