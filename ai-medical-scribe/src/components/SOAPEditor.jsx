import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RefreshCw, Edit2, Sparkles, Check, X } from 'lucide-react';

const SOAPEditor = ({ initialNotes, onSave, onRegenerate, onSuggestMedications, isEditable = true }) => {
  const [notes, setNotes] = useState(initialNotes || {
    chiefComplaint: '',
    historyOfPresentIllness: '',
    pastMedicalHistory: '',
    assessment: '',
    plan: '',
    medications: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // AI-suggested medications are tracked separately from `notes.medications` — they are
  // NOT something the transcript said, and must never be silently merged into that field.
  const [suggestedMeds, setSuggestedMeds] = useState(initialNotes?.medicationsAiSuggested || '');
  const [isSuggesting, setIsSuggesting] = useState(false);

  const sections = [
    { key: 'chiefComplaint', label: 'Chief Complaint', rows: 2 },
    { key: 'historyOfPresentIllness', label: 'History of Present Illness', rows: 4 },
    { key: 'pastMedicalHistory', label: 'Past Medical History', rows: 4 },
    { key: 'assessment', label: 'Assessment', rows: 5 },
    { key: 'plan', label: 'Plan', rows: 5 },
    { key: 'medications', label: 'Prescribed Medications', rows: 3 },
  ];

  useEffect(() => {
    if (initialNotes) {
      setNotes((prev) => ({ ...prev, ...initialNotes }));
      if (initialNotes.medicationsAiSuggested !== undefined) {
        setSuggestedMeds(initialNotes.medicationsAiSuggested || '');
      }
    }
  }, [initialNotes]);

  const handleChange = (key, value) => {
    setNotes(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({ ...notes, medicationsAiSuggested: suggestedMeds });
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (onRegenerate) {
      await onRegenerate();
    }
  };

  const handleSuggestMedications = async () => {
    if (!onSuggestMedications) return;
    setIsSuggesting(true);
    try {
      const suggestion = await onSuggestMedications();
      setSuggestedMeds(suggestion || '');
    } catch (error) {
      console.error('Error suggesting medications:', error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleConfirmSuggestion = () => {
    const current = String(notes.medications || '').trim();
    const isEmpty = !current || current.toLowerCase() === 'none prescribed';
    const merged = isEmpty ? suggestedMeds : `${current}; ${suggestedMeds}`;
    setNotes((prev) => ({ ...prev, medications: merged }));
    setSuggestedMeds('');
  };

  const handleDismissSuggestion = () => {
    setSuggestedMeds('');
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">SOAP Notes</h2>
        <div className="flex space-x-3">
          {isEditable && !isEditing && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit2 size={18} />
              <span>Edit</span>
            </motion.button>
          )}
          
          {onRegenerate && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRegenerate}
              className="flex items-center space-x-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              <RefreshCw size={18} />
              <span>Regenerate with AI</span>
            </motion.button>
          )}
          
          {isEditing && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} />
              <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* SOAP Sections */}
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                {section.label}
              </h3>
              {isEditing ? (
                <textarea
                  value={notes[section.key] || ''}
                  onChange={(e) => handleChange(section.key, e.target.value)}
                  rows={section.rows}
                  className="input-field font-mono text-sm resize-none"
                  placeholder={`Enter ${section.label.toLowerCase()}...`}
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {notes[section.key] || (
                      <span className="text-gray-400">
                        {section.key === 'medications' ? 'None prescribed' : 'No data available'}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* AI-suggested medications — visually distinct, never merged into the
                grounded "Prescribed Medications" text above until explicitly confirmed. */}
            {section.key === 'medications' && onSuggestMedications && (
              <div className="mt-3">
                {!suggestedMeds && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSuggestMedications}
                    disabled={isSuggesting}
                    className="flex items-center space-x-2 px-4 py-2 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    <span>{isSuggesting ? 'Thinking...' : 'Suggest possible medications'}</span>
                  </motion.button>
                )}

                {suggestedMeds && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Sparkles size={16} className="text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">
                        AI-Suggested Medications — Not Confirmed
                      </span>
                    </div>
                    <p className="text-sm text-amber-900 mb-3">{suggestedMeds}</p>
                    <p className="text-xs text-amber-700 mb-3">
                      These were not mentioned in the consultation — they are AI suggestions based on reported symptoms. Review before adding to the record.
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleConfirmSuggestion}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                      >
                        <Check size={14} />
                        <span>Confirm & Add</span>
                      </button>
                      <button
                        onClick={handleDismissSuggestion}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-white text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50"
                      >
                        <X size={14} />
                        <span>Dismiss</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SOAPEditor;
