const db = require('./database');
const bcrypt = require('bcryptjs');

const initDatabase = async () => {
  try {
    // Create Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'dealer' CHECK (role IN ('admin', 'dealer')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Customers table
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        cnic VARCHAR(20) UNIQUE,
        phone_number VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        status VARCHAR(20) DEFAULT 'potential' CHECK (status IN ('potential', 'successful', 'unsuccessful')),
        source VARCHAR(20) DEFAULT 'walk_in' CHECK (source IN ('walk_in', 'lead_conversion')),
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add email column if it doesn't exist (for existing databases)
    try {
      await db.query(`
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS email VARCHAR(255)
      `);
    } catch (error) {
      if (error.code !== '42701') {
        console.log('Note: email column may already exist or error:', error.message);
      }
    }

    // Create Deals table
    await db.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        dealer_id INTEGER NOT NULL,
        inventory_id INTEGER,
        inventory_quantity_used INTEGER DEFAULT 1,
        property_type VARCHAR(20) NOT NULL CHECK (property_type IN ('house', 'plot', 'shop_office')),
        status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'deal_done', 'deal_not_done')),
        original_price DECIMAL(15, 2),
        sale_price DECIMAL(15, 2),
        profit DECIMAL(15, 2),
        profit_percentage DECIMAL(5, 2),
        demand_price DECIMAL(15, 2),
        difference_amount DECIMAL(15, 2),
        remaining_price DECIMAL(15, 2),
        remaining_price_time DATE,
        plot_info TEXT,
        house_address TEXT,
        house_info TEXT,
        sale_price_location TEXT,
        is_build BOOLEAN DEFAULT FALSE,
        admin_cash BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
      )
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_dealer ON deals(dealer_id)
    `);

    // Create Agreements table
    await db.query(`
      CREATE TABLE IF NOT EXISTS agreements (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        customer_id VARCHAR(50),
        phone_number VARCHAR(20),
        slip_pic VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      )
    `);

    // Create Payments table
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('down_payment', 'installment')),
        amount DECIMAL(15, 2) NOT NULL,
        payment_date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for payments
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_deal ON payments(deal_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)
    `);

    // Create Inventory table
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        category VARCHAR(20) NOT NULL CHECK (category IN ('plot', 'house', 'shop_office')),
        address TEXT NOT NULL,
        price DECIMAL(15, 2) NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'paid', 'sold')),
        assigned_to INTEGER,
        plot_numbers_input TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add plot_numbers_input column if it doesn't exist (for existing databases)
    try {
      await db.query(`
        ALTER TABLE inventory 
        ADD COLUMN IF NOT EXISTS plot_numbers_input TEXT
      `);
    } catch (error) {
      // Column might already exist, ignore error
      if (error.code !== '42701') {
        console.log('Note: plot_numbers_input column already exists or error:', error.message);
      }
    }

    // Create Inventory Plots table (tracks individual plots/units)
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_plots (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        plot_number VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'paid', 'sold', 'used_in_deal')),
        assigned_to INTEGER,
        assigned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(inventory_id, plot_number)
      )
    `);

    // Create Inventory Plot Assignments table (tracks assignments with payment details)
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_plot_assignments (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        salesperson_id INTEGER NOT NULL,
        assignment_date DATE NOT NULL,
        total_plots_assigned INTEGER NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        amount_paid DECIMAL(15, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create Deal Plots table (tracks which plots are used in deals)
    await db.query(`
      CREATE TABLE IF NOT EXISTS deal_plots (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        plot_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE CASCADE,
        UNIQUE(deal_id, plot_id)
      )
    `);

    // Create Investors table (private to salespersons)
    await db.query(`
      CREATE TABLE IF NOT EXISTS investors (
        id SERIAL PRIMARY KEY,
        salesperson_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        total_invested DECIMAL(15, 2) DEFAULT 0,
        paid_amount DECIMAL(15, 2) DEFAULT 0,
        remaining_balance DECIMAL(15, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create Inventory Payments table (tracks payments for inventory)
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_payments (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        plot_id INTEGER,
        investor_id INTEGER,
        salesperson_id INTEGER NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        payment_date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE SET NULL,
        FOREIGN KEY (investor_id) REFERENCES investors(id) ON DELETE SET NULL,
        FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_assigned ON inventory(assigned_to)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_investors_salesperson ON investors(salesperson_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_payments_inventory ON inventory_payments(inventory_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_plots_inventory ON inventory_plots(inventory_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_plots_status ON inventory_plots(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_plots_assigned ON inventory_plots(assigned_to)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_plot_assignments_inventory ON inventory_plot_assignments(inventory_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_plot_assignments_salesperson ON inventory_plot_assignments(salesperson_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_deal_plots_deal ON deal_plots(deal_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_deal_plots_plot ON deal_plots(plot_id)
    `);

    // Create Leads table
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone_number VARCHAR(20),
        campaign_name VARCHAR(255),
        lead_date DATE,
        status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'on_hold', 'successful', 'unsuccessful')),
        assigned_to INTEGER,
        assigned_at TIMESTAMP,
        converted_to_customer_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (converted_to_customer_id) REFERENCES customers(id) ON DELETE SET NULL
      )
    `);

    // Create Lead Status Updates table
    await db.query(`
      CREATE TABLE IF NOT EXISTS lead_status_updates (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL,
        updated_by INTEGER NOT NULL,
        update_date DATE NOT NULL,
        activity_type VARCHAR(20) CHECK (activity_type IN ('called', 'messaged')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add status and source columns to customers if they don't exist
    try {
      await db.query(`
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'potential'
      `);
      await db.query(`
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'walk_in'
      `);
      // Add check constraints if they don't exist
      await db.query(`
        ALTER TABLE customers 
        DROP CONSTRAINT IF EXISTS customers_status_check
      `);
      await db.query(`
        ALTER TABLE customers 
        ADD CONSTRAINT customers_status_check 
        CHECK (status IN ('potential', 'successful', 'unsuccessful'))
      `);
      await db.query(`
        ALTER TABLE customers 
        DROP CONSTRAINT IF EXISTS customers_source_check
      `);
      await db.query(`
        ALTER TABLE customers 
        ADD CONSTRAINT customers_source_check 
        CHECK (source IN ('walk_in', 'lead_conversion'))
      `);
    } catch (error) {
      console.log('Note: customers status/source columns may already exist:', error.message);
    }

    // Create indexes for leads
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_status_updates_lead ON lead_status_updates(lead_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_status_updates_date ON lead_status_updates(update_date)
    `);

    // Create Inventory Requests table
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_requests (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        salesperson_id INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        requested_plot_ids INTEGER[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add requested_plot_ids column if it doesn't exist (for existing databases)
    try {
      await db.query(`
        ALTER TABLE inventory_requests 
        ADD COLUMN IF NOT EXISTS requested_plot_ids INTEGER[]
      `);
    } catch (error) {
      // Column might already exist, ignore error
      if (error.code !== '42701') {
        console.log('Note: requested_plot_ids column already exists or error:', error.message);
      }
    }

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_requests_status ON inventory_requests(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_requests_salesperson ON inventory_requests(salesperson_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_inventory ON deals(inventory_id)
    `);

    // Create function to update updated_at timestamp
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    await db.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
      CREATE TRIGGER update_customers_updated_at
        BEFORE UPDATE ON customers
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
      CREATE TRIGGER update_deals_updated_at
        BEFORE UPDATE ON deals
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_agreements_updated_at ON agreements;
      CREATE TRIGGER update_agreements_updated_at
        BEFORE UPDATE ON agreements
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
      CREATE TRIGGER update_payments_updated_at
        BEFORE UPDATE ON payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;
      CREATE TRIGGER update_inventory_updated_at
        BEFORE UPDATE ON inventory
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_investors_updated_at ON investors;
      CREATE TRIGGER update_investors_updated_at
        BEFORE UPDATE ON investors
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_inventory_payments_updated_at ON inventory_payments;
      CREATE TRIGGER update_inventory_payments_updated_at
        BEFORE UPDATE ON inventory_payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_inventory_requests_updated_at ON inventory_requests;
      CREATE TRIGGER update_inventory_requests_updated_at
        BEFORE UPDATE ON inventory_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_inventory_plots_updated_at ON inventory_plots;
      CREATE TRIGGER update_inventory_plots_updated_at
        BEFORE UPDATE ON inventory_plots
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
      CREATE TRIGGER update_leads_updated_at
        BEFORE UPDATE ON leads
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create default admin user (password: admin123)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await db.query(`
      INSERT INTO users (name, email, password, role) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['Azam', 'admin@uhcrm.com', hashedPassword, 'admin']);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;
