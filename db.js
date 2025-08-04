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
await db.query(
    'UPDATE photos SET filename = $1, caption = $2, uploader = $3 WHERE slot = $4',
    [finalName, caption, uploader, index]
  );
  