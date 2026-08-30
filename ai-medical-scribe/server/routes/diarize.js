const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { AssemblyAI } = require('assemblyai');
const { getDoctorEmbedding } = require('./voiceEnrollment');

const ASSEMBLY_API_KEY = process.env.ASSEMBLYAI_API_KEY;

if (!ASSEMBLY_API_KEY) {
  throw new Error('ASSEMBLYAI_API_KEY is required. Set it in server/.env — diarization cannot run without it.');
}

const client = new AssemblyAI({ apiKey: ASSEMBLY_API_KEY });

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8000';
const VOICE_MATCH_THRESHOLD = 0.75;
const MIN_EMBEDDING_CLIP_MS = 800;

// ── Text-content role heuristic — FALLBACK only ─────────────────────────────────
// Used when no doctor voiceprint is enrolled, voice-match confidence is too low, or
// AssemblyAI only found a single speaker cluster. Voice-based matching (below) is
// acoustic rather than linguistic, so it works identically regardless of which language
// either speaker uses — this text heuristic degrades exactly in that mixed-language case,
// which is why it's the fallback, not the primary path.

const DOCTOR_STRONG_PATTERNS = [
  /\b(when did|since when|how long|do you|are you|can you|let me|i recommend|we should|we need|i will|diagnosis|assessment|plan|ecg|x-ray|mri|blood test|follow up|prescribe|treatment)\b/i,
  /\b(kab se|kitne din|aapko|jaanch|test|dawai|dawa|ilaaj|upchar|nidan)\b/i,
  /(कब\s*से|कितने\s*दिन|आपको|जांच|टेस्ट|दवा|इलाज|उपचार|निदान)/i,
  /\b(yavaginda|eshtu dina|nimge|parikshe|test|oushadi|chikitse)\b/i,
  /\b(eppati nundi|ennaallu|miku|pariksha|mandulu|chikitsa)\b/i,
  /\b(eppo irunthu|ethana naal|ungalukku|parisothanai|marundhu|sigichai)\b/i,
];

const DOCTOR_SOFT_PATTERNS = [
  /\?/,
  /\b(examine|check|evaluate|monitor|advise|review|scan|report)\b/i,
  /\b(kya|kaisa|kaisi|thik hai|dekhte hain)\b/i,
  /(क्या|कैसा|कैसी|ठीक\s*है|देखते\s*हैं)/i,
  /\b(nodona|parisheelane|sari)\b/i,
  /\b(chuddam|sare|ela undi)\b/i,
  /\b(parpom|seri|epadi irukku)\b/i,
];

const PATIENT_STRONG_PATTERNS = [
  /\b(i have|i feel|i am|my|me|pain|fever|cough|headache|nausea|vomit|dizzy|shortness of breath|breath|since|yesterday|today|night|days|weeks)\b/i,
  /\b(mujhe|mera|dard|bukhar|khansi|ulti|chakkar|saans|ghabrahat)\b/i,
  /(मुझे|मेरा|दर्द|बुखार|खांसी|उल्टी|चक्कर|सांस|घबराहट|सीने\s*में)/i,
  /\b(nanage|nanna|novu|jvara|kemmu|vaanti|taletirugu|usiru)\b/i,
  /\b(naku|naaku|noppi|jvaram|daggu|vamti|tiruguta|oopiri)\b/i,
  /\b(enakku|enakku oru|vali|kaichal|irumal|vanti|thalai suttral|moochu)\b/i,
];

const PATIENT_SOFT_PATTERNS = [
  /\b(worried|concerned|suffering|unable|difficulty|hurts|heavy feeling|not feeling well)\b/i,
  /\b(pareshaan|takleef|kamjori)\b/i,
  /(परेशान|तकलीफ|कमज़ोरी|कमजोरी)/i,
  /\b(kashta|balahina)\b/i,
  /\b(ibbandi|balahinamga)\b/i,
  /\b(siramam|balaveenam)\b/i,
];

function countPatternHits(text, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) total += 1;
  }
  return total;
}

function scoreIntentFromText(text = '') {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { doctor: 0, patient: 0 };

  const doctorStrongHits = countPatternHits(t, DOCTOR_STRONG_PATTERNS);
  const doctorSoftHits = countPatternHits(t, DOCTOR_SOFT_PATTERNS);
  const patientStrongHits = countPatternHits(t, PATIENT_STRONG_PATTERNS);
  const patientSoftHits = countPatternHits(t, PATIENT_SOFT_PATTERNS);

  return {
    doctor: doctorStrongHits * 3 + doctorSoftHits,
    patient: patientStrongHits * 3 + patientSoftHits,
  };
}

function inferRoleFromText(text = '') {
  const score = scoreIntentFromText(text);
  if (score.doctor > score.patient) return 'doctor';
  if (score.patient > score.doctor) return 'patient';
  return null;
}

// utterances: [{ speaker: rawLabel, text }] — text should be the freshly re-transcribed
// English text, not AssemblyAI's own (less reliable, especially for non-English speech).
function assignRolesByText(utterances = []) {
  const uniqueRawSpeakers = [...new Set(utterances.map((u) => u.speaker).filter(Boolean))];

  if (uniqueRawSpeakers.length >= 2) {
    const speakerStats = new Map(
      uniqueRawSpeakers.map((label) => [label, { turns: 0, doctorScore: 0, patientScore: 0 }])
    );

    utterances.forEach((u) => {
      if (!u?.speaker || !speakerStats.has(u.speaker)) return;
      const stats = speakerStats.get(u.speaker);
      const score = scoreIntentFromText(u.text || '');
      stats.turns += 1;
      stats.doctorScore += score.doctor;
      stats.patientScore += score.patient;
    });

    const primaryLabels = [...uniqueRawSpeakers].sort((a, b) => {
      const aTurns = speakerStats.get(a)?.turns || 0;
      const bTurns = speakerStats.get(b)?.turns || 0;
      return bTurns - aTurns;
    });

    const firstTwo = primaryLabels.slice(0, 2);
    const [labelA, labelB] = firstTwo;

    const diffA = (speakerStats.get(labelA)?.doctorScore || 0) - (speakerStats.get(labelA)?.patientScore || 0);
    const diffB = (speakerStats.get(labelB)?.doctorScore || 0) - (speakerStats.get(labelB)?.patientScore || 0);

    let doctorLabel = labelA;
    let patientLabel = labelB;

    if (diffB > diffA) {
      doctorLabel = labelB;
      patientLabel = labelA;
    }

    const firstRoleHint = utterances
      .map((u) => ({ speaker: u.speaker, role: inferRoleFromText(u.text) }))
      .find((x) => x.role && firstTwo.includes(x.speaker));

    if (Math.abs(diffA - diffB) <= 1 && firstRoleHint) {
      if (firstRoleHint.role === 'doctor') {
        doctorLabel = firstRoleHint.speaker;
        patientLabel = firstTwo.find((s) => s !== doctorLabel) || patientLabel;
      } else {
        patientLabel = firstRoleHint.speaker;
        doctorLabel = firstTwo.find((s) => s !== patientLabel) || doctorLabel;
      }
    }

    const speakerMap = {};
    speakerMap[doctorLabel] = 'doctor';
    speakerMap[patientLabel] = 'patient';

    uniqueRawSpeakers.forEach((label) => {
      if (speakerMap[label]) return;
      const stats = speakerStats.get(label);
      const d = (stats?.doctorScore || 0) - (stats?.patientScore || 0);
      speakerMap[label] = d >= 0 ? 'doctor' : 'patient';
    });

    return { speakerMap, reliableTwoSpeaker: true, mode: 'text-heuristic' };
  }

  // Single cluster — infer turn-by-turn, alternating as a last resort.
  let lastRole = 'doctor';
  const speakerMap = {};
  utterances.forEach((u, index) => {
    let role = inferRoleFromText(u.text);
    if (!role) role = index === 0 ? 'doctor' : (lastRole === 'doctor' ? 'patient' : 'doctor');
    lastRole = role;
    if (u.speaker) speakerMap[u.speaker] = role; // last write wins for a single label; fine — see per-utterance override below
  });

  return { speakerMap, reliableTwoSpeaker: false, mode: 'heuristic-fallback', perUtteranceRole: utterances.map((u, i) => {
    let role = inferRoleFromText(u.text);
    if (!role) role = i === 0 ? 'doctor' : null;
    return role;
  }) };
}

// ── Voice-based role assignment — PRIMARY when a doctor voiceprint is enrolled ─────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function averageEmbedding(embeddings) {
  if (!embeddings.length) return null;
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) avg[i] += emb[i];
  }
  return avg.map((v) => v / embeddings.length);
}

// clipResults: parallel array to rawUtterances, each { embedding, duration_ms } or null
function assignRolesByVoice(rawUtterances, clipResults, doctorEmbedding) {
  const uniqueRawSpeakers = [...new Set(rawUtterances.map((u) => u.speaker).filter(Boolean))];
  if (uniqueRawSpeakers.length < 2 || !doctorEmbedding) return null;

  const embeddingsByLabel = new Map(uniqueRawSpeakers.map((label) => [label, []]));
  rawUtterances.forEach((u, i) => {
    const clip = clipResults[i];
    if (!clip?.embedding || (clip.duration_ms ?? 0) < MIN_EMBEDDING_CLIP_MS) return;
    embeddingsByLabel.get(u.speaker)?.push(clip.embedding);
  });

  const similarityByLabel = new Map();
  for (const [label, embeddings] of embeddingsByLabel.entries()) {
    const avg = averageEmbedding(embeddings);
    if (!avg) continue;
    similarityByLabel.set(label, cosineSimilarity(avg, doctorEmbedding));
  }

  const labelsWithScores = [...similarityByLabel.entries()];
  if (labelsWithScores.length < 2) return null; // not enough voiced clips per cluster to compare

  labelsWithScores.sort((a, b) => b[1] - a[1]);
  const [[bestLabel, bestScore], [, secondScore]] = labelsWithScores;

  if (bestScore < VOICE_MATCH_THRESHOLD) return null; // not confident this is the doctor at all

  const speakerMap = {};
  uniqueRawSpeakers.forEach((label) => {
    speakerMap[label] = label === bestLabel ? 'doctor' : 'patient';
  });

  return { speakerMap, confidence: bestScore, margin: bestScore - secondScore, mode: 'voice-id' };
}

// ── Audio slicing (ffmpeg) ──────────────────────────────────────────────────────

function sliceClip(inputPath, startMs, endMs, outputPath) {
  return new Promise((resolve, reject) => {
    const durationSec = Math.max(0.05, (endMs - startMs) / 1000);
    const startSec = Math.max(0, startMs / 1000);
    execFile('ffmpeg', [
      '-y',
      '-ss', String(startSec),
      '-t', String(durationSec),
      '-i', inputPath,
      '-ac', '1',
      '-ar', '16000',
      '-f', 'wav',
      outputPath,
    ], (err) => (err ? reject(err) : resolve()));
  });
}

async function processClipViaPython(clipPath) {
  const buffer = fs.readFileSync(clipPath);
  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: 'audio/wav' }), 'clip.wav');

  const response = await fetch(`${AI_API_URL}/api/utterance/process`, { method: 'POST', body: form });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Utterance processing service returned ${response.status}: ${body}`);
  }
  return response.json();
}

// ── POST /api/diarize ─────────────────────────────────────────────────────────
// Body: { audioBase64: string, mimeType: string }
// Full pipeline: AssemblyAI diarizes speaker clusters + timing → each utterance clip is
// sliced and re-transcribed per-utterance (real per-utterance language detection + English
// translation) → Doctor/Patient role assigned by voice match against the doctor's enrolled
// voiceprint (falls back to text-content heuristic when no voiceprint or low confidence).
router.post('/', async (req, res) => {
  const tempFiles = [];
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`[diarize] Received audio: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

    const ext = mimeType.includes('ogg') ? '.ogg' : '.webm';
    const inputPath = path.join(os.tmpdir(), `diarize-in-${crypto.randomUUID()}${ext}`);
    fs.writeFileSync(inputPath, audioBuffer);
    tempFiles.push(inputPath);

    // AssemblyAI is used purely for speaker clustering + segment timing now — its own
    // transcribed text is discarded in favor of the per-utterance re-transcription below.
    const params = {
      audio: audioBuffer,
      speaker_labels: true,
      speakers_expected: 2,
      speech_models: ['universal-2'],
      language_detection: true,
    };

    console.log('[diarize] Submitting to AssemblyAI for speaker clustering…');
    const transcript = await client.transcripts.transcribe(params);
    console.log(`[diarize] Done — status=${transcript.status}, utterances=${transcript.utterances?.length ?? 0}`);

    if (transcript.status === 'error') {
      throw new Error('AssemblyAI error: ' + transcript.error);
    }

    const rawUtterances = transcript.utterances || [];

    if (!rawUtterances.length) {
      return res.json({
        success: true,
        utterances: [],
        dualLanguageUtterances: [],
        fullText: '',
        speakerCount: 0,
        rawSpeakerCount: 0,
        reliableTwoSpeaker: false,
        diarizationMode: 'none',
        voiceIdUsed: false,
      });
    }

    // Slice + re-transcribe each utterance clip via the Python backend.
    const clipResults = [];
    for (let i = 0; i < rawUtterances.length; i++) {
      const u = rawUtterances[i];
      const clipPath = path.join(os.tmpdir(), `diarize-clip-${crypto.randomUUID()}.wav`);
      tempFiles.push(clipPath);
      try {
        await sliceClip(inputPath, u.start, u.end, clipPath);
        const result = await processClipViaPython(clipPath);
        clipResults.push(result);
      } catch (clipErr) {
        console.warn(`[diarize] Utterance ${i} processing failed, keeping AssemblyAI text as fallback:`, clipErr.message);
        clipResults.push({
          text: u.text || '',
          source_language: 'en',
          source_language_confidence: 0,
          english_text: u.text || '',
          duration_ms: u.end - u.start,
          embedding: null,
        });
      }
    }

    // Doctor/Patient role assignment: voice match first, text heuristic as fallback.
    const doctorId = req.user?.id;
    const doctorEmbedding = doctorId ? await getDoctorEmbedding(doctorId).catch(() => null) : null;

    const voiceAssignment = assignRolesByVoice(rawUtterances, clipResults, doctorEmbedding);

    const textInputUtterances = rawUtterances.map((u, i) => ({
      speaker: u.speaker,
      text: clipResults[i]?.english_text || '',
    }));
    const textAssignment = assignRolesByText(textInputUtterances);

    const voiceIdUsed = Boolean(voiceAssignment);
    const speakerMap = voiceAssignment?.speakerMap || textAssignment.speakerMap;
    const perUtteranceRole = textAssignment.perUtteranceRole; // only set in single-cluster fallback mode

    const dualLanguageUtterances = rawUtterances.map((u, i) => {
      const clip = clipResults[i] || {};
      let role = speakerMap[u.speaker] || 'unknown';
      if (!voiceIdUsed && perUtteranceRole && perUtteranceRole[i]) {
        role = perUtteranceRole[i];
      }

      return {
        sequenceNo: i + 1,
        speakerRole: role, // 'doctor' | 'patient' | 'unknown'
        rawSpeakerLabel: u.speaker || null,
        startMs: u.start,
        endMs: u.end,
        sourceLanguageCode: clip.source_language || 'en',
        sourceLanguageConfidence: clip.source_language_confidence ?? null,
        originalText: clip.text || '',
        englishText: clip.english_text || '',
        speakerMatchConfidence: voiceIdUsed ? voiceAssignment.confidence : null,
      };
    });

    const capitalize = (role) => (role === 'doctor' ? 'Doctor' : role === 'patient' ? 'Patient' : 'Unknown');

    // Backward-compatible shape for the existing frontend (speaker + text + start/end),
    // using the accurate English text rather than AssemblyAI's own transcription.
    const utterances = dualLanguageUtterances.map((u) => ({
      speaker: capitalize(u.speakerRole),
      text: u.englishText,
      start: u.startMs,
      end: u.endMs,
    }));

    const fullText = utterances.map((u) => `${u.speaker}: ${u.text}`).join('\n\n');
    const rawSpeakerCount = new Set(rawUtterances.map((u) => u.speaker)).size;
    const distinctSpeakers = new Set(utterances.map((u) => u.speaker)).size;
    const diarizationMode = voiceIdUsed ? 'voice-id' : textAssignment.mode;
    const reliableTwoSpeaker = voiceIdUsed ? true : textAssignment.reliableTwoSpeaker;

    console.log(`[diarize] Role assignment mode=${diarizationMode}, distinct speakers (mapped/raw)=${distinctSpeakers}/${rawSpeakerCount}`);

    res.json({
      success: true,
      utterances,
      dualLanguageUtterances,
      fullText,
      speakerCount: distinctSpeakers,
      rawSpeakerCount,
      reliableTwoSpeaker,
      diarizationMode,
      voiceIdUsed,
    });
  } catch (err) {
    console.error('[diarize] Error:', err.message);
    res.status(500).json({ error: err.message || 'Diarization failed' });
  } finally {
    for (const f of tempFiles) {
      fs.unlink(f, () => {});
    }
  }
});

module.exports = router;
