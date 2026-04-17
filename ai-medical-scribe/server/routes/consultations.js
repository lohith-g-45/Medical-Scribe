const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  encryptConsultationFields,
  decryptConsultationFields,
  decryptPatientFields,
} = require('../utils/fieldEncryption');

const AI_SUGGESTION_PREFIX = /^\s*ai\s*suggestion\s*\(\s*doctor\s*review\s*required\s*\)\s*:\s*/i;

function sanitizeMedicationsText(value) {
  const cleaned = String(value || '').replace(AI_SUGGESTION_PREFIX, '').trim();
  return cleaned;
}

function sanitizeConsultationRecord(record = {}) {
  return {
    ...record,
    medications: sanitizeMedicationsText(record.medications),
  };
}

// Get all consultations
router.get('/', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patient_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT c.*, p.patient_name, p.age, p.gender, u.name as doctor_name
      FROM consultations c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users u ON c.doctor_id = u.id
      WHERE c.doctor_id = ?
    `;
    let params = [doctorId];

    if (patient_id) {
      query += ' AND c.patient_id = ?';
      params.push(patient_id);
    }

    query += ' ORDER BY c.visit_date DESC, c.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [consultationsRaw] = await db.query(query, params);
    const consultations = consultationsRaw.map((row) =>
      sanitizeConsultationRecord(decryptPatientFields(decryptConsultationFields(row)))
    );

    res.json({
      success: true,
      count: consultations.length,
      consultations
    });
  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({ error: 'Error fetching consultations' });
  }
});

// Get consultation by ID
router.get('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    const [consultationsRaw] = await db.query(
      `SELECT c.*, p.patient_name, p.age, p.gender, p.phone, p.email, 
              u.name as doctor_name, u.specialization
       FROM consultations c
       LEFT JOIN patients p ON c.patient_id = p.id
       LEFT JOIN users u ON c.doctor_id = u.id
       WHERE c.id = ? AND c.doctor_id = ?`,
      [id, doctorId]
    );

    if (consultationsRaw.length === 0) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const consultations = consultationsRaw.map((row) =>
      sanitizeConsultationRecord(decryptPatientFields(decryptConsultationFields(row)))
    );

    // Get prescriptions if any
    const [prescriptions] = await db.query(
      'SELECT * FROM prescriptions WHERE consultation_id = ?',
      [id]
    );

    res.json({
      success: true,
      consultation: consultations[0],
      prescriptions
    });
  } catch (error) {
    console.error('Get consultation error:', error);
    res.status(500).json({ error: 'Error fetching consultation details' });
  }
});

// Create new consultation
router.post('/', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const {
      patient_id,
      visit_date,
      transcript,
      subjective,
      objective,
      assessment,
      plan,
      diagnosis,
      medications,
      follow_up,
      status = 'completed',
      duration
    } = req.body;

    const encrypted = encryptConsultationFields({
      transcript,
      subjective,
      objective,
      assessment,
      plan,
      diagnosis,
      medications: sanitizeMedicationsText(medications),
      follow_up,
    });

    // Validation
    if (!patient_id || !visit_date) {
      return res.status(400).json({ 
        error: 'Please provide required fields: patient_id, visit_date' 
      });
    }

    // Verify patient exists
    const [patients] = await db.query('SELECT id FROM patients WHERE id = ?', [patient_id]);
    if (patients.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Prevent a doctor from writing a consultation against a patient record
    // that already belongs to another doctor's consultation history.
    const [ownership] = await db.query(
      `SELECT COUNT(*) as total_consultations,
              SUM(CASE WHEN doctor_id = ? THEN 1 ELSE 0 END) as my_consultations
       FROM consultations
       WHERE patient_id = ?`,
      [doctorId, patient_id]
    );

    const totalConsultations = Number(ownership[0]?.total_consultations || 0);
    const myConsultations = Number(ownership[0]?.my_consultations || 0);

    if (totalConsultations > 0 && myConsultations === 0) {
      return res.status(403).json({ error: 'You are not authorized to add consultations for this patient' });
    }

    // Insert consultation
    const [result] = await db.query(
      `INSERT INTO consultations 
       (patient_id, doctor_id, visit_date, transcript, subjective, objective, 
        assessment, plan, diagnosis, medications, follow_up, status, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_id, doctorId, visit_date,
        encrypted.transcript,
        encrypted.subjective,
        encrypted.objective,
        encrypted.assessment,
        encrypted.plan,
        encrypted.diagnosis,
        encrypted.medications,
        encrypted.follow_up,
        status,
        duration
      ]
    );

    res.status(201).json({
      success: true,
      consultation_id: result.insertId,
      message: 'Consultation saved successfully'
    });
  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({ error: 'Error saving consultation' });
  }
});

// Update consultation
router.put('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    if ('doctor_id' in updates) {
      delete updates.doctor_id;
    }

    // Check if consultation exists
    const [existing] = await db.query(
      'SELECT id FROM consultations WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    // Build update query
    const normalizedUpdates = {
      ...updates,
      ...(Object.prototype.hasOwnProperty.call(updates, 'medications')
        ? { medications: sanitizeMedicationsText(updates.medications) }
        : {}),
    };

    const encryptedUpdates = encryptConsultationFields(normalizedUpdates);
    const fields = Object.keys(encryptedUpdates);
    const values = Object.values(encryptedUpdates);
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    values.push(id);

    await db.query(
      `UPDATE consultations SET ${setClause} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: 'Consultation updated successfully'
    });
  } catch (error) {
    console.error('Update consultation error:', error);
    res.status(500).json({ error: 'Error updating consultation' });
  }
});

// Delete consultation
router.delete('/:id', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    const [result] = await db.query(
      'DELETE FROM consultations WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    res.json({
      success: true,
      message: 'Consultation deleted successfully'
    });
  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({ error: 'Error deleting consultation' });
  }
});

// Get patient's consultation history
router.get('/patient/:patient_id/history', async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patient_id } = req.params;

    const [consultationsRaw] = await db.query(
      `SELECT c.id, c.visit_date, c.diagnosis, c.status, c.duration,
              u.name as doctor_name, u.specialization
       FROM consultations c
       LEFT JOIN users u ON c.doctor_id = u.id
       WHERE c.patient_id = ? AND c.doctor_id = ?
       ORDER BY c.visit_date DESC`,
      [patient_id, doctorId]
    );

    const history = consultationsRaw.map((row) => sanitizeConsultationRecord(decryptConsultationFields(row)));

    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('Get patient history error:', error);
    res.status(500).json({ error: 'Error fetching patient history' });
  }
});

module.exports = router;
