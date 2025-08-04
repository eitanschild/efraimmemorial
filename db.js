const { Pool } = require('pg');
require('dotenv').config();

console.log('📡 Initializing PostgreSQL connection...');

// Create the pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Optional: test the connection
pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ PostgreSQL connected at:', res.rows[0].now);
  })
  .catch(err => {
    console.error('❌ Failed to connect to PostgreSQL:', err);
  });

// Export helper to use await db.query(...)
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool // optional if you need access to the raw pool
};
