const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./config/database');
const initDatabase = require('./config/dbInit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/deals', require('./routes/deals'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/agreements', require('./routes/agreements'));
app.use('/api/dealers', require('./routes/dealers'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/investors', require('./routes/investors'));
app.use('/api/inventory-requests', require('./routes/inventoryRequests'));
app.use('/api/inventory-payments', require('./routes/inventoryPayments'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/dealer-exchanges', require('./routes/dealerExchanges'));
app.use('/api/balance-transactions', require('./routes/balanceTransactions'));
app.use('/api/balance-projects', require('./routes/balanceProjects'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/agencies', require('./routes/agencies'));
app.use('/api/slips', require('./routes/slips'));

// Initialize database and start server.
// The database may be asleep or briefly unreachable, so retry with a growing delay
// before giving up instead of exiting on the first timeout.
const MAX_ATTEMPTS = 8;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectAndInit = async () => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.query('SELECT NOW()');
      console.log('PostgreSQL Database connected successfully');
      await initDatabase();
      return;
    } catch (error) {
      console.error(`Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${error.message}`);
      if (attempt === MAX_ATTEMPTS) throw error;
      await wait(Math.min(2000 * attempt, 10000));
    }
  }
};

const startServer = async () => {
  try {
    await connectAndInit();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Could not start server:', error);
    process.exit(1);
  }
};

startServer();

