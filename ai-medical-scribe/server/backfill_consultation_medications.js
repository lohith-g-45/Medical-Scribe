const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./config/database');
const {
  decryptConsultationFields,
  encryptConsultationFields,
} = require('./utils/fieldEncryption');

const GROQ_MODEL = 'llama-3.1-8b-instant';

function parseArgs(argv) {
  const args = {
    overwrite: false,
    limit: 0,
    doctorId: null,
    dryRun: false,
  };

  for (const token of argv.slice(2)) {
    if (token === '--overwrite') args.overwrite = true;
    if (token === '--dry-run') args.dryRun = true;
    if (token.startsWith('--limit=')) args.limit = Number(token.split('=')[1] || 0);
    if (token.startsWith('--doctor-id=')) args.doctorId = Number(token.split('=')[1] || 0) || null;
  }

  return args;
}

function callGroq(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 300,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'Groq API error'));
          }
          const content = parsed?.choices?.[0]?.message?.content || '';
          if (!content) {
            return reject(new Error('Empty Groq response'));
          }
          resolve(content);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateMedicationsFromTranscript(transcript) {
  const systemPrompt = `You are a medical scribe AI. Extract only prescribed medicines for this visit from the consultation transcript.

Return ONLY valid JSON in exactly this format:
{
  "medications": "..."
}

Rules:
- Include medicine names and dose/frequency when present.
- Include only medications prescribed for this current visit.
- If no medication is prescribed, return "None prescribed".
- Be concise and clinical.`;

  const content = await callGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Consultation Transcript:\n${transcript}` },
  ]);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Groq did not return valid JSON for medications');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const medications = String(parsed?.medications || '').trim();
  return medications || 'None prescribed';
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

async function run() {
  const args = parseArgs(process.argv);

  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY in server/.env');
  }

  let query = `
    SELECT id, doctor_id, transcript, medications, updated_at
    FROM consultations
    ORDER BY id ASC
  `;
  const params = [];

  if (args.doctorId) {
    query = `
      SELECT id, doctor_id, transcript, medications, updated_at
      FROM consultations
      WHERE doctor_id = ?
      ORDER BY id ASC
    `;
    params.push(args.doctorId);
  }

  if (args.limit > 0) {
    query += ' LIMIT ?';
    params.push(args.limit);
  }

  const [rows] = await db.query(query, params);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Found ${rows.length} consultation(s) to evaluate.`);
  console.log(`Mode: overwrite=${args.overwrite}, dryRun=${args.dryRun}, doctorId=${args.doctorId || 'all'}, limit=${args.limit || 'none'}`);

  for (const row of rows) {
    scanned += 1;
    const decrypted = decryptConsultationFields(row);
    const transcript = String(decrypted.transcript || '').trim();
    const existingMeds = String(decrypted.medications || '').trim();

    if (!transcript) {
      skipped += 1;
      console.log(`[${row.id}] skipped: no transcript`);
      continue;
    }

    if (!args.overwrite && isFilled(existingMeds) && existingMeds.toLowerCase() !== 'not mentioned') {
      skipped += 1;
      console.log(`[${row.id}] skipped: medications already present`);
      continue;
    }

    try {
      const medications = await generateMedicationsFromTranscript(transcript);

      if (args.dryRun) {
        updated += 1;
        console.log(`[${row.id}] dry-run generated medications: ${medications}`);
        continue;
      }

      const encrypted = encryptConsultationFields({ medications });
      await db.query('UPDATE consultations SET medications = ? WHERE id = ?', [encrypted.medications, row.id]);
      updated += 1;
      console.log(`[${row.id}] updated medications: ${medications}`);
    } catch (err) {
      failed += 1;
      console.error(`[${row.id}] failed: ${err.message}`);
    }
  }

  console.log('');
  console.log('Backfill complete');
  console.log(`Scanned: ${scanned}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  });
