const { Client } = require('pg');
require('dotenv').config();

async function run() {
    const dbName = process.env.DB_NAME || 'uh_crm';
    const dbClient = new Client({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        port: process.env.DB_PORT || 5432,
    });
    await dbClient.connect();
    
    // We mock the db object that dbInit expects
    const initDatabase = require('./server/config/dbInit');
    
    // BUT wait, dbInit imports './database' which loads from config/database.js
    // config/database.js will use DATABASE_URL if it's set in .env!
    // So to force local DB, we must delete process.env.DATABASE_URL
    
    process.env.DATABASE_URL = '';
    
    console.log('Running init locally...');
    await initDatabase();
    
    await dbClient.end();
}
run().catch(console.error);
