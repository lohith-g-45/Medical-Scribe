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
  'medications_ai_suggested',
  'follow_up',
];

const PATIENT_SENSITIVE_FIELDS = [
  'patient_name',
  'age',
  'gender',
  'phone',
  'email',
  'address',
  'medical_history',
  'allergies',
  'blood_group',
];

const UTTERANCE_SENSITIVE_FIELDS = [
  'original_text',
  'english_text',
];

// A voiceprint embedding is biometric data — treat it with the same care as PHI.
const VOICEPRINT_SENSITIVE_FIELDS = [
  'embedding',
];

let cachedKey = null;

function resolveEncryptionKey() {
  if (cachedKey) return cachedKey;

  const explicit = process.env.MEDICAL_DATA_ENCRYPTION_KEY || '';

  if (!explicit) {
    throw new Error(
      'Missing encryption key. Set MEDICAL_DATA_ENCRYPTION_KEY in server/.env to a long random value ' +
      '(it must NOT be the same as JWT_SECRET — they protect different things).'
    );
  }

  if (explicit === (process.env.JWT_SECRET || '')) {
    throw new Error(
      'MEDICAL_DATA_ENCRYPTION_KEY must not be equal to JWT_SECRET. ' +
      'Using the same secret for token signing and data encryption means a JWT leak also exposes patient data.'
    );
  }

  // Derive a stable 32-byte key from env string.
  cachedKey = crypto.createHash('sha256').update(String(explicit), 'utf8').digest();
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

function encryptFields(sensitiveFields, input = {}) {
  const out = { ...input };
  for (const field of sensitiveFields) {
    if (field in out) {
      out[field] = encryptValue(out[field]);
    }
  }
  return out;
}

function decryptFields(sensitiveFields, tableName, record = {}) {
  const out = { ...record };
  for (const field of sensitiveFields) {
    if (field in out) {
      try {
        out[field] = decryptValue(out[field]);
      } catch (err) {
        // Do not leak sensitive cryptographic internals in API responses, but DO
        // surface that a decrypt failed (wrong/rotated key, corrupted data) — silently
        // returning null hides key-management bugs behind blank medical records.
        console.error(`[fieldEncryption] Failed to decrypt ${tableName}.${field} for record id=${record.id ?? 'unknown'}: ${err.message}`);
        out[field] = null;
      }
    }
  }
  return out;
}

const encryptConsultationFields = (input) => encryptFields(CONSULTATION_SENSITIVE_FIELDS, input);
const decryptConsultationFields = (record) => decryptFields(CONSULTATION_SENSITIVE_FIELDS, 'consultations', record);
const encryptPatientFields = (input) => encryptFields(PATIENT_SENSITIVE_FIELDS, input);
const decryptPatientFields = (record) => decryptFields(PATIENT_SENSITIVE_FIELDS, 'patients', record);
const encryptUtteranceFields = (input) => encryptFields(UTTERANCE_SENSITIVE_FIELDS, input);
const decryptUtteranceFields = (record) => decryptFields(UTTERANCE_SENSITIVE_FIELDS, 'consultation_utterances', record);
const encryptVoiceprintFields = (input) => encryptFields(VOICEPRINT_SENSITIVE_FIELDS, input);
const decryptVoiceprintFields = (record) => decryptFields(VOICEPRINT_SENSITIVE_FIELDS, 'doctor_voiceprints', record);

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
  UTTERANCE_SENSITIVE_FIELDS,
  VOICEPRINT_SENSITIVE_FIELDS,
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
  encryptUtteranceFields,
  decryptUtteranceFields,
  encryptVoiceprintFields,
  decryptVoiceprintFields,
  buildPatientLookupHashes,
};
