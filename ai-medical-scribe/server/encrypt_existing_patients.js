require('dotenv').config();
const db = require('./config/database');
const {
  PATIENT_SENSITIVE_FIELDS,
  encryptValue,
  isEncrypted,
  decryptPatientFields,
  buildPatientLookupHashes,
} = require('./utils/fieldEncryption');

async function run() {
  try {
    const [rows] = await db.query('SELECT * FROM patients ORDER BY id ASC');
    let updated = 0;

    for (const row of rows) {
      const updates = {};
      const plain = decryptPatientFields(row);

      for (const field of PATIENT_SENSITIVE_FIELDS) {
        if (!(field in row)) continue;
        const value = row[field];
        if (value === null || value === undefined || value === '') continue;
        if (isEncrypted(value)) continue;
        updates[field] = encryptValue(plain[field]);
      }

      const lookupHashes = buildPatientLookupHashes({
        phone: plain.phone,
        email: plain.email,
      });

      if ('phone_hash' in row) {
        updates.phone_hash = lookupHashes.phone_hash;
      }

      if ('email_hash' in row) {
        updates.email_hash = lookupHashes.email_hash;
      }

      const fields = Object.keys(updates);
      if (!fields.length) continue;

      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => updates[f]);
      values.push(row.id);

      await db.query(`UPDATE patients SET ${setClause} WHERE id = ?`, values);
      updated += 1;
    }

    console.log(`Encrypted patients updated: ${updated}`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to encrypt existing patients:', err.message);
    process.exit(1);
  }
}

run();