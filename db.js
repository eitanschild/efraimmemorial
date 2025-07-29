const { Pool } = require('pg');
require('dotenv').config();

console.log('📡 Initializing PostgreSQL connection...');

// Use Railway-provided env var
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway + SSL
  }
});

pool.query('SELECT NOW()').then(res => {
  console.log('✅ PostgreSQL connected at:', res.rows[0].now);
}).catch(err => {
  console.error('❌ Failed to connect to PostgreSQL:', err);
});

module.exports = pool;
