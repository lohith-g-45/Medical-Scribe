import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const AI_API_BASE_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const aiApi = axios.create({
  baseURL: AI_API_BASE_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

aiApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================
// AUTH SERVICES
// ============================================

export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    // Store token
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Login failed' };
  }
};

export const register = async (userData) => {
  try {
    const response = await api.post('/auth/register', userData);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Registration failed' };
  }
};

// ============================================
// PATIENT SERVICES
// ============================================

export const fetchPatients = async (search = '', limit = 50, offset = 0) => {
  try {
    const response = await api.get('/patients', {
      params: { search, limit, offset }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to fetch patients' };
  }
};

export const searchPatients = async (query) => {
  try {
    const response = await api.get(`/patients/search/${query}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to search patients' };
  }
};

export const resolveExistingPatient = async ({ patientId, name, phone, email }) => {
  try {
    const response = await api.get('/patients/resolve', {
      params: {
        patient_id: patientId || undefined,
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to resolve existing patient' };
  }
};

export const getPatientById = async (patientId) => {
  try {
    const response = await api.get(`/patients/${patientId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to fetch patient details' };
  }
};

export const createPatient = async (patientData) => {
  try {
    const response = await api.post('/patients', patientData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to create patient' };
  }
};

export const updatePatient = async (patientId, updates) => {
  try {
    const response = await api.put(`/patients/${patientId}`, updates);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to update patient' };
  }
};

export const deletePatient = async (patientId) => {
  try {
    const response = await api.delete(`/patients/${patientId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to delete patient' };
  }
};

// ============================================
// CONSULTATION SERVICES
// ============================================

export const fetchConsultations = async (filters = {}) => {
  try {
    const response = await api.get('/consultations', { params: filters });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to fetch consultations' };
  }
};

export const getConsultationById = async (consultationId) => {
  try {
    const response = await api.get(`/consultations/${consultationId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to fetch consultation' };
  }
};

export const saveConsultation = async (consultationData) => {
  try {
    const response = await api.post('/consultations', consultationData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to save consultation' };
  }
};

export const updateConsultation = async (consultationId, updates) => {
  try {
    const response = await api.put(`/consultations/${consultationId}`, updates);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to update consultation' };
  }
};

export const deleteConsultation = async (consultationId) => {
  try {
    const response = await api.delete(`/consultations/${consultationId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to delete consultation' };
  }
};

export const getPatientHistory = async (patientId) => {
  try {
    const response = await api.get(`/consultations/patient/${patientId}/history`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: 'Failed to fetch patient history' };
  }
};

// ============================================
// LEGACY/MOCK SERVICES (for backwards compatibility)
// ============================================

export const uploadAudio = async (audioBlob, patientInfo = {}) => {
  const toBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          resolve(String(reader.result).split(',')[1]);
        } catch {
          reject({ error: 'Failed to process audio file' });
        }
      };
      reader.onerror = () => reject({ error: 'Failed to read audio file' });
      reader.readAsDataURL(blob);
    });

  try {
    // 1) Transcribe via Node backend (Groq Whisper)
    const audioBase64 = await toBase64(audioBlob);
    const transcribeResponse = await api.post('/transcribe', {
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
    });

    const transcript = transcribeResponse.data?.transcript || '';
    if (!transcript.trim()) {
      throw { error: 'Transcription returned empty text' };
    }

    // 2) Generate SOAP notes via Node backend (Groq LLM)
    const notesResponse = await api.post('/notes/generate', {
      transcript,
      patientInfo,
    });

    return {
      ...notesResponse.data,
      transcript,
    };
  } catch (error) {
    throw error.response?.data || error || { error: 'Failed to transcribe audio' };
  }
};

/**
 * Send audio blob to the Node.js backend, which calls Groq Whisper.
 * Whisper understands Kannada, English, Kanglish and always returns English.
 */
export const transcribeAudio = (audioBlob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        // FileReader result is  "data:<mime>;base64,<data>"
        const base64 = reader.result.split(',')[1];
        const response = await api.post('/transcribe', {
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
        });
        resolve(response.data);
      } catch (error) {
        reject(error.response?.data || { error: 'Failed to transcribe audio' });
      }
    };
    reader.onerror = () => reject({ error: 'Failed to read audio file' });
    reader.readAsDataURL(audioBlob);
  });
};

export const diarizeAudio = (audioBlob, lang = 'en') => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const response = await api.post('/diarize', {
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
          lang,
        });
        resolve(response.data);
      } catch (error) {
        reject(error.response?.data || { error: 'Diarization failed' });
      }
    };
    reader.onerror = () => reject({ error: 'Failed to read audio file' });
    reader.readAsDataURL(audioBlob);
  });
};

// Local SOAP note generator used as fallback when AI backend is unavailable.
// This produces AI SUGGESTIONS only — never blended into the grounded `medications`
// field, so a doctor can't mistake a guess for something actually said in the transcript.
const suggestLocalMedications = (text) => {
  const lower = String(text || '').toLowerCase();
  if (!lower) return '';

  const suggestions = [];
  const add = (item) => {
    if (!suggestions.includes(item)) suggestions.push(item);
  };

  const hasCardiacPattern = /(chest pain|angina|ischemia|ischaemia|coronary artery disease|cad|myocardial|acs|acute coronary|stemi|nstemi)/.test(lower);

  if (hasCardiacPattern) {
    add('Aspirin 75-150 mg once daily if no contraindication (AI draft for doctor confirmation)');
    add('Atorvastatin 40 mg at night (AI draft for doctor confirmation)');
    add('Sublingual nitroglycerin 0.4 mg as needed for chest pain if appropriate');
  }

  if (!hasCardiacPattern && /(fever|temperature|body ache|headache|myalgia|pain)/.test(lower)) {
    add('Paracetamol 500 mg every 6-8 hours as needed (max 3 g/day)');
  }
  if (/(allergy|cold|rhinitis|sneezing|runny nose|itching)/.test(lower)) {
    add('Cetirizine 10 mg once at night as needed');
  }
  if (/(acid|acidity|reflux|gastric|heartburn|epigastric)/.test(lower)) {
    add('Omeprazole 20 mg once daily before breakfast for 5-7 days');
  }
  if (/(nausea|vomit|vomiting)/.test(lower)) {
    add('Ondansetron 4 mg as needed for nausea/vomiting');
  }
  if (/(dry cough|cough)/.test(lower)) {
    add('Dextromethorphan-based cough syrup 5-10 ml every 8 hours as needed');
  }

  const hasUtiPattern = /(uti|urinary tract infection|dysuria|burning urination|frequency|urgency|flank pain|loin pain|pyelonephritis)/.test(lower);
  const hasRenalColicPattern = /(renal colic|kidney stone|urolithiasis|nephrolithiasis)/.test(lower);

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
};

// Grounded extraction only — pulls medication mentions that are literally present in the
// transcript text (drug name + surrounding dose/form context), no inference.
const extractLocalMedicationsFromTranscript = (text) => {
  const source = String(text || '');
  if (!source) return '';

  const dosagePattern = /\b(?:paracetamol|acetaminophen|ibuprofen|aspirin|metformin|atorvastatin|amoxicillin|azithromycin|cetirizine|omeprazole|amlodipine|clopidogrel)\b[^.\n,;]{0,80}/gi;
  const formsPattern = /\b(?:tablet|tab|capsule|cap|syrup|injection|inj\.?|ointment|cream|drops?)\b[^.\n]{0,100}/gi;

  const byName = source.match(dosagePattern) || [];
  const byForm = source.match(formsPattern) || [];
  const merged = [...byName, ...byForm].map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const deduped = [];
  for (const item of merged) {
    if (!deduped.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      deduped.push(item);
    }
  }
  return deduped.slice(0, 4).join('; ');
};

const generateNotesLocally = (transcriptText, patientInfo = {}) => {
  const lines = transcriptText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const allText = lines.map((l) => l.replace(/^(Doctor|Patient):\s*/i, '')).join(' ');

  // Extract chief complaint — first patient line or first mention of symptom
  const patientLines = lines
    .filter((l) => /^patient:/i.test(l))
    .map((l) => l.replace(/^patient:\s*/i, ''));

  const symptomKeywords = /pain|ache|tired|fatigue|fever|cough|swelling|nausea|dizzy|headache|sore|weak|short.*breath|bleeding|rash|vomit|diarrhea|constipat/i;
  const chiefComplaintLine =
    patientLines.find((l) => symptomKeywords.test(l)) ||
    patientLines[0] ||
    allText.slice(0, 120);

  // History — all patient lines joined
  const history = patientLines.length > 1
    ? patientLines.slice(1).join('. ')
    : 'Patient presented with the above complaint.';

  // Assessment — extract doctor observations
  const doctorLines = lines
    .filter((l) => /^doctor:/i.test(l))
    .map((l) => l.replace(/^doctor:\s*/i, ''));

  const assessmentLine =
    doctorLines.find((l) => /observ|diagnos|found|noted|appear|examin/i.test(l)) ||
    doctorLines[0] ||
    'Clinical assessment pending.';

  // Plan — medication/treatment mentions
  const planLine =
    doctorLines.find((l) => /prescrib|ointment|tablet|medicine|medication|referr|follow|recomm|test|blood|scan|x.ray/i.test(l)) ||
    doctorLines.slice(-1)[0] ||
    'Treatment plan to be determined.';

  const combinedText = [chiefComplaintLine, history, assessmentLine, planLine, transcriptText].join(' ');
  const groundedMedications = extractLocalMedicationsFromTranscript(transcriptText);
  const suggestedMedications = groundedMedications ? '' : suggestLocalMedications(combinedText);

  return {
    transcript: transcriptText,
    soap_notes: {
      chief_complaint: chiefComplaintLine,
      history: history,
      assessment: assessmentLine,
      plan: planLine,
      medications: groundedMedications || 'None prescribed',
      medications_suggested: suggestedMedications,
    },
    source: 'local',
  };
};

export const generateNotes = async (transcriptText, patientInfo = {}) => {
  // First try the Node.js backend (Groq LLM-powered)
  try {
    const response = await api.post('/notes/generate', {
      transcript: transcriptText,
      patientInfo,
    });
    return response.data;
  } catch (nodeError) {
    // Fallback to Python AI backend
    try {
      const response = await aiApi.post('/process-text', {
        text: transcriptText,
        speaker: 'Unknown',
        language: 'en',
      });
      return response.data;
    } catch (aiError) {
      // Final fallback: generate locally from transcript
      console.warn('All backends unavailable, generating notes locally.');
      return generateNotesLocally(transcriptText, patientInfo);
    }
  }
};

export default api;

// ============================================
// NOTES SERVICES (Legacy)
// ============================================

export const saveNotes = async (notesData) => {
  try {
    const response = await api.post('/save-notes', notesData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to save notes' };
  }
};

export const regenerateNotes = async (transcript) => {
  if (!transcript?.trim()) {
    throw { message: 'Transcript is required to regenerate notes' };
  }

  const result = await generateNotes(transcript);
  return {
    chiefComplaint: result?.soap_notes?.chief_complaint || '',
    historyOfPresentIllness: result?.soap_notes?.history || '',
    pastMedicalHistory: result?.soap_notes?.past_medical_history || '',
    assessment: result?.soap_notes?.assessment || '',
    plan: result?.soap_notes?.plan || '',
    medications: result?.soap_notes?.medications || '',
    medicationsAiSuggested: result?.soap_notes?.medications_suggested || '',
  };
};

// Explicit, opt-in AI medication suggestions — kept separate from the transcript-grounded
// `medications` field. Only call this when the doctor asks for suggestions.
export const suggestMedications = async (transcript, soapNotes = {}) => {
  try {
    const response = await api.post('/notes/suggest-medications', {
      transcript,
      soap_notes: soapNotes,
    });
    return response.data?.medications_suggested || '';
  } catch (error) {
    throw error.response?.data || { message: 'Failed to suggest medications' };
  }
};

export const updateNotes = async (noteId, updatedData) => {
  try {
    const response = await api.put(`/notes/${noteId}`, updatedData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to update notes' };
  }
};

export const getNoteById = async (noteId) => {
  try {
    const response = await api.get(`/notes/${noteId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to fetch note' };
  }
};

// ============================================
// DASHBOARD SERVICES
// ============================================

export const getDashboardStats = async () => {
  try {
    const [patientsRes, consultationsRes] = await Promise.all([
      api.get('/patients', { params: { limit: 1000, offset: 0 } }),
      api.get('/consultations', { params: { limit: 1000, offset: 0 } }),
    ]);

    const patients = patientsRes.data?.patients || [];
    const consultations = consultationsRes.data?.consultations || [];

    const now = new Date();
    // Use LOCAL date (not UTC) — MySQL stores dates in server local time (IST),
    // so comparing UTC date strings always gives wrong "today" count.
    const toLocalDate = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local TZ
    const today = toLocalDate(now);
    const weekAgo = toLocalDate(new Date(now - 7 * 86400000));

    // Convert any date value (ISO string or Date) to local YYYY-MM-DD
    const toDateStr = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val).slice(0, 10) : toLocalDate(d);
    };

    const consultationsToday = consultations.filter((c) => toDateStr(c.visit_date) === today).length;
    const consultationsThisWeek = consultations.filter((c) => {
      const d = toDateStr(c.visit_date);
      return d && d >= weekAgo;
    }).length;

    const newPatientsThisWeek = patients.filter((p) => {
      const d = toDateStr(p.created_at);
      return d && d >= weekAgo;
    }).length;

    // Follow-ups = this-week consultations for patients who have > 1 total consultation
    const visitCounts = consultations.reduce((acc, c) => {
      const k = String(c.patient_id);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const followUpsThisWeek = consultations.filter((c) => {
      const d = toDateStr(c.visit_date);
      return d && d >= weekAgo && visitCounts[String(c.patient_id)] > 1;
    }).length;

    const estimateDurationFromTranscript = (text) => {
      const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
      if (!words) return null;
      return Number((words / 130).toFixed(1));
    };

    // Avg consultation time — derive from explicit duration first, fallback to transcript estimate
    const todayConsultations = consultations.filter((c) => toDateStr(c.visit_date) === today);
    const durationSamples = todayConsultations
      .map((c) => {
        const explicit = Number(c.duration);
        if (explicit > 0) return explicit;
        return estimateDurationFromTranscript(c.transcript);
      })
      .filter((v) => Number(v) > 0);

    const averageDuration = durationSamples.length
      ? `${(durationSamples.reduce((s, v) => s + Number(v), 0) / durationSamples.length).toFixed(1)} min`
      : todayConsultations.length > 0
        ? '0.5 min'
        : '—';

    return {
      consultationsToday,
      totalPatients: patients.length,
      notesGenerated: consultationsToday,
      averageTime: averageDuration,
      consultationsThisWeek,
      newPatientsThisWeek,
      followUpsThisWeek,
    };
  } catch (error) {
    throw error.response?.data || { message: 'Failed to fetch stats' };
  }
};

export const getRecentConsultations = async (limit = 10) => {
  try {
    const response = await api.get('/consultations', {
      params: { limit },
    });

    const consultations = response.data?.consultations || [];
    return {
      success: true,
      consultations: consultations.map((c) => {
        const visitDateObj = new Date(c.visit_date || c.created_at || new Date().toISOString());

        return {
          id: c.id,
          patientId: c.patient_id,
          patientName: c.patient_name || 'Unknown Patient',
          diagnosis: c.diagnosis || 'No diagnosis recorded',
          date: c.visit_date,
          time: visitDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      }),
    };
  } catch (error) {
    throw error.response?.data || { message: 'Failed to fetch consultations' };
  }
};

// ============================================
// USER SETTINGS SERVICES
// ============================================

export const updateUserProfile = async (userId, profileData) => {
  try {
    const response = await api.put(`/users/${userId}`, profileData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to update profile' };
  }
};

export const updateUserSettings = async (userId, settings) => {
  try {
    const response = await api.put(`/users/${userId}/settings`, settings);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to update settings' };
  }
};

// ============================================
// VOICE ENROLLMENT (doctor voiceprint for speaker ID)
// ============================================

export const getVoiceEnrollmentStatus = async () => {
  try {
    const response = await api.get('/voice-enrollment');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to check voice enrollment status' };
  }
};

export const enrollVoice = (audioBlob, durationMs) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const response = await api.post('/voice-enrollment', {
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
          durationMs,
        });
        resolve(response.data);
      } catch (error) {
        reject(error.response?.data || { message: 'Failed to enroll voice' });
      }
    };
    reader.onerror = () => reject({ message: 'Failed to read audio file' });
    reader.readAsDataURL(audioBlob);
  });
};

export const deleteVoiceEnrollment = async () => {
  try {
    const response = await api.delete('/voice-enrollment');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to remove voice enrollment' };
  }
};

