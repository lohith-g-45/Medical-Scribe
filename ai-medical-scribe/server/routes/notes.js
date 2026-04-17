const express = require('express');
const router = express.Router();
const https = require('https');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

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
- plan: Treatment plan including medications, tests ordered, referrals, follow-up instructions
- medications: If medications were prescribed in the transcript, return those only (name + dose/frequency if available). If not explicitly prescribed, suggest 1-3 conservative first-line symptom-based medications. If no reasonable medication is indicated, return "None prescribed".
- Use proper medical terminology. Be concise and clinical. Do NOT include raw conversation text.`;

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

    const normalizedMeds = normalizeMedicationsValue(soap.medications);
    const inferredMeds = normalizedMeds || inferMedicationsFromText(soap, transcript);
    const suggestedMeds = inferredMeds ? '' : suggestMedicationsFromSymptoms(soap, transcript);
    const medications = normalizeMedicationsValue(inferredMeds || suggestedMeds) || 'None prescribed';

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

module.exports = router;
