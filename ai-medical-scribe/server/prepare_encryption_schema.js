require('dotenv').config();
const db = require('./config/database');

async function indexExists(tableName, indexName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

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
    await db.query('ALTER TABLE consultations MODIFY COLUMN diagnosis TEXT');
    await db.query('ALTER TABLE consultations MODIFY COLUMN follow_up TEXT');

    if (await indexExists('patients', 'idx_phone')) {
      await db.query('ALTER TABLE patients DROP INDEX idx_phone');
    }

    await db.query('ALTER TABLE patients MODIFY COLUMN age TEXT NOT NULL');
    await db.query('ALTER TABLE patients MODIFY COLUMN gender TEXT NOT NULL');
    await db.query('ALTER TABLE patients MODIFY COLUMN phone TEXT NULL');
    await db.query('ALTER TABLE patients MODIFY COLUMN email TEXT NULL');
    await db.query('ALTER TABLE patients MODIFY COLUMN blood_group TEXT NULL');

    if (!(await columnExists('patients', 'phone_hash'))) {
      await db.query('ALTER TABLE patients ADD COLUMN phone_hash VARCHAR(64) NULL');
    }
    if (!(await columnExists('patients', 'email_hash'))) {
      await db.query('ALTER TABLE patients ADD COLUMN email_hash VARCHAR(64) NULL');
    }

    if (!(await indexExists('patients', 'idx_phone_hash'))) {
      await db.query('ALTER TABLE patients ADD INDEX idx_phone_hash (phone_hash)');
    }
    if (!(await indexExists('patients', 'idx_email_hash'))) {
      await db.query('ALTER TABLE patients ADD INDEX idx_email_hash (email_hash)');
    }

    console.log('Schema prepared for encrypted consultation and patient fields.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to prepare schema:', err.message);
    process.exit(1);
  }
}

run();
