const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  }
  : {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uh_crm',
    port: process.env.DB_PORT || 5432,
  };

const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  // Hosted databases (Neon) pause when idle; the first connection after a pause can take a while.
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

// Test connection
pool.on('connect', () => {
  console.log('PostgreSQL Database connected');
});

// A dropped idle connection is normal on hosted Postgres. The pool discards that client and opens
// a new one on the next query, so log it and keep the server running.
pool.on('error', (err) => {
  console.error('Idle database client error (connection will be replaced):', err.message);
});

module.exports = pool;
