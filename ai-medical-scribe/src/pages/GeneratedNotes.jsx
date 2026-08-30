import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, Download, Activity } from 'lucide-react';
import Header from '../components/layout/Header';
import SOAPEditor from '../components/SOAPEditor';
import ConsultationReport from '../components/ConsultationReport';
import { useAppContext } from '../context/AppContext';
import { regenerateNotes, saveConsultation, suggestMedications } from '../services/api';
import { useToast } from '../components/Toast';
import { generateConsultationPDF } from '../utils/pdfGenerator';
import { detectSurgeryContext } from '../utils/surgeryVideos';

const GeneratedNotes = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { generatedNotes, setGeneratedNotes, transcript, utterances, dualLanguageUtterances, clearConsultation, patientInfo, user, recordingTime } = useAppContext();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const surgery = detectSurgeryContext(generatedNotes, transcript);

  useEffect(() => {
    if (!generatedNotes) {
      navigate('/consultation');
    }
  }, [generatedNotes, navigate]);

  const estimateDurationFromTranscript = (text) => {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    if (!words) return null;
    // Clinical conversation pace approximation: 130 words/min
    const est = words / 130;
    return Number(est.toFixed(1));
  };

  const handleSaveNotes = async (notes) => {
    setIsSaving(true);
    try {
      toast.info('Saving notes...');

      const consultationTime = notes?._consultationStartTime || patientInfo?.dateOfVisit || new Date().toISOString().slice(0, 10);

      const derivedDuration = (() => {
        if (recordingTime > 0) {
          return Number((recordingTime / 60).toFixed(1));
        }
        const est = estimateDurationFromTranscript(transcript);
        if (est && est > 0) return est;
        return null;
      })();

      const payload = {
        patient_id: patientInfo?.id,
        doctor_id: user?.id,
        visit_date: consultationTime.slice(0, 10),
        transcript: transcript || '',
        subjective: notes?.chiefComplaint || '',
        objective: notes?.historyOfPresentIllness || '',
        assessment: notes?.assessment || '',
        plan: notes?.plan || '',
        diagnosis: notes?.assessment || 'General consultation',
        medications: notes?.medications || 'None prescribed',
        // AI-suggested medications are stored separately from `medications` — they were
        // never stated in the consultation and must not be presented as if they were.
        medications_ai_suggested: notes?.medicationsAiSuggested || null,
        follow_up: 'As advised by doctor',
        status: 'completed',
        // Store live duration in minutes (supports decimals like 5.2)
        duration: derivedDuration,
        // Per-utterance dual-language transcript rows (original spoken language + English)
        // from /api/diarize, persisted alongside the consultation.
        utterances: dualLanguageUtterances || [],
      };

      if (!payload.patient_id || !payload.doctor_id) {
        throw new Error('Missing patient or doctor information — please start a new consultation');
      }

      await saveConsultation(payload);
      setSaved(true);
      toast.success('Notes saved successfully!');
      
      setTimeout(() => {
        navigate('/patients');
        clearConsultation();
      }, 1500);
    } catch (error) {
      toast.error(error?.message || 'Failed to save notes');
      console.error('Save error:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = () => {
    generateConsultationPDF({
      patientInfo,
      notes: generatedNotes,
      transcript,
      doctorInfo: user ? { name: user.name, specialization: user.specialization } : null,
      utterances,
    });
  };

  const handleRegenerate = async () => {
    if (!transcript) {
      toast.warning('No transcript available to regenerate notes');
      return;
    }

    setIsRegenerating(true);
    try {
      toast.info('Regenerating notes with AI...');

      const newNotes = await regenerateNotes(transcript);
      
      setGeneratedNotes(newNotes);
      toast.success('Notes regenerated successfully!');
    } catch (error) {
      toast.error('Failed to regenerate notes');
      console.error('Regeneration error:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const openVirtualSurgery = () => {
    navigate('/virtual-coronary-planning', {
      state: {
        notes: generatedNotes,
        transcript,
        patientInfo,
      },
    });
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="AI Generated Notes" 
        subtitle="Review and edit the AI-generated SOAP notes"
      />
      
      <div className="p-8">
        <div className="max-w-5xl mx-auto">
          {/* Info Banner */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6"
          >
            <p className="text-sm text-blue-800">
              <span className="font-semibold">AI-Generated Content:</span> Please review and edit as needed. 
              These notes are generated from the consultation transcript and should be verified for accuracy.
            </p>
          </motion.div>

          {/* SOAP Editor */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SOAPEditor
              initialNotes={generatedNotes}
              onSave={handleSaveNotes}
              onRegenerate={handleRegenerate}
              onSuggestMedications={() => suggestMedications(transcript, generatedNotes)}
              isEditable={true}
            />
          </motion.div>

          {/* Consultation Report — Doctor / Patient voice breakdown */}
          {utterances && utterances.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-6"
            >
              <ConsultationReport utterances={utterances} />
            </motion.div>
          )}

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-3 mt-8"
          >
            <button
              onClick={() => navigate('/consultation')}
              className="btn-secondary"
            >
              Start New Consultation
            </button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownloadPDF}
              className="flex items-center space-x-2 px-5 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors"
            >
              <Download size={18} />
              <span>Download PDF Report</span>
            </motion.button>

            {surgery.hasSurgery && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/visualization')}
                  className="flex items-center space-x-2 px-5 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium transition-colors"
                >
                  <Activity size={18} />
                  <span>Surgery Visualization</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openVirtualSurgery}
                  className="flex items-center space-x-2 px-5 py-3 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium transition-colors"
                >
                  <Activity size={18} />
                  <span>Virtual Surgery</span>
                </motion.button>
              </>
            )}

            {!saved && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSaveNotes(generatedNotes)}
                disabled={isSaving}
                className="flex items-center space-x-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                <span>{isSaving ? 'Saving...' : 'Save & Complete'}</span>
              </motion.button>
            )}
            <button
              onClick={() => navigate('/patients')}
              className="px-6 py-3 text-primary hover:text-blue-700 font-medium"
            >
              View Patient Records
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedNotes;
