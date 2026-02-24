const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/database');
const initDatabase = require('./config/dbInit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    db.query('SELECT NOW()', (err, result) => {
      if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
      } else {
        console.log('PostgreSQL Database connected successfully');

        // Initialize database tables
        initDatabase().then(() => {
          app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
          });
        }).catch((error) => {
          console.error('Error initializing database:', error);
          process.exit(1);
        });
      }
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();

