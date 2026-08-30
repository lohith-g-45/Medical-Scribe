require('dotenv').config();
const db = require('./config/database');

async function columnExists(tableName, columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function run() {
  try {
    if (!(await columnExists('patients', 'deleted_at'))) {
      await db.query('ALTER TABLE patients ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL');
    }
    if (!(await columnExists('consultations', 'deleted_at'))) {
      await db.query('ALTER TABLE consultations ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL');
    }

    console.log('Soft-delete columns are in place on patients and consultations.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to add soft-delete columns:', err.message);
    process.exit(1);
  }
}

run();
