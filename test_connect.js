const { Client } = require('pg');

async function test(url) {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log('SUCCESS for URL:', url);
    await client.end();
    return true;
  } catch (e) {
    console.log('FAILED for URL:', url, 'Error:', e.message);
    return false;
  }
}

async function run() {
  const urls = [
    'postgresql://neondb_owner:npg_IgQMlcqi10RL@ep-falling-union-ai0ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_IgQMIcqilORL@ep-falling-union-a10ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_IgQMIcqi1ORL@ep-falling-union-a10ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_lgQMIcqil0RL@ep-falling-union-a10ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_IgQMIcqil0RL@ep-falling-union-a10ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_IgQM1cqi10RL@ep-falling-union-a10ha7z8-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'
  ];
  for (const u of urls) {
     if (await test(u)) break;
  }
}
run();
