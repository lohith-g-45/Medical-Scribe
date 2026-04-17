import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RefreshCw, Edit2 } from 'lucide-react';

const SOAPEditor = ({ initialNotes, onSave, onRegenerate, isEditable = true }) => {
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
    }
  }, [initialNotes]);

  const handleChange = (key, value) => {
    setNotes(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(notes);
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
          <div key={section.key} className="card">
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
        ))}
      </div>
    </div>
  );
};

export default SOAPEditor;
