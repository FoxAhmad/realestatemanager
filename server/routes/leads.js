const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all leads (Admin sees all, Salesperson sees only assigned)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT l.*, 
               u.name as assigned_to_name,
               (SELECT update_date FROM lead_status_updates 
                WHERE lead_id = l.id 
                ORDER BY update_date DESC, created_at DESC 
                LIMIT 1) as latest_status_update_date
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        ORDER BY l.created_at DESC
      `);
    } else {
      // Salespersons see only assigned leads
      result = await db.query(`
        SELECT l.*, 
               u.name as assigned_to_name,
               (SELECT update_date FROM lead_status_updates 
                WHERE lead_id = l.id 
                ORDER BY update_date DESC, created_at DESC 
                LIMIT 1) as latest_status_update_date
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.assigned_to = $1
        ORDER BY l.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get lead by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT l.*, 
             u.name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Salespersons can only view their assigned leads
    if (req.user.role === 'dealer' && result.rows[0].assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view your assigned leads.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upload Excel/CSV file and import leads (Admin only)
router.post('/upload', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let data = [];
    const fileName = req.file.originalname.toLowerCase();
    const isCSV = fileName.endsWith('.csv');

    // Parse file (Excel or CSV)
    if (isCSV) {
      // Parse CSV file
      const csvString = req.file.buffer.toString('utf-8');
      const workbook = xlsx.read(csvString, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(worksheet);
    } else {
      // Parse Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(worksheet);
    }

    if (data.length === 0) {
      return res.status(400).json({ message: 'File is empty' });
    }

    let importedCount = 0;
    let skippedCount = 0;

    // Process each row
    for (const row of data) {
      try {
        // Map Excel columns (adjust based on actual Meta Ads export format)
        const name = row['Name'] || row['name'] || row['Full Name'] || '';
        const email = row['Email'] || row['email'] || row['Email Address'] || null;
        const phone = row['Phone'] || row['phone'] || row['Phone Number'] || row['Mobile'] || null;
        const campaign = row['Campaign Name'] || row['campaign_name'] || row['Campaign'] || null;
        const leadDate = row['Date'] || row['date'] || row['Lead Date'] || row['Created Time'] || null;

        if (!name) {
          skippedCount++;
          continue;
        }

        // Parse date
        let parsedDate = null;
        if (leadDate) {
          try {
            if (typeof leadDate === 'number') {
              // Excel date serial number - convert to JavaScript date
              // Excel epoch is January 1, 1900, JS epoch is January 1, 1970
              const excelEpoch = new Date(1899, 11, 30);
              const jsDate = new Date(excelEpoch.getTime() + leadDate * 86400000);
              if (!isNaN(jsDate.getTime())) {
                parsedDate = jsDate;
              }
            } else if (typeof leadDate === 'string') {
              const dateObj = new Date(leadDate);
              if (!isNaN(dateObj.getTime())) {
                parsedDate = dateObj;
              }
            } else if (leadDate instanceof Date) {
              parsedDate = leadDate;
            }
          } catch (error) {
            // Invalid date, keep as null
            parsedDate = null;
          }
        }

        // Check for duplicates (by email or phone)
        let duplicateCheck = null;
        if (email) {
          duplicateCheck = await db.query('SELECT id FROM leads WHERE email = $1', [email]);
        }
        if (!duplicateCheck || duplicateCheck.rows.length === 0) {
          if (phone) {
            duplicateCheck = await db.query('SELECT id FROM leads WHERE phone_number = $1', [phone]);
          }
        }

        if (duplicateCheck && duplicateCheck.rows.length > 0) {
          skippedCount++;
          continue;
        }

        // Insert lead
        await db.query(`
          INSERT INTO leads (name, email, phone_number, campaign_name, lead_date, status)
          VALUES ($1, $2, $3, $4, $5, 'new')
        `, [name, email, phone, campaign, parsedDate]);

        importedCount++;
      } catch (error) {
        console.error('Error importing row:', error);
        skippedCount++;
      }
    }

    res.json({
      message: 'Leads imported successfully',
      imported: importedCount,
      skipped: skippedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Assign lead to salesperson (Admin only)
router.post('/:id/assign', auth, adminOnly, async (req, res) => {
  try {
    const { salesperson_id } = req.body;

    if (!salesperson_id) {
      return res.status(400).json({ message: 'Salesperson ID is required' });
    }

    // Check if lead exists
    const leadCheck = await db.query('SELECT id, status FROM leads WHERE id = $1', [req.params.id]);
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Check if salesperson exists and is a dealer
    const salespersonCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND role = $2',
      [salesperson_id, 'dealer']
    );
    if (salespersonCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    // Update lead
    const result = await db.query(`
      UPDATE leads 
      SET assigned_to = $1, 
          assigned_at = CURRENT_TIMESTAMP,
          status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
      WHERE id = $2
      RETURNING *
    `, [salesperson_id, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Auto-assign unassigned leads to all salespersons equally (Admin only)
router.post('/auto-assign', auth, adminOnly, async (req, res) => {
  try {
    // Get all unassigned leads
    const unassignedLeads = await db.query(
      "SELECT id FROM leads WHERE assigned_to IS NULL AND status != 'successful' AND status != 'unsuccessful'"
    );

    if (unassignedLeads.rows.length === 0) {
      return res.json({ message: 'No unassigned leads to assign', assigned: 0 });
    }

    // Get all salespersons
    const salespersons = await db.query(
      "SELECT id FROM users WHERE role = 'dealer' ORDER BY id"
    );

    if (salespersons.rows.length === 0) {
      return res.status(400).json({ message: 'No salespersons found' });
    }

    // Distribute leads using round-robin
    let assignedCount = 0;
    for (let i = 0; i < unassignedLeads.rows.length; i++) {
      const leadId = unassignedLeads.rows[i].id;
      const salespersonIndex = i % salespersons.rows.length;
      const salespersonId = salespersons.rows[salespersonIndex].id;

      await db.query(`
        UPDATE leads 
        SET assigned_to = $1, 
            assigned_at = CURRENT_TIMESTAMP,
            status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
        WHERE id = $2
      `, [salespersonId, leadId]);

      assignedCount++;
    }

    res.json({
      message: 'Leads assigned successfully',
      assigned: assignedCount,
      salespersons: salespersons.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update lead status (Admin & Salesperson - only for assigned leads)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['new', 'contacted', 'on_hold', 'successful', 'unsuccessful'].includes(status)) {
      return res.status(400).json({ message: 'Valid status is required' });
    }

    // Check if lead exists and user has permission
    const leadCheck = await db.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leadCheck.rows[0];

    // Salespersons can only update their assigned leads
    if (req.user.role === 'dealer' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only update your assigned leads.' });
    }

    // If status is successful or unsuccessful, create customer record
    let customerId = null;
    if ((status === 'successful' || status === 'unsuccessful') && !lead.converted_to_customer_id) {
      // Create customer from lead
      const customerResult = await db.query(`
        INSERT INTO customers (name, phone_number, email, address, status, source, created_by)
        VALUES ($1, $2, $3, $4, $5, 'lead_conversion', $6)
        RETURNING id
      `, [
        lead.name,
        lead.phone_number,
        lead.email,
        lead.campaign_name || null, // Store campaign in address field
        status === 'successful' ? 'successful' : 'unsuccessful',
        req.user.id
      ]);

      customerId = customerResult.rows[0].id;
    }

    // Update lead status
    const result = await db.query(`
      UPDATE leads 
      SET status = $1,
          converted_to_customer_id = COALESCE($2, converted_to_customer_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [status, customerId, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create daily status update (Admin & Salesperson)
router.post('/:id/status-update', auth, async (req, res) => {
  try {
    const { update_date, activity_type, description } = req.body;

    if (!update_date || !activity_type || !description) {
      return res.status(400).json({ message: 'Update date, activity type, and description are required' });
    }

    if (!['called', 'messaged'].includes(activity_type)) {
      return res.status(400).json({ message: 'Activity type must be "called" or "messaged"' });
    }

    // Check if lead exists and user has permission
    const leadCheck = await db.query('SELECT assigned_to FROM leads WHERE id = $1', [req.params.id]);
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leadCheck.rows[0];

    // Salespersons can only update their assigned leads
    if (req.user.role === 'dealer' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only update your assigned leads.' });
    }

    // Create status update
    const result = await db.query(`
      INSERT INTO lead_status_updates (lead_id, updated_by, update_date, activity_type, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.params.id, req.user.id, update_date, activity_type, description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get status update history for a lead
router.get('/:id/status-updates', auth, async (req, res) => {
  try {
    // Check if lead exists and user has permission
    const leadCheck = await db.query('SELECT assigned_to FROM leads WHERE id = $1', [req.params.id]);
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leadCheck.rows[0];

    // Salespersons can only view their assigned leads
    if (req.user.role === 'dealer' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view your assigned leads.' });
    }

    const result = await db.query(`
      SELECT lsu.*, u.name as updated_by_name
      FROM lead_status_updates lsu
      LEFT JOIN users u ON lsu.updated_by = u.id
      WHERE lsu.lead_id = $1
      ORDER BY lsu.update_date DESC, lsu.created_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get lead statistics (Admin sees all, Salesperson sees only assigned)
router.get('/stats/summary', auth, async (req, res) => {
  try {
    let result;
    
    if (req.user.role === 'admin') {
      // Admin sees all leads statistics
      result = await db.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as monthly_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold_leads,
          COUNT(CASE WHEN status = 'successful' THEN 1 END) as successful_leads,
          COUNT(CASE WHEN status = 'unsuccessful' THEN 1 END) as unsuccessful_leads,
          COUNT(CASE WHEN assigned_to IS NULL THEN 1 END) as unassigned_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'new' THEN 1 END) as today_new_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'new' THEN 1 END) as monthly_new_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'successful' THEN 1 END) as today_successful_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'successful' THEN 1 END) as monthly_successful_leads
        FROM leads
      `);
    } else {
      // Salespersons see only their assigned leads statistics
      result = await db.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as monthly_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold_leads,
          COUNT(CASE WHEN status = 'successful' THEN 1 END) as successful_leads,
          COUNT(CASE WHEN status = 'unsuccessful' THEN 1 END) as unsuccessful_leads,
          COUNT(CASE WHEN assigned_to IS NULL THEN 1 END) as unassigned_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'new' THEN 1 END) as today_new_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'new' THEN 1 END) as monthly_new_leads,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'successful' THEN 1 END) as today_successful_leads,
          COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'successful' THEN 1 END) as monthly_successful_leads
        FROM leads
        WHERE assigned_to = $1
      `, [req.user.id]);
    }

    // Get today's status updates count
    const statusUpdatesResult = await db.query(`
      SELECT COUNT(*) as today_status_updates
      FROM lead_status_updates lsu
      INNER JOIN leads l ON lsu.lead_id = l.id
      WHERE DATE(lsu.update_date) = CURRENT_DATE
      ${req.user.role === 'dealer' ? 'AND l.assigned_to = $1' : ''}
    `, req.user.role === 'dealer' ? [req.user.id] : []);

    // Get monthly status updates count
    const monthlyStatusUpdatesResult = await db.query(`
      SELECT COUNT(*) as monthly_status_updates
      FROM lead_status_updates lsu
      INNER JOIN leads l ON lsu.lead_id = l.id
      WHERE DATE_TRUNC('month', lsu.update_date) = DATE_TRUNC('month', CURRENT_DATE)
      ${req.user.role === 'dealer' ? 'AND l.assigned_to = $1' : ''}
    `, req.user.role === 'dealer' ? [req.user.id] : []);

    const stats = result.rows[0];
    stats.today_status_updates = parseInt(statusUpdatesResult.rows[0].today_status_updates || 0);
    stats.monthly_status_updates = parseInt(monthlyStatusUpdatesResult.rows[0].monthly_status_updates || 0);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

