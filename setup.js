const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function setup() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'uh_crm';
    await client.query(`CREATE DATABASE ${dbName}`);
    console.log(`Database '${dbName}' created or already exists`);
    
    await client.end();

    // Now connect to the specific database and initialize tables
    const dbClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: dbName,
      port: process.env.DB_PORT || 5432,
    });

    await dbClient.connect();
    console.log(`Connected to database '${dbName}'`);

    // Initialize tables using the dbInit module
    const initDatabase = require('./server/config/dbInit');
    await initDatabase();
    
    await dbClient.end();
    
    console.log('\n✅ Setup completed successfully!');
    console.log('\nDefault admin credentials:');
    console.log('Email: admin@uhcrm.com');
    console.log('Password: admin123');
    console.log('\nYou can now start the server with: npm run server');
  } catch (error) {
    if (error.code === '42P04') {
      // Database already exists, continue with table initialization
      console.log('Database already exists, initializing tables...');
      await client.end();
      
      const dbName = process.env.DB_NAME || 'uh_crm';
      const dbClient = new Client({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        port: process.env.DB_PORT || 5432,
      });

      await dbClient.connect();
      const initDatabase = require('./server/config/dbInit');
      await initDatabase();
      await dbClient.end();
      
      console.log('\n✅ Setup completed successfully!');
      console.log('\nDefault admin credentials:');
      console.log('Email: admin@uhcrm.com');
      console.log('Password: admin123');
      console.log('\nYou can now start the server with: npm run server');
    } else {
      console.error('Setup error:', error);
      process.exit(1);
    }
  }
}

setup();
