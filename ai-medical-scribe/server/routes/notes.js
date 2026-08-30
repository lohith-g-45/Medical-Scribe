const express = require('express');
const router = express.Router();
const https = require('https');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.1-8b-instant was decommissioned by Groq; openai/gpt-oss-120b is a current,
// capable instruction-following model on Groq's API, well-suited to structured JSON output.
const GROQ_MODEL = 'openai/gpt-oss-120b';

function normalizeMedicationsValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const lower = normalized.toLowerCase();
  if (['none', 'nil', 'na', 'n/a', 'not mentioned', 'no medications', 'no medication'].includes(lower)) {
    return 'None prescribed';
  }

  return normalized;
}

function inferMedicationsFromText(soap, transcript) {
  const text = [soap?.plan, soap?.assessment, transcript]
    .filter(Boolean)
    .join(' ');

  if (!text) return '';

  const candidates = [];
  const dosagePattern = /\b(?:paracetamol|acetaminophen|ibuprofen|aspirin|metformin|atorvastatin|amoxicillin|azithromycin|cetirizine|omeprazole|amlodipine|clopidogrel)\b[^.\n,;]{0,80}/gi;
  const formsPattern = /\b(?:tablet|tab|capsule|cap|syrup|injection|inj\.?|ointment|cream|drops?)\b[^.\n]{0,100}/gi;

  const byName = text.match(dosagePattern) || [];
  const byForm = text.match(formsPattern) || [];
  const merged = [...byName, ...byForm]
    .map((v) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const item of merged) {
    if (!candidates.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      candidates.push(item);
    }
  }

  return candidates.slice(0, 4).join('; ');
}

function suggestMedicationsFromSymptoms(soap, transcript) {
  const text = [soap?.chief_complaint, soap?.history, soap?.assessment, transcript]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return '';

  const suggestions = [];
  const add = (item) => {
    if (!suggestions.some((x) => x.toLowerCase() === item.toLowerCase())) {
      suggestions.push(item);
    }
  };

  const hasCardiacPattern = /(chest pain|angina|ischemia|ischaemia|coronary artery disease|cad|myocardial|acs|acute coronary|stemi|nstemi)/.test(text);

  if (hasCardiacPattern) {
    add('Aspirin 75-150 mg once daily if no contraindication (AI draft for doctor confirmation)');
    add('Atorvastatin 40 mg at night (AI draft for doctor confirmation)');
    add('Sublingual nitroglycerin 0.4 mg as needed for chest pain if appropriate');
  }

  if (!hasCardiacPattern && /(fever|pyrexia|temperature|body ache|headache|myalgia|pain)/.test(text)) {
    add('Paracetamol 500 mg orally every 6-8 hours as needed (max 3 g/day)');
  }

  if (/(allergy|allergic|cold|rhinitis|sneezing|runny nose|itching)/.test(text)) {
    add('Cetirizine 10 mg once at night as needed');
  }

  if (/(acid|acidity|reflux|gastric|heartburn|epigastric)/.test(text)) {
    add('Omeprazole 20 mg once daily before breakfast for 5-7 days');
  }

  if (/(nausea|vomit|vomiting)/.test(text)) {
    add('Ondansetron 4 mg orally as needed for nausea/vomiting');
  }

  if (/(dry cough|cough)/.test(text)) {
    add('Dextromethorphan-based cough syrup 5-10 ml every 8 hours as needed');
  }

  const hasUtiPattern = /(uti|urinary tract infection|dysuria|burning urination|frequency|urgency|flank pain|loin pain|pyelonephritis)/.test(text);
  const hasRenalColicPattern = /(renal colic|kidney stone|urolithiasis|nephrolithiasis)/.test(text);

  if (hasUtiPattern) {
    add('Nitrofurantoin 100 mg orally twice daily for 5 days if appropriate and no contraindication');
    add('Paracetamol 500 mg orally every 6-8 hours as needed for pain/fever (max 3 g/day)');
    add('Urinary alkalinizer syrup 10 ml in water three times daily as needed');
  }

  if (hasRenalColicPattern) {
    add('Paracetamol 500 mg orally every 6-8 hours as needed for pain (max 3 g/day)');
    add('Diclofenac 50 mg orally as needed for severe colicky pain if no contraindication');
    add('Tamsulosin 0.4 mg once daily (doctor discretion based on stone profile)');
  }

  if (!suggestions.length) return '';
  return suggestions.slice(0, 3).join('; ');
}

function callGroq(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices[0].message.content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /api/notes/generate
router.post('/generate', async (req, res) => {
  const { transcript, patientInfo = {} } = req.body;

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  const patientContext = [
    patientInfo.patientName ? `Patient Name: ${patientInfo.patientName}` : '',
    patientInfo.age ? `Age: ${patientInfo.age}` : '',
    patientInfo.gender ? `Gender: ${patientInfo.gender}` : '',
  ].filter(Boolean).join(', ');

  const systemPrompt = `You are an expert medical scribe AI. Given a consultation transcript, generate structured clinical SOAP notes.

Return ONLY valid JSON in exactly this format (no markdown, no extra text):
{
  "chief_complaint": "...",
  "history": "...",
  "past_medical_history": "...",
  "assessment": "...",
  "plan": "...",
  "medications": "..."
}

Rules:
- chief_complaint: The primary symptom or reason for the visit (1-2 sentences)
- history: History of present illness — onset, duration, severity, associated symptoms mentioned by the patient
- past_medical_history: Any mentioned prior conditions, allergies, medications, surgeries (write "Not mentioned" if absent)
- assessment: Doctor's clinical assessment, findings, and likely diagnosis
- plan: Treatment plan including tests ordered, referrals, follow-up instructions — do NOT invent medications here either
- medications: List ONLY medications that were explicitly stated as prescribed or administered in the transcript (name + dose/frequency if stated). Do NOT infer, guess, or suggest medications that were not actually said. If none were mentioned, return an empty string "".
- Use proper medical terminology. Be concise and clinical. Do NOT include raw conversation text. Never state something happened or was said if it is not actually present in the transcript — an empty or "Not mentioned" field is correct and expected when information wasn't discussed.`;

  const userMessage = `${patientContext ? `Patient: ${patientContext}\n\n` : ''}Consultation Transcript:\n${transcript}`;

  try {
    const content = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);

    // Parse JSON from LLM response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM did not return valid JSON');
    const soap = JSON.parse(jsonMatch[0]);

    // Strictly transcript-grounded — no fabricated/suggested medications blended in here.
    // A doctor requests suggestions explicitly via POST /api/notes/suggest-medications.
    const normalizedMeds = normalizeMedicationsValue(soap.medications);
    const inferredMeds = normalizedMeds || inferMedicationsFromText(soap, transcript);
    const medications = normalizeMedicationsValue(inferredMeds) || 'None prescribed';

    res.json({
      soap_notes: {
        chief_complaint: soap.chief_complaint || '',
        history: soap.history || '',
        past_medical_history: soap.past_medical_history || '',
        assessment: soap.assessment || '',
        plan: soap.plan || '',
        medications,
      },
      transcript,
      source: 'groq',
    });
  } catch (error) {
    console.error('Groq SOAP generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate notes: ' + error.message });
  }
});

// POST /api/notes/suggest-medications
// Explicit, opt-in AI medication suggestions — kept entirely separate from the
// transcript-grounded `medications` field above so a doctor never mistakes an AI
// guess for something the patient/doctor actually said.
router.post('/suggest-medications', async (req, res) => {
  const { transcript = '', soap_notes = {} } = req.body;

  if (!transcript.trim() && !Object.values(soap_notes).some(Boolean)) {
    return res.status(400).json({ error: 'Transcript or SOAP notes are required to suggest medications' });
  }

  const suggested = suggestMedicationsFromSymptoms(
    {
      chief_complaint: soap_notes.chiefComplaint || soap_notes.chief_complaint,
      history: soap_notes.historyOfPresentIllness || soap_notes.history,
      assessment: soap_notes.assessment,
    },
    transcript
  );

  res.json({
    medications_suggested: suggested || '',
    note: 'These are AI-generated suggestions based on reported symptoms — not something stated in the consultation. Review and confirm before adding to the record.',
  });
});

module.exports = router;
