const express = require('express');
const router = express.Router();
const { AssemblyAI } = require('assemblyai');

const ASSEMBLY_API_KEY = process.env.ASSEMBLYAI_API_KEY || '76934c15462643afabddc5a5ca871a13';

const client = new AssemblyAI({ apiKey: ASSEMBLY_API_KEY });

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
  if (score.doctor > score.patient) return 'Doctor';
  if (score.patient > score.doctor) return 'Patient';
  return null;
}

function mapUtterancesToDoctorPatient(rawUtterances = []) {
  const uniqueRawSpeakers = [...new Set(rawUtterances.map((u) => u.speaker).filter(Boolean))];

  // Normal diarization path: map distinct speaker labels to Doctor/Patient only.
  if (uniqueRawSpeakers.length >= 2) {
    const speakerStats = new Map(
      uniqueRawSpeakers.map((label) => [
        label,
        {
          turns: 0,
          doctorScore: 0,
          patientScore: 0,
        },
      ])
    );

    rawUtterances.forEach((u) => {
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

    const firstRoleHint = rawUtterances
      .map((u) => ({ speaker: u.speaker, role: inferRoleFromText(u.text) }))
      .find((x) => x.role && firstTwo.includes(x.speaker));

    // If both speaker intent scores are nearly tied, trust the first clear role cue.
    if (Math.abs(diffA - diffB) <= 1 && firstRoleHint) {
      if (firstRoleHint.role === 'Doctor') {
        doctorLabel = firstRoleHint.speaker;
        patientLabel = firstTwo.find((s) => s !== doctorLabel) || patientLabel;
      } else {
        patientLabel = firstRoleHint.speaker;
        doctorLabel = firstTwo.find((s) => s !== patientLabel) || doctorLabel;
      }
    }

    const speakerMap = {};
    speakerMap[doctorLabel] = 'Doctor';
    speakerMap[patientLabel] = 'Patient';

    // Any extra diarization labels are folded into Doctor/Patient by their own intent.
    uniqueRawSpeakers.forEach((label) => {
      if (speakerMap[label]) return;
      const stats = speakerStats.get(label);
      const d = (stats?.doctorScore || 0) - (stats?.patientScore || 0);
      speakerMap[label] = d >= 0 ? 'Doctor' : 'Patient';
    });

    return {
      mapped: rawUtterances.map((u) => ({
        speaker: speakerMap[u.speaker] || 'Doctor',
        text: u.text,
        start: u.start,
        end: u.end,
      })),
      rawSpeakerCount: uniqueRawSpeakers.length,
      reliableTwoSpeaker: true,
      diarizationMode: 'assemblyai',
    };
  }

  // Fallback path: AssemblyAI returned a single speaker label.
  // Infer roles turn-by-turn from utterance semantics, then alternate as backup.
  let lastRole = 'Doctor';
  const mapped = rawUtterances.map((u, index) => {
    let role = inferRoleFromText(u.text);
    if (!role) {
      role = index === 0 ? 'Doctor' : (lastRole === 'Doctor' ? 'Patient' : 'Doctor');
    }
    lastRole = role;

    return {
      speaker: role,
      text: u.text,
      start: u.start,
      end: u.end,
    };
  });

  return {
    mapped,
    rawSpeakerCount: uniqueRawSpeakers.length,
    reliableTwoSpeaker: false,
    diarizationMode: 'heuristic-fallback',
  };
}

// ── POST /api/diarize ─────────────────────────────────────────────────────────
// Body: { audioBase64: string, mimeType: string, lang: 'en' | 'kn' | 'hi' | 'ta' }
// Returns: { success, utterances: [{speaker, text, start, end}], fullText, speakerCount }
router.post('/', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', lang = 'en' } = req.body;
    const normalizedLang = String(lang || 'en').trim().toLowerCase();
    const supportedLangCodes = new Set(['en', 'kn', 'hi', 'ta']);

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`[diarize] Received audio: ${(audioBuffer.length / 1024).toFixed(1)} KB, lang=${lang}`);

    // Use the official SDK — handles upload + polling correctly
    const params = {
      audio: audioBuffer,
      speaker_labels: true,
      speakers_expected: 2,
      speech_models: ['universal-2'], // Use array format with universal-2 model
    };

    // Use explicit language when supported to avoid mixed-script auto-detection.
    params.language_code = supportedLangCodes.has(normalizedLang) ? normalizedLang : 'en';

    console.log('[diarize] Submitting to AssemblyAI…');
    const transcript = await client.transcripts.transcribe(params);
    console.log(`[diarize] Done — status=${transcript.status}, utterances=${transcript.utterances?.length ?? 0}`);

    if (transcript.status === 'error') {
      throw new Error('AssemblyAI error: ' + transcript.error);
    }

    const rawUtterances = transcript.utterances || [];
    const {
      mapped: mappedUtterances,
      rawSpeakerCount,
      reliableTwoSpeaker,
      diarizationMode,
    } = mapUtterancesToDoctorPatient(rawUtterances);

    const fullText = mappedUtterances.map((u) => `${u.speaker}: ${u.text}`).join('\n\n');
    const distinctSpeakers = new Set(mappedUtterances.map((u) => u.speaker)).size;

    console.log(`[diarize] Distinct speakers detected (mapped/raw): ${distinctSpeakers}/${rawSpeakerCount}`);
    res.json({
      success: true,
      utterances: mappedUtterances,
      fullText,
      speakerCount: distinctSpeakers,
      rawSpeakerCount,
      reliableTwoSpeaker,
      diarizationMode,
    });

  } catch (err) {
    console.error('[diarize] Error:', err.message);
    res.status(500).json({ error: err.message || 'Diarization failed' });
  }
});

module.exports = router;
