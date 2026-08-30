const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log(`📝 Database config loaded for ${process.env.DB_NAME || 'medical_scribe_db'} (host hidden)`);

const sslEnabled = String(process.env.DB_SSL || '').trim().toLowerCase() === 'true';

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'medical_scribe_db',
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...(sslEnabled ? { ssl: { rejectUnauthorized: true } } : {}),
});

// Test database connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error connecting to MySQL database:', err.message);
    console.error('Please check your .env file and ensure MySQL is running');
    process.exit(1);
  }
  console.log('✅ Connected to MySQL database:', process.env.DB_NAME);
  connection.release();
});

// Promisify for async/await
const promisePool = pool.promise();

module.exports = promisePool;
