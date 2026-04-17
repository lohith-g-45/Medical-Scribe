const crypto = require('crypto');

const ENC_PREFIX = 'enc_v1:';

const CONSULTATION_SENSITIVE_FIELDS = [
  'transcript',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'diagnosis',
  'medications',
  'follow_up',
];

const PATIENT_SENSITIVE_FIELDS = [
  'age',
  'gender',
  'phone',
  'email',
  'address',
  'medical_history',
  'allergies',
  'blood_group',
];

let cachedKey = null;

function resolveEncryptionKey() {
  if (cachedKey) return cachedKey;

  const explicit = process.env.MEDICAL_DATA_ENCRYPTION_KEY || '';
  const fallback = process.env.JWT_SECRET || '';
  const source = explicit || fallback;

  if (!source) {
    throw new Error('Missing encryption key. Set MEDICAL_DATA_ENCRYPTION_KEY in server/.env');
  }

  // Derive a stable 32-byte key from env string.
  cachedKey = crypto.createHash('sha256').update(String(source), 'utf8').digest();
  return cachedKey;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function normalizePhone(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

function normalizeEmail(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function hashLookupValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function encryptValue(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value;

  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `${ENC_PREFIX}${payload}`;
}

function decryptValue(value) {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncrypted(value)) return value;

  const key = resolveEncryptionKey();
  const b64 = value.slice(ENC_PREFIX.length);
  const raw = Buffer.from(b64, 'base64');

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return plain.toString('utf8');
}

function encryptConsultationFields(input = {}) {
  const out = { ...input };
  for (const field of CONSULTATION_SENSITIVE_FIELDS) {
    if (field in out) {
      out[field] = encryptValue(out[field]);
    }
  }
  return out;
}

function decryptConsultationFields(record = {}) {
  const out = { ...record };
  for (const field of CONSULTATION_SENSITIVE_FIELDS) {
    if (field in out) {
      try {
        out[field] = decryptValue(out[field]);
      } catch (_err) {
        // Do not leak sensitive cryptographic internals in API responses/logs.
        out[field] = null;
      }
    }
  }
  return out;
}

function encryptPatientFields(input = {}) {
  const out = { ...input };
  for (const field of PATIENT_SENSITIVE_FIELDS) {
    if (field in out) {
      out[field] = encryptValue(out[field]);
    }
  }
  return out;
}

function decryptPatientFields(record = {}) {
  const out = { ...record };
  for (const field of PATIENT_SENSITIVE_FIELDS) {
    if (field in out) {
      try {
        out[field] = decryptValue(out[field]);
      } catch (_err) {
        out[field] = null;
      }
    }
  }
  return out;
}

function buildPatientLookupHashes(input = {}) {
  const out = {};

  if ('phone' in input) {
    const normalizedPhone = isEncrypted(input.phone) ? '' : normalizePhone(input.phone);
    out.phone_hash = hashLookupValue(normalizedPhone);
  }

  if ('email' in input) {
    const normalizedEmail = isEncrypted(input.email) ? '' : normalizeEmail(input.email);
    out.email_hash = hashLookupValue(normalizedEmail);
  }

  return out;
}

module.exports = {
  CONSULTATION_SENSITIVE_FIELDS,
  PATIENT_SENSITIVE_FIELDS,
  encryptValue,
  decryptValue,
  isEncrypted,
  normalizePhone,
  normalizeEmail,
  hashLookupValue,
  encryptConsultationFields,
  decryptConsultationFields,
  encryptPatientFields,
  decryptPatientFields,
  buildPatientLookupHashes,
};
