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
    if (!(await columnExists('consultations', 'medications_ai_suggested'))) {
      await db.query('ALTER TABLE consultations ADD COLUMN medications_ai_suggested TEXT NULL');
    }
    if (!(await columnExists('consultations', 'medications_ai_suggested_confirmed'))) {
      await db.query('ALTER TABLE consultations ADD COLUMN medications_ai_suggested_confirmed TINYINT(1) DEFAULT 0');
    }

    console.log('medications_ai_suggested / medications_ai_suggested_confirmed columns are in place.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to add medication-suggestion columns:', err.message);
    process.exit(1);
  }
}

run();
