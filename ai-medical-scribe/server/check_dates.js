const mysql = require('mysql2');
require('dotenv').config({ path: './.env' });

const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'medicalscribe',
  port: parseInt(process.env.DB_PORT || '3306', 10)
});

conn.query('SELECT id, visit_date FROM consultations WHERE patient_id = 21 ORDER BY id ASC', (err, rows) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  
  console.log('\n✓ Kalai Maha T (Patient ID 21) Consultations:');
  console.log('─'.repeat(50));
  rows.forEach(r => {
    const d = new Date(r.visit_date);
    console.log(`Consultation ID ${r.id}:`);
    console.log(`  Database: ${r.visit_date}`);
    console.log(`  Formatted: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`);
  });
  console.log('─'.repeat(50));
  
  conn.end();
});
