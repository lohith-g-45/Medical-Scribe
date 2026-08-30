import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, User, ArrowRight, UserCircle, Stethoscope } from 'lucide-react';
import Header from '../components/layout/Header';
import ConsultationReport from '../components/ConsultationReport';
import { useAppContext } from '../context/AppContext';
import { createPatient, generateNotes, uploadAudio, saveConsultation, transcribeAudio, diarizeAudio, resolveExistingPatient } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';

const CONSULTATION_LANGUAGES = {
  en: {
    code: 'en',
    label: 'English',
    display: 'English',
    locale: 'en-IN',
    badge: 'English mode',
  },
  kn: {
    code: 'kn',
    label: 'Kannada',
    display: 'ಕನ್ನಡ (Kannada)',
    locale: 'kn-IN',
    badge: 'Kannada mode',
  },
  hi: {
    code: 'hi',
    label: 'Hindi',
    display: 'हिंदी (Hindi)',
    locale: 'hi-IN',
    badge: 'Hindi mode',
  },
  ta: {
    code: 'ta',
    label: 'Tamil',
    display: 'தமிழ் (Tamil)',
    locale: 'ta-IN',
    badge: 'Tamil mode',
  },
};

const CONSULTATION_LANGUAGE_LIST = [
  CONSULTATION_LANGUAGES.en,
  CONSULTATION_LANGUAGES.kn,
  CONSULTATION_LANGUAGES.hi,
  CONSULTATION_LANGUAGES.ta,
];

function getLanguageConfig(code) {
  return CONSULTATION_LANGUAGES[String(code || 'en').toLowerCase()] || CONSULTATION_LANGUAGES.en;
}

const StartConsultation = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    transcript,
    setTranscript,
    utterances,
    setUtterances,
    setDualLanguageUtterances,
    isRecording,
    setIsRecording,
    setGeneratedNotes,
    patientInfo,
    setPatientInfo,
    audioBlob,
    setAudioBlob,
    user,
    setRecordingTime,
  } = useAppContext();

  // Step management
  const [currentStep, setCurrentStep] = useState(1); // 1 = Patient Form, 2 = Recording

  // Patient form state
  const [formData, setFormData] = useState({
    patientId: '',
    patientName: '',
    age: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    dateOfVisit: new Date().toISOString().split('T')[0],
  });

  // Track when recording actually started
  const consultationStartTimeRef = useRef(null);
  const [formErrors, setFormErrors] = useState({});

  // Returning patient detection
  const [returningPatient, setReturningPatient] = useState(null); // existing patient from DB
  const [showReturningBanner, setShowReturningBanner] = useState(false);
  const [isCheckingExistingPatient, setIsCheckingExistingPatient] = useState(false);
  const lookupSeqRef = useRef(0);

  // Recording/transcription state
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isDiarizing, setIsDiarizing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef(0);
  // Language the doctor selects before recording: 'en' = English, 'kn' = Kannada
  const [consultationLang, setConsultationLang] = useState('en');
  const consultationLangRef = useRef('en'); // accessible inside async callbacks
  
  // Speaker tracking from backend live pipeline
  const [currentSpeaker, setCurrentSpeaker] = useState('Doctor'); // 'Doctor' or 'Patient'
  const [liveUtterances, setLiveUtterances] = useState([]); // [{ speaker, text, atSec, source }]
  const lastSpeakerRef = useRef('Doctor');
  const liveTranscriptRef = useRef(''); // mirrors transcript state — readable inside onstop closure
  const speakerPauseTimerRef = useRef(null); // pause-based auto speaker switch
  const recentLiveLinesRef = useRef([]); // dedupe cache
  const wsStreamingActiveRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);   // noise-filter AudioContext
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  const getWsUrl = () => {
    const aiBase = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000/api';
    const wsBase = aiBase.replace(/^http/i, 'ws').replace(/\/api\/?$/, '');
    return `${wsBase}/ws/consult-${Date.now()}`;
  };

  const connectWebSocket = (url, timeoutMs = 7000) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Live transcription service is not reachable'));
    }, timeoutMs);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
    };
  });

  // Toggle speaker after a pause (or on manual tap)
  const PAUSE_SWITCH_MS = 3000; // 3s silence → auto-switch (increased for better accuracy)

  const toggleSpeaker = () => {
    const next = lastSpeakerRef.current === 'Doctor' ? 'Patient' : 'Doctor';
    lastSpeakerRef.current = next;
    setCurrentSpeaker(next);
  };

  const normalizeLineForDedupe = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const cleanLiveText = (text) => {
    let out = String(text || '').trim();
    out = out.replace(/\s+/g, ' ');
    out = out.replace(/\b(hello\s+doctor)\b(?:\s+\1\b)+/gi, '$1');
    out = out.replace(/\b([a-z][a-z']+)\b(?:\s+\1\b)+/gi, '$1');
    if (!out) return '';
    out = out.charAt(0).toUpperCase() + out.slice(1);
    if (!/[.!?]$/.test(out)) out += '.';
    return out;
  };

  const shouldSkipLiveLine = (speaker, text) => {
    const norm = normalizeLineForDedupe(text);
    if (!norm) return true;

    const now = Date.now();
    recentLiveLinesRef.current = recentLiveLinesRef.current.filter((x) => now - x.ts < 12000);

    const duplicate = recentLiveLinesRef.current.some((x) =>
      x.speaker === speaker && (x.norm === norm || x.norm.includes(norm) || norm.includes(x.norm))
    );

    if (duplicate) return true;

    recentLiveLinesRef.current.push({ speaker, norm, ts: now });
    return false;
  };

  const appendTranscriptLine = (speaker, text, source = 'live') => {
    if (!text?.trim()) {
      return;
    }

    const normalized = cleanLiveText(text);
    if (!normalized) return;
    if (shouldSkipLiveLine(speaker, normalized)) return;

    const line = `${speaker}: ${normalized}`;
    liveTranscriptRef.current = liveTranscriptRef.current?.trim()
      ? `${liveTranscriptRef.current}\n\n${line}`
      : line;

    setLiveUtterances((prev) => [
      ...prev,
      {
        speaker,
        text: normalized,
        atSec: recordingSecondsRef.current,
        source,
      },
    ]);

    setTranscript((prev) => {
      if (!prev?.trim()) {
        return line;
      }
      return `${prev}\n\n${line}`;
    });
  };

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        recordingSecondsRef.current = next;
        return next;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const closeWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      wsRef.current.close();
    }
    wsRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopTimer();
      closeWebSocket();
      stopBrowserTranscription();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Keyboard shortcut: Space bar to toggle speaker during recording
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only allow space bar toggle when recording and not typing in an input
      if (e.code === 'Space' && isRecording && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleSpeaker();
        toast.info(`Switched to ${lastSpeakerRef.current === 'Doctor' ? 'Patient' : 'Doctor'}`, { duration: 1000 });
      }
    };

    if (isRecording) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [isRecording]);

  const normalizeDigits = (val) => String(val || '').replace(/\D/g, '');

  const applyReturningPatient = (p, matchedBy = 'record', lastConsultation = null) => {
    setReturningPatient({
      ...p,
      lastConsultation: lastConsultation || null,
    });
    setShowReturningBanner(true);
    setFormData((prev) => ({
      ...prev,
      patientId: String(p.id || prev.patientId || ''),
      patientName: p.patient_name || prev.patientName,
      age: prev.age || p.age || '',
      gender: prev.gender || p.gender || '',
      phone: p.phone || prev.phone || '',
      email: p.email || prev.email || '',
      address: p.address || prev.address || '',
    }));
    return matchedBy;
  };

  const lookupExistingPatient = async (data, { silent = true } = {}) => {
    const name = data?.patientName?.trim();
    const phone = normalizeDigits(data?.phone);
    const email = String(data?.email || '').trim().toLowerCase();
    const patientId = String(data?.patientId || '').trim();

    if (!patientId && !phone && !email) {
      setReturningPatient(null);
      setShowReturningBanner(false);
      return null;
    }

    const seq = ++lookupSeqRef.current;
    if (!silent) setIsCheckingExistingPatient(true);

    try {
      const resolved = await resolveExistingPatient({ patientId, name, phone, email });
      if (seq !== lookupSeqRef.current) return null;

      const found = resolved?.patient || null;
      if (found) {
        applyReturningPatient(
          found,
          resolved?.matchedBy || 'record',
          resolved?.lastConsultation || null
        );
      } else {
        setReturningPatient(null);
        setShowReturningBanner(false);
      }
      return found;
    } catch (_) {
      return null;
    } finally {
      if (!silent && seq === lookupSeqRef.current) setIsCheckingExistingPatient(false);
    }
  };

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // Debounced existing patient detection while typing
  useEffect(() => {
    const hasLookupInput =
      String(formData.patientId || '').trim() ||
      normalizeDigits(formData.phone).length >= 7 ||
      String(formData.email || '').trim().length >= 5;

    if (!hasLookupInput) {
      setReturningPatient(null);
      setShowReturningBanner(false);
      return;
    }

    const t = setTimeout(() => {
      lookupExistingPatient(formData, { silent: true });
    }, 350);

    return () => clearTimeout(t);
  }, [formData.patientId, formData.phone, formData.email, formData.patientName]);

  // Validate patient form
  const validateForm = () => {
    const errors = {};
    if (!formData.patientName.trim()) errors.patientName = 'Patient name is required';
    if (!formData.age || formData.age < 0 || formData.age > 150) errors.age = 'Valid age is required';
    if (!formData.gender) errors.gender = 'Gender is required';
    return errors;
  };

  // Continue with returning patient (use existing record)
  const handleContinueReturning = () => {
    const p = returningPatient;
    setPatientInfo({
      ...formData,
      id: p.id,
      patientName: p.patient_name,
      age: formData.age || p.age,
      gender: formData.gender || p.gender,
      phone: p.phone || formData.phone,
      email: p.email || formData.email,
      address: p.address || formData.address,
      doctorId: user?.id,
      isReturning: true,
    });
    setCurrentStep(2);
    toast.success(`Welcome back, ${p.patient_name}! Continuing from previous records.`);
  };

  // Submit patient form
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fill in all required fields');
      return;
    }

    // Always do one final lookup on submit so existing patients are never duplicated.
    const resolvedPatient = await lookupExistingPatient(formData, { silent: false });
    if (resolvedPatient) {
      handleContinueReturning();
      return;
    }

    try {
      const patientPayload = {
        patient_name: formData.patientName,
        age: Number(formData.age),
        gender: formData.gender,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        medical_history: '',
      };

      const created = await createPatient(patientPayload);
      setPatientInfo({ ...formData, id: created.patient_id, doctorId: user?.id });
      setCurrentStep(2);
      toast.success('Patient information saved. Ready to start consultation.');
    } catch (error) {
      const fallbackId = `local-${Date.now()}`;
      setPatientInfo({ ...formData, id: fallbackId, doctorId: user?.id, localOnly: true });
      setCurrentStep(2);
      toast.warning('Database unavailable. Continuing in local mode.');
    }
  };

  // Live transcript: language-aware recognition.
  // English mode  → en-IN, shows live English/Kanglish.
  // Kannada mode  → kn-IN, shows live Kannada script; Whisper translates after stop.
  const speechRecognitionRef = useRef(null);
  const speechRecognitionKnRef = useRef(null); // unused, kept for cleanup safety
  const browserLiveEnabledRef = useRef(false);

  const makeSpeechRecognition = (lang) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      // Cancel any pending speaker-switch — speech is still happening
      if (speakerPauseTimerRef.current) {
        clearTimeout(speakerPauseTimerRef.current);
        speakerPauseTimerRef.current = null;
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          // Keep browser recognition as fallback when WS stream has not started.
          if (text && !wsStreamingActiveRef.current) {
            appendTranscriptLine(lastSpeakerRef.current, text, 'browser');
          }

          // After this utterance ends, start a silence timer.
          // If nobody speaks for PAUSE_SWITCH_MS, auto-switch speaker.
          speakerPauseTimerRef.current = setTimeout(() => {
            speakerPauseTimerRef.current = null;
            toggleSpeaker();
          }, PAUSE_SWITCH_MS);
        }
      }
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { recognition.start(); } catch (_) {}
      }
    };

    try { recognition.start(); } catch (_) {}
    return recognition;
  };

  const startBrowserTranscription = () => {
    const langConfig = getLanguageConfig(consultationLangRef.current);
    speechRecognitionRef.current = makeSpeechRecognition(langConfig.locale);
    browserLiveEnabledRef.current = Boolean(speechRecognitionRef.current);
    return browserLiveEnabledRef.current;
  };

  const stopBrowserTranscription = () => {
    if (speakerPauseTimerRef.current) {
      clearTimeout(speakerPauseTimerRef.current);
      speakerPauseTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (speechRecognitionKnRef.current) {
      try { speechRecognitionKnRef.current.stop(); } catch (_) {}
      speechRecognitionKnRef.current = null;
    }
    browserLiveEnabledRef.current = false;
  };

  // Start recording and speech recognition
  const handleStartRecording = async () => {
    setTranscript('');
    setUtterances([]);
    setDualLanguageUtterances([]);
    setLiveUtterances([]);
    setAudioBlob(null);
    setHasRecorded(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    setCurrentSpeaker('Doctor');
    lastSpeakerRef.current = 'Doctor';
    liveTranscriptRef.current = '';
    recentLiveLinesRef.current = [];
    wsStreamingActiveRef.current = false;
    consultationLangRef.current = consultationLang; // snapshot selected lang for callbacks
    consultationStartTimeRef.current = new Date().toISOString();

    // Try WebSocket (AI backend), fall back to browser speech recognition
    let wsConnected = false;
    try {
      const ws = await connectWebSocket(getWsUrl());
      wsRef.current = ws;
      wsConnected = true;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'pipeline_result') {
            return;
          }

          const speaker = payload.speaker || lastSpeakerRef.current || 'Unknown';
          const text = payload.translated_text || payload.original_text || '';
          const selectedLang = String(consultationLangRef.current || 'en').toLowerCase();
          const useWsTranscriptText = selectedLang === 'en';

          if (text.trim()) {
            if (useWsTranscriptText) {
              wsStreamingActiveRef.current = true;
            }
            lastSpeakerRef.current = speaker;
            setCurrentSpeaker(speaker);

            // For non-English modes, keep browser locale transcript as the live preview source
            // to avoid mixed-script WS output. WS is still used for speaker hints.
            if (useWsTranscriptText) {
              appendTranscriptLine(speaker, text, 'ws');
            }
          }
        } catch (err) {
          console.error('Invalid WS message:', err);
        }
      };

      ws.onerror = () => {
        toast.error('Live transcription connection dropped. Stop and restart recording.');
      };

      ws.onclose = () => {
        if (isRecording) {
          toast.warning('Live transcription disconnected. Please start recording again.');
        }
      };
    } catch (wsError) {
      console.warn('AI backend unavailable, falling back to browser transcription:', wsError.message);
    }

    // Start microphone recording regardless of WebSocket status
    try {
      // Optimized settings for capturing multiple speakers in same room:
      // - Disable all audio processing that might filter out quieter voices
      // - Use higher sample rate for better quality
      // - Allow automatic gain to boost quieter speakers
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true, // Enable to boost quieter speaker
          channelCount: 1,
          sampleRate: { ideal: 48000 }, // Higher sample rate for better quality
          sampleSize: 16,
        },
      });

      // The raw stream goes directly to MediaRecorder so both voices are preserved
      // in the audio blob sent for diarization. No DSP chain — compression/filters
      // destroy the quieter (patient) voice before AssemblyAI can separate speakers.
      const recordingStream = mediaStreamRef.current;

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const supportedType = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m));
      mediaRecorderRef.current = supportedType
        ? new MediaRecorder(recordingStream, { mimeType: supportedType })
        : new MediaRecorder(recordingStream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const chunkBytes = await event.data.arrayBuffer();
            wsRef.current.send(chunkBytes);
          }
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setHasRecorded(true);
        // Save actual recording duration (seconds) for use in GeneratedNotes
        setRecordingTime(recordingSeconds);
        stopBrowserTranscription();
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        // Try AssemblyAI speaker diarization first (works for both English and Kannada)
        setIsDiarizing(true);
        try {
          const result = await diarizeAudio(blob, consultationLangRef.current);
          const hasTwoSpeakers = Boolean(result?.reliableTwoSpeaker);

          if (hasTwoSpeakers && result?.fullText?.trim()) {
            // Doctor + Patient correctly identified (by voice match, or text heuristic as fallback)
            setTranscript(result.fullText.trim());
            setUtterances(result.utterances || []);
            setDualLanguageUtterances(result.dualLanguageUtterances || []);
            const via = result?.voiceIdUsed ? 'voice match' : 'conversation content';
            toast.success(`Speaker diarization complete — Doctor and Patient identified by ${via}.`);
            return;
          }

          if (result?.fullText?.trim() && !hasTwoSpeakers) {
            // Low-confidence split (or single-speaker) — keep the live preview, don't overwrite
            const mode = result?.diarizationMode === 'heuristic-fallback' ? 'low-confidence split' : 'single-speaker';
            toast.warning(`Diarization returned ${mode}. Keeping your live preview transcript.`);
            // Still save utterances for context but do NOT overwrite transcript
            setUtterances(result.utterances || []);
            setDualLanguageUtterances(result.dualLanguageUtterances || []);
            return;
          }

          // AssemblyAI returned empty — keep live transcript if we have one
          if (liveTranscriptRef.current?.trim()) {
            toast.info('Using your live transcript — AssemblyAI returned no result.');
            return;
          }
          toast.warning('Diarization returned empty result. Falling back to transcription.');
        } catch (diarizeErr) {
          console.warn('Diarization failed:', diarizeErr);
          // Keep the live speaker-labeled transcript if it exists — don't overwrite with Groq
          if (liveTranscriptRef.current?.trim()) {
            toast.info('AssemblyAI unavailable — your live Doctor/Patient transcript has been kept.');
            return;
          }
          toast.warning('Speaker diarization unavailable. Falling back to transcription.');
        } finally {
          setIsDiarizing(false);
        }

        // Groq Whisper fallback — only runs if there is NO live transcript at all
        if (liveTranscriptRef.current?.trim()) {
          return;
        }
        setIsTranscribing(true);
        try {
          const result = await transcribeAudio(blob);
          if (result?.transcript?.trim()) {
            setTranscript(result.transcript.trim());
            toast.success('Transcript ready. Review and generate notes.');
          } else {
            toast.warning('AI transcription returned empty. Using browser preview if available.');
          }
        } catch (err) {
          console.warn('Whisper transcription failed, keeping live preview:', err);
          toast.warning('AI transcription unavailable. Using browser live preview.');
        } finally {
          setIsTranscribing(false);
        }
      };

      // Capture audio more frequently (every 500ms) for better continuous recording
      // This helps AssemblyAI detect speaker changes throughout the conversation
      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      startTimer();

      // Always run browser speech recognition for immediate live transcript preview.
      // WebSocket diarization (if available) still updates speaker identity in parallel.
      const browserLiveStarted = startBrowserTranscription();

      if (!wsConnected) {
        toast.warning('AI backend unavailable. Using browser speech recognition for transcription.');
      } else if (!browserLiveStarted) {
        toast.warning('Live preview is not supported in this browser. Final transcript after stop will still work.');
      }
    } catch (error) {
      console.error('Error starting media recorder:', error);
      const isPermissionError =
        error?.name === 'NotAllowedError' ||
        error?.name === 'SecurityError' ||
        error?.name === 'NotFoundError';

      toast.error(
        isPermissionError
          ? 'Microphone access denied. Please allow microphone permission in your browser and try again.'
          : 'Failed to access microphone. Please check your microphone is connected and try again.'
      );
      setIsRecording(false);
      stopTimer();
      closeWebSocket();
    }
  };

  // Stop recording and speech recognition
  const handleStopRecording = () => {
    console.log('Stopping recording...');
    setIsRecording(false);
    stopTimer();
    stopBrowserTranscription();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    closeWebSocket();
    toast.info('Recording stopped. Transcribing with AI...');
  };

  const handleGenerateNotes = async () => {
    if ((!transcript || transcript.trim().length === 0) && !audioBlob) {
      toast.warning('No consultation input available. Please record first.');
      return;
    }

    setIsGenerating(true);
    try {
      toast.info('Generating AI medical notes...');

      const result = transcript?.trim()
        ? await generateNotes(transcript, patientInfo)
        : await uploadAudio(audioBlob, patientInfo);

      const backendTranscript = result?.transcript || transcript;
      if (backendTranscript) {
        setTranscript(backendTranscript);
      }

      const soap = result?.soap_notes || {};
      const mappedNotes = {
        chiefComplaint: soap.chief_complaint || '',
        historyOfPresentIllness: soap.history || '',
        pastMedicalHistory: soap.past_medical_history || '',
        assessment: soap.assessment || '',
        plan: soap.plan || '',
        medications: soap.medications || 'None prescribed',
        // Only populated by the offline local fallback today — never blended into
        // `medications` above, since it was never actually said in the consultation.
        medicationsAiSuggested: soap.medications_suggested || '',
      };

      // If patient was in local-only mode, save them to DB now before navigating
      if (String(patientInfo?.id).startsWith('local-')) {
        try {
          const created = await createPatient({
            patient_name: patientInfo.patientName,
            age: Number(patientInfo.age),
            gender: patientInfo.gender,
            phone: patientInfo.phone || null,
            email: patientInfo.email || null,
            address: patientInfo.address || null,
            medical_history: '',
          });
          setPatientInfo((prev) => ({ ...prev, id: created.patient_id, localOnly: false }));
        } catch (e) {
          console.warn('Could not promote local patient to DB:', e);
        }
      }

      setGeneratedNotes({
        ...mappedNotes,
        _consultationStartTime: consultationStartTimeRef.current || new Date().toISOString(),
      });

      if (result?.source === 'local') {
        toast.success('Medical notes generated (AI offline). Review and click Save & Complete.');
      } else {
        toast.success('Medical notes generated! Review and click Save & Complete.');
      }

      // Navigate to notes page
      setTimeout(() => {
        navigate('/notes');
      }, 500);
    } catch (error) {
      toast.error(error?.error || 'Failed to generate notes');
      console.error('Note generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Go back to patient form
  const handleEditPatient = () => {
    setCurrentStep(1);
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Start Consultation" 
        subtitle={currentStep === 1 ? 'Enter patient information to begin' : 'Record patient consultation and generate AI medical notes'}
      />
      
      <div className="p-8">
        <div className="max-w-7xl mx-auto">


          {/* Step 1: Patient Information Form */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="card">
                <div className="flex items-center space-x-3 mb-6">
                  <User className="text-primary" size={28} />
                  <h2 className="text-2xl font-bold text-gray-900">Patient Information</h2>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-6">
                  {/* Patient Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Patient ID (if existing)
                    </label>
                    <input
                      type="text"
                      name="patientId"
                      value={formData.patientId}
                      onChange={handleFormChange}
                      className="input-field"
                      placeholder="Enter patient ID to fetch existing record"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Patient Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="patientName"
                      value={formData.patientName}
                      onChange={handleFormChange}
                      className={`input-field ${formErrors.patientName ? 'border-red-500' : ''}`}
                      placeholder="Enter patient's full name"
                    />
                    {formErrors.patientName && (
                      <p className="mt-1 text-sm text-red-500">{formErrors.patientName}</p>
                    )}
                  </div>

                  {/* Age and Gender */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Age <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleFormChange}
                        className={`input-field ${formErrors.age ? 'border-red-500' : ''}`}
                        placeholder="Age"
                        min="0"
                        max="150"
                      />
                      {formErrors.age && (
                        <p className="mt-1 text-sm text-red-500">{formErrors.age}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="gender"
                        value={formData.gender}
                        onChange={handleFormChange}
                        className={`input-field ${formErrors.gender ? 'border-red-500' : ''}`}
                      >
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      {formErrors.gender && (
                        <p className="mt-1 text-sm text-red-500">{formErrors.gender}</p>
                      )}
                    </div>
                  </div>

                  {/* Phone and Email */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleFormChange}
                        className="input-field"
                        placeholder="e.g. +91 9876543210"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleFormChange}
                        className="input-field"
                        placeholder="patient@email.com"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address / Location
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleFormChange}
                      className="input-field"
                      placeholder="City, State or full address"
                    />
                  </div>

                  {/* Returning Patient Banner */}
                  {showReturningBanner && returningPatient && (
                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                      <p className="text-sm font-semibold text-blue-800 mb-1">🔄 Returning Patient Found!</p>
                      <p className="text-sm text-blue-700 mb-3">
                        <strong>{returningPatient.patient_name}</strong> (Age: {returningPatient.age}, {returningPatient.gender}) is already in your records.
                        Continue as a returning patient to add this consultation to their history.
                      </p>
                      {returningPatient.lastConsultation?.summary && (
                        <div className="mb-3 rounded-lg border border-blue-200 bg-white p-3">
                          <p className="text-xs font-semibold text-blue-700 mb-1">
                            Last consultation
                            {returningPatient.lastConsultation.visitDate
                              ? ` (${returningPatient.lastConsultation.visitDate})`
                              : ''}
                          </p>
                          <p className="text-sm text-slate-700">
                            {returningPatient.lastConsultation.summary}
                          </p>
                        </div>
                      )}
                      <div className="flex space-x-3">
                        <button
                          type="button"
                          onClick={handleContinueReturning}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                        >
                          ✓ Continue as Returning Patient
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowReturningBanner(false); setReturningPatient(null); }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                        >
                          Register as New Patient
                        </button>
                      </div>
                    </div>
                  )}

                  {isCheckingExistingPatient && (
                    <div className="text-xs text-gray-500">Checking existing patient record...</div>
                  )}

                  {/* Date of Visit */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date of Visit
                    </label>
                    <input
                      type="date"
                      name="dateOfVisit"
                      value={formData.dateOfVisit}
                      onChange={handleFormChange}
                      className="input-field"
                    />
                  </div>

                  {/* Submit Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isCheckingExistingPatient}
                    className="w-full btn-primary flex items-center justify-center space-x-2"
                  >
                    <span>Continue to Consultation</span>
                    <ArrowRight size={20} />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* Step 2: Recording Interface */}
          {currentStep === 2 && (
            <>
              {/* Patient Info Summary */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-7xl mx-auto"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <div>
                      <span className="text-sm text-blue-600 font-medium">Patient:</span>
                      <span className="ml-2 text-gray-900 font-semibold">{patientInfo?.patientName}</span>
                    </div>
                    <div>
                      <span className="text-sm text-blue-600 font-medium">Age:</span>
                      <span className="ml-2 text-gray-900">{patientInfo?.age} years</span>
                    </div>
                    <div>
                      <span className="text-sm text-blue-600 font-medium">Gender:</span>
                      <span className="ml-2 text-gray-900">{patientInfo?.gender}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleEditPatient}
                    className="text-sm text-primary hover:text-blue-700 font-medium"
                  >
                    Edit
                  </button>
                </div>
              </motion.div>

              {/* Main Grid */}
              <div className="grid grid-cols-1 gap-6 mb-6">
                {/* Audio Recorder with custom controls */}
                <div className="card text-center">
                  <div className="mb-6">
                    <div className="text-5xl font-bold text-gray-900 mb-2">
                      {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-sm text-gray-500">
                      {isRecording ? 'Recording in progress...' : 'Ready to record'}
                    </p>
                  </div>

                  {/* Waveform Visualization when recording */}
                  {isRecording && (
                    <div className="flex items-center justify-center space-x-1 mb-6 h-16">
                      {[...Array(20)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            height: [20, Math.random() * 60 + 20, 20],
                          }}
                          transition={{
                            duration: 0.3,
                            repeat: Infinity,
                            delay: i * 0.05,
                          }}
                          className="w-1 bg-primary rounded-full"
                        />
                      ))}
                    </div>
                  )}

                  {/* Language Toggle — only show before recording starts */}
                  {!isRecording && !hasRecorded && (
                    <div className="flex items-center justify-center mb-5">
                      <div className="w-full max-w-sm">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 text-left">
                          Consultation language
                        </label>
                        <select
                          value={consultationLang}
                          onChange={(e) => setConsultationLang(e.target.value)}
                          className="input-field"
                        >
                          {CONSULTATION_LANGUAGE_LIST.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.display}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Active language indicator while recording */}
                  {isRecording && (
                    <div className="flex justify-center mb-4">
                      {(() => {
                        const langCfg = getLanguageConfig(consultationLang);
                        const nonEnglish = langCfg.code !== 'en';
                        return (
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        nonEnglish
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {nonEnglish
                          ? `${langCfg.badge} - Whisper will translate after stop`
                          : langCfg.badge}
                      </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Main Record Button */}
                  <div className="flex justify-center mb-6">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-colors"
                      style={{ backgroundColor: isRecording ? '#ef4444' : '#2563EB' }}
                    >
                      {isRecording ? (
                        <motion.div
                          animate={{ scale: [1, 0.9, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="w-8 h-8 bg-white rounded"
                        />
                      ) : (
                        <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                        </svg>
                      )}
                    </motion.button>
                  </div>

                  {/* Auto Speaker Detection Indicator */}
                  {isRecording && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center mb-4"
                    >
                      <div className="inline-flex items-center space-x-3 px-5 py-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-full border-2 border-gray-200">
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [1, 0.7, 1]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity
                          }}
                        >
                          {currentSpeaker === 'Doctor' ? (
                            <Stethoscope className="text-blue-600" size={20} />
                          ) : (
                            <UserCircle className="text-green-600" size={20} />
                          )}
                        </motion.div>
                        <span className="text-sm font-medium text-gray-600">Auto-detected:</span>
                        <span className={`text-sm font-bold ${
                          currentSpeaker === 'Doctor' ? 'text-blue-600' : 'text-green-600'
                        }`}>
                          {currentSpeaker}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        💡 Use \"Switch Speaker\" button in transcript or press <kbd className="px-1 py-0.5 bg-white rounded border text-gray-700\">Space</kbd> when speaker changes
                      </p>
                    </motion.div>
                  )}

                  {/* Instructions */}
                  <p className="text-sm text-gray-600 text-center">
                    {isRecording
                      ? '🎙️ Recording... Use the Switch button for accurate speaker labels'
                      : 'Click the microphone to start recording'}
                  </p>
                </div>
                
                {/* Transcribing overlay */}
                {isTranscribing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center space-x-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-blue-700 text-sm"
                  >
                    <Loading size="sm" />
                    <span>Groq Whisper AI is translating your Kannada / Kanglish / English speech to English… please wait.</span>
                  </motion.div>
                )}
              </div>

              {/* Consultation Report — shown after AssemblyAI diarization */}
              {hasRecorded && utterances.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6"
                >
                  <ConsultationReport utterances={utterances} />
                </motion.div>
              )}

              {/* Generate Notes Button */}
              {hasRecorded && (transcript || audioBlob) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGenerateNotes}
                    disabled={isGenerating || isRecording || isTranscribing || isDiarizing}
                    className="btn-primary inline-flex items-center space-x-3 text-lg px-8 py-4 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <Loading size="sm" />
                        <span>Generating Notes...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={24} />
                        <span>Generate Medical Notes with AI</span>
                      </>
                    )}
                  </motion.button>
                  
                  {isGenerating && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-4 text-gray-600"
                    >
                      AI is analyzing the consultation with patient {patientInfo?.patientName}...
                    </motion.p>
                  )}
                </motion.div>
              )}

              {/* Instructions */}
              {!hasRecorded && !isRecording && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="card max-w-2xl mx-auto mt-6"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    How to use:
                  </h3>
                  <ol className="space-y-2 text-gray-600">
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">1.</span>
                      <span>Click the microphone button to start recording</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">2.</span>
                      <span>Choose language from dropdown and speak in <strong>English</strong>, <strong>Kannada</strong>, <strong>Hindi</strong>, or <strong>Tamil</strong>.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">3.</span>
                      <span>The <em>Live Transcript</em> is an approximate preview. Regional language words may appear as transliteration — that is normal.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">4.</span>
                      <span>After you <strong>stop recording</strong>, AI will produce an accurate <strong>English transcript</strong> automatically replacing the preview.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">5.</span>
                      <span>Click the stop button when finished</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">5.</span>
                      <span>Review the transcript and click "Generate Medical Notes"</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold text-primary mr-2">6.</span>
                      <span>AI will analyze the conversation and create structured SOAP notes for patient {patientInfo?.patientName}</span>
                    </li>
                  </ol>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StartConsultation;
