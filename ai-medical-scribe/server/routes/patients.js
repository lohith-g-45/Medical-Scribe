const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  decryptConsultationFields,
  encryptPatientFields,
  decryptPatientFields,
  buildPatientLookupHashes,
  normalizePhone,
  normalizeEmail,
} = require('../utils/fieldEncryption');

function sanitizePatientOutput(patient = {}) {
  const out = { ...patient };
  delete out.phone_hash;
  delete out.email_hash;
  return out;
}

const AI_SUGGESTION_PREFIX = /^\s*ai\s*suggestion\s*\(\s*doctor\s*review\s*required\s*\)\s*:\s*/i;

function sanitizeConsultationOutput(consultation = {}) {
  return {
    ...consultation,
    medications: String(consultation.medications || '').replace(AI_SUGGESTION_PREFIX, '').trim(),
  };
}

function buildShortConsultationSummary(consultation = {}) {
  const visitDateRaw = consultation.visit_date || consultation.created_at || null;
  const visitDate = visitDateRaw ? new Date(visitDateRaw).toISOString().slice(0, 10) : null;

  const parts = [
    consultation.diagnosis,
    consultation.assessment,
    consultation.plan,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const combined = parts.join(' | ');
  const summary = combined
    ? (combined.length > 220 ? `${combined.slice(0, 217)}...` : combined)
    : 'No previous consultation summary available.';

  return { visitDate, summary };
}

async function getLastConsultationShort(patientId, doctorId) {
  const [rows] = await db.query(
    `SELECT id, visit_date, created_at, diagnosis, assessment, plan
     FROM consultations
     WHERE patient_id = ? AND doctor_id = ?
     ORDER BY visit_date DESC, id DESC
     LIMIT 1`,
    [patientId, doctorId]
  );

  if (!rows.length) return null;
  const decrypted = decryptConsultationFields(rows[0]);
  return buildShortConsultationSummary(decrypted);
}

// Get all patients (with search)
router.get('/', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { search, limit = 50, offset = 0 } = req.query;

    const [patientsRaw] = await db.query(
      `SELECT DISTINCT p.*
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE c.doctor_id = ?
       ORDER BY p.created_at DESC`,
      [doctorId]
    );

    const patientsDecrypted = patientsRaw
      .map((row) => decryptPatientFields(row))
      .map((row) => sanitizePatientOutput(row));

    let filtered = patientsDecrypted;
    if (search) {
      const needle = String(search).trim().toLowerCase();
      filtered = patientsDecrypted.filter((p) =>
        String(p.patient_name || '').toLowerCase().includes(needle) ||
        String(p.phone || '').toLowerCase().includes(needle) ||
        String(p.email || '').toLowerCase().includes(needle)
      );
    }

    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);
    const patients = filtered.slice(off, off + lim);

    res.json({
      success: true,
      count: patients.length,
      total: filtered.length,
      patients,
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Error fetching patients' });
  }
});

// Resolve existing patient by ID or exact phone/email (optionally with name match)
router.get('/resolve', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patient_id, phone, email, name } = req.query;

    if (patient_id) {
      const [byIdRaw] = await db.query(
        `SELECT p.*
         FROM patients p
         INNER JOIN consultations c ON c.patient_id = p.id
         WHERE p.id = ? AND c.doctor_id = ?
         LIMIT 1`,
        [parseInt(patient_id, 10), doctorId]
      );

      const patient = byIdRaw.length
        ? sanitizePatientOutput(decryptPatientFields(byIdRaw[0]))
        : null;
      const lastConsultation = patient
        ? await getLastConsultationShort(patient.id, doctorId)
        : null;

      return res.json({
        success: true,
        patient,
        matchedBy: patient ? 'id' : null,
        lastConsultation,
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(name || '').trim().toLowerCase();

    if (!normalizedPhone && !normalizedEmail) {
      return res.json({ success: true, patient: null, matchedBy: null });
    }

    const lookupHashes = buildPatientLookupHashes({
      phone: normalizedPhone,
      email: normalizedEmail,
    });

    const where = [];
    const params = [];

    if (normalizedPhone) {
      where.push('p.phone_hash = ?');
      params.push(lookupHashes.phone_hash);
    }

    if (normalizedEmail) {
      where.push('p.email_hash = ?');
      params.push(lookupHashes.email_hash);
    }

    const whereSql = where.join(' OR ');

    const [rowsRaw] = await db.query(
      `SELECT DISTINCT p.*
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE c.doctor_id = ? AND (${whereSql})
       ORDER BY p.id DESC
       LIMIT 20`,
      [doctorId, ...params]
    );

    const rows = rowsRaw
      .map((row) => decryptPatientFields(row))
      .map((row) => sanitizePatientOutput(row));

    if (!rows.length) {
      return res.json({ success: true, patient: null, matchedBy: null });
    }

    let selected = rows[0];
    if (normalizedName) {
      const exactName = rows.find((r) => String(r.patient_name || '').trim().toLowerCase() === normalizedName);
      if (exactName) selected = exactName;
    }

    let matchedBy = 'contact';
    if (normalizedPhone && normalizePhone(selected.phone) === normalizedPhone) matchedBy = 'phone';
    if (normalizedEmail && normalizeEmail(selected.email) === normalizedEmail) {
      matchedBy = matchedBy === 'phone' ? 'phone+email' : 'email';
    }

    const lastConsultation = await getLastConsultationShort(selected.id, doctorId);

    res.json({
      success: true,
      patient: selected,
      matchedBy,
      lastConsultation,
    });
  } catch (error) {
    console.error('Resolve patient error:', error);
    res.status(500).json({ error: 'Error resolving patient' });
  }
});

// Get patient by ID with consultation history
router.get('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    // Get patient info
    const [patientsRaw] = await db.query(
      `SELECT DISTINCT p.*
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE p.id = ? AND c.doctor_id = ?`,
      [id, doctorId]
    );

    if (patientsRaw.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = sanitizePatientOutput(decryptPatientFields(patientsRaw[0]));

    // Get consultation history
    const [consultationsRaw] = await db.query(
      `SELECT c.*, u.name as doctor_name, u.specialization
       FROM consultations c
       LEFT JOIN users u ON c.doctor_id = u.id
       WHERE c.patient_id = ? AND c.doctor_id = ?
       ORDER BY c.visit_date DESC`,
      [id, doctorId]
    );

    const consultations = consultationsRaw.map((row) => sanitizeConsultationOutput(decryptConsultationFields(row)));

    res.json({
      success: true,
      patient,
      consultations,
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Error fetching patient details' });
  }
});

// Search patients by name or phone
router.get('/search/:query', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { query } = req.params;

    const [patientsRaw] = await db.query(
      `SELECT DISTINCT p.id, p.patient_name, p.age, p.gender, p.phone, p.email
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE c.doctor_id = ?
       ORDER BY p.patient_name ASC`,
      [doctorId]
    );

    const normalizedQuery = String(query || '').trim().toLowerCase();
    const normalizedDigits = normalizePhone(query);

    const patients = patientsRaw
      .map((row) => decryptPatientFields(row))
      .map((row) => sanitizePatientOutput(row))
      .filter((row) =>
        String(row.patient_name || '').toLowerCase().includes(normalizedQuery) ||
        (normalizedDigits && normalizePhone(row.phone).includes(normalizedDigits))
      )
      .slice(0, 20);

    res.json({
      success: true,
      count: patients.length,
      patients,
    });
  } catch (error) {
    console.error('Search patients error:', error);
    res.status(500).json({ error: 'Error searching patients' });
  }
});

// Create new patient
router.post('/', async (req, res) => {
  try {
    const {
      patient_name,
      age,
      gender,
      phone,
      email,
      address,
      medical_history,
      allergies,
      blood_group,
    } = req.body;

    if (!patient_name || !age || !gender) {
      return res.status(400).json({ error: 'Please provide required fields: patient_name, age, gender' });
    }

    const encrypted = encryptPatientFields({
      age,
      gender,
      phone,
      email,
      address,
      medical_history,
      allergies,
      blood_group,
    });
    const lookupHashes = buildPatientLookupHashes({ phone, email });

    const [result] = await db.query(
      `INSERT INTO patients
       (patient_name, age, gender, phone, email, address, medical_history, allergies, blood_group, phone_hash, email_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_name,
        encrypted.age,
        encrypted.gender,
        encrypted.phone,
        encrypted.email,
        encrypted.address,
        encrypted.medical_history,
        encrypted.allergies,
        encrypted.blood_group,
        lookupHashes.phone_hash,
        lookupHashes.email_hash,
      ]
    );

    res.status(201).json({
      success: true,
      patient_id: result.insertId,
      message: 'Patient created successfully',
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Error creating patient' });
  }
});

// Update patient
router.put('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;
    const updates = { ...req.body };

    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.phone_hash;
    delete updates.email_hash;

    // Check if patient exists
    const [existing] = await db.query(
      `SELECT DISTINCT p.id
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE p.id = ? AND c.doctor_id = ?`,
      [id, doctorId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Build update query dynamically
    const encryptedUpdates = encryptPatientFields(updates);
    const lookupHashes = buildPatientLookupHashes(updates);

    if ('phone' in updates) {
      encryptedUpdates.phone_hash = lookupHashes.phone_hash;
    }
    if ('email' in updates) {
      encryptedUpdates.email_hash = lookupHashes.email_hash;
    }

    const fields = Object.keys(encryptedUpdates);
    const values = Object.values(encryptedUpdates);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    values.push(id);

    await db.query(`UPDATE patients SET ${setClause} WHERE id = ?`, values);

    res.json({
      success: true,
      message: 'Patient updated successfully',
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Error updating patient' });
  }
});

// Delete patient
router.delete('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    const [result] = await db.query(
      `DELETE p
       FROM patients p
       INNER JOIN consultations c ON c.patient_id = p.id
       WHERE p.id = ? AND c.doctor_id = ?`,
      [id, doctorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      success: true,
      message: 'Patient deleted successfully',
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Error deleting patient' });
  }
});

module.exports = router;
