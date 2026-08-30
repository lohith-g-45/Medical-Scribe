const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  encryptVoiceprintFields,
  decryptVoiceprintFields,
} = require('../utils/fieldEncryption');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8000';
const MIN_ENROLLMENT_DURATION_MS = 4000; // reject clips too short for a stable embedding

async function embedAudioViaPython(audioBuffer, mimeType) {
  const form = new FormData();
  form.append('audio', new Blob([audioBuffer], { type: mimeType || 'audio/wav' }), 'enrollment.wav');

  const response = await fetch(`${AI_API_URL}/api/voice-enrollment/embed`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Voice embedding service returned ${response.status}: ${body}`);
  }

  return response.json();
}

// GET /api/voice-enrollment — check whether the logged-in doctor has an enrolled voiceprint
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, sample_duration_ms, enrolled_at FROM doctor_voiceprints WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      enrolled: rows.length > 0,
      sampleDurationMs: rows[0]?.sample_duration_ms || null,
      enrolledAt: rows[0]?.enrolled_at || null,
    });
  } catch (error) {
    console.error('Get voice enrollment status error:', error);
    res.status(500).json({ error: 'Error checking voice enrollment status' });
  }
});

// POST /api/voice-enrollment — enroll (or re-enroll) the logged-in doctor's voice.
// Body: { audioBase64, mimeType, durationMs }
router.post('/', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/wav', durationMs = 0 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    if (Number(durationMs) > 0 && Number(durationMs) < MIN_ENROLLMENT_DURATION_MS) {
      return res.status(400).json({
        error: `Recording is too short. Please record at least ${MIN_ENROLLMENT_DURATION_MS / 1000} seconds.`,
      });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const embedResult = await embedAudioViaPython(audioBuffer, mimeType);

    if (!embedResult?.embedding) {
      return res.status(502).json({ error: 'Voice embedding service did not return an embedding' });
    }

    const encrypted = encryptVoiceprintFields({ embedding: JSON.stringify(embedResult.embedding) });

    // Upsert — one active voiceprint per doctor; re-enrollment overwrites the previous one.
    await db.query(
      `INSERT INTO doctor_voiceprints (user_id, embedding, sample_duration_ms)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE embedding = VALUES(embedding), sample_duration_ms = VALUES(sample_duration_ms), enrolled_at = NOW()`,
      [req.user.id, encrypted.embedding, durationMs || null]
    );

    res.json({ success: true, message: 'Voice enrolled successfully' });
  } catch (error) {
    console.error('Voice enrollment error:', error);
    res.status(500).json({ error: 'Error enrolling voice: ' + error.message });
  }
});

// DELETE /api/voice-enrollment — remove the logged-in doctor's enrollment
router.delete('/', async (req, res) => {
  try {
    await db.query('DELETE FROM doctor_voiceprints WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Voice enrollment removed' });
  } catch (error) {
    console.error('Delete voice enrollment error:', error);
    res.status(500).json({ error: 'Error removing voice enrollment' });
  }
});

// Internal helper (used by routes/diarize.js) — fetch and decrypt the doctor's stored
// embedding as a plain float array, or null if not enrolled.
async function getDoctorEmbedding(userId) {
  const [rows] = await db.query(
    'SELECT embedding FROM doctor_voiceprints WHERE user_id = ?',
    [userId]
  );
  if (!rows.length) return null;

  const decrypted = decryptVoiceprintFields(rows[0]);
  if (!decrypted.embedding) return null;

  try {
    return JSON.parse(decrypted.embedding);
  } catch (_err) {
    return null;
  }
}

module.exports = router;
module.exports.getDoctorEmbedding = getDoctorEmbedding;
module.exports.embedAudioViaPython = embedAudioViaPython;
