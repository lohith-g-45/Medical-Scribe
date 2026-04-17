require('dotenv').config();
const db = require('./config/database');
const {
  CONSULTATION_SENSITIVE_FIELDS,
  encryptValue,
  isEncrypted,
} = require('./utils/fieldEncryption');

async function run() {
  try {
    const [rows] = await db.query('SELECT * FROM consultations ORDER BY id ASC');
    let updated = 0;

    for (const row of rows) {
      const updates = {};

      for (const field of CONSULTATION_SENSITIVE_FIELDS) {
        if (!(field in row)) continue;
        const value = row[field];
        if (value === null || value === undefined || value === '') continue;
        if (isEncrypted(value)) continue;
        updates[field] = encryptValue(value);
      }

      const fields = Object.keys(updates);
      if (!fields.length) continue;

      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => updates[f]);
      values.push(row.id);

      await db.query(`UPDATE consultations SET ${setClause} WHERE id = ?`, values);
      updated += 1;
    }

    console.log(`Encrypted consultations updated: ${updated}`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to encrypt existing consultations:', err.message);
    process.exit(1);
  }
}

run();
