import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Trash2, Pencil, Check, X, Download, Activity } from 'lucide-react';
import Header from '../components/layout/Header';
import SOAPEditor from '../components/SOAPEditor';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
import { getPatientById, deletePatient, updatePatient, updateConsultation, regenerateNotes } from '../services/api';
import { generateConsultationPDF } from '../utils/pdfGenerator';
import { formatDate } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { detectSurgeryContext } from '../utils/surgeryVideos';

const PatientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPrescription, setIsUpdatingPrescription] = useState(false);
  const [isBulkUpdatingPrescriptions, setIsBulkUpdatingPrescriptions] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadPatientData();
  }, [id]);

  const loadPatientData = async () => {
    setIsLoading(true);
    try {
      const response = await getPatientById(id);
      const rawPatient = response?.patient;
      const consultations = response?.consultations || [];

      if (!rawPatient) {
        setPatient(null);
        return;
      }

      // Build a flat list first so we can cross-reference for past history
      const rawList = consultations.map((c) => ({
        id: c.id,
        chiefComplaint: c.diagnosis || c.subjective || 'Consultation',
        date: c.visit_date,
        time: (() => {
          if (!c.created_at) return '--:--';
          const s = String(c.created_at);
          // MySQL returns "2026-03-09 14:30:00"; JSON-serialised Date is ISO with T+Z already
          const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
          const d = new Date(iso);
          return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        })(),
        doctor: c.doctor_name || 'Doctor',
        transcript: c.transcript || 'No transcript available',
        subjective: c.subjective || '',
        objective: c.objective || '',
        assessment: c.assessment || '',
        plan: c.plan || '',
        medications: c.medications || '',
      }));

      // Consultations are sorted DESC (newest first); older visits sit at higher indices
      const mappedConsultations = rawList.map((c, index) => {
        const prevVisits = rawList.slice(index + 1);
        const pastMedicalHistory = prevVisits.length > 0
          ? prevVisits
              .map((p) => `• ${formatDate(p.date)}: ${p.assessment || p.chiefComplaint || 'Visit'}`)
              .join('\n')
          : '';
        return {
          id: c.id,
          chiefComplaint: c.chiefComplaint,
          date: c.date,
          time: c.time,
          doctor: c.doctor,
          transcript: c.transcript,
          notes: {
            // Keep diagnosis/chief complaint context for legacy records where subjective may be empty.
            chiefComplaint: c.subjective || c.chiefComplaint,
            historyOfPresentIllness: c.objective,
            pastMedicalHistory,
            assessment: c.assessment,
            plan: c.plan,
            medications: c.medications || '',
          },
        };
      });

      setPatient({
        id: rawPatient.id,
        name: rawPatient.patient_name,
        age: rawPatient.age,
        gender: rawPatient.gender,
        email: rawPatient.email || 'N/A',
        phone: rawPatient.phone || 'N/A',
        address: rawPatient.address || 'N/A',
        consultations: mappedConsultations,
      });
    } catch (error) {
      console.error('Error loading patient:', error);
      setPatient(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewConsultation = (consultation) => {
    setSelectedConsultation(consultation);
    setIsModalOpen(true);
  };

  const startEdit = () => {
    setEditForm({
      patient_name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone === 'N/A' ? '' : patient.phone,
      email: patient.email === 'N/A' ? '' : patient.email,
      address: patient.address === 'N/A' ? '' : patient.address,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await updatePatient(id, editForm);
      setPatient((prev) => ({
        ...prev,
        name: editForm.patient_name,
        age: editForm.age,
        gender: editForm.gender,
        phone: editForm.phone || 'N/A',
        email: editForm.email || 'N/A',
        address: editForm.address || 'N/A',
      }));
      toast.success('Patient information updated.');
      setIsEditing(false);
    } catch (err) {
      toast.error(err?.error || 'Failed to update patient.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleView3D = (consultation) => {
    if (!hasSurgery(consultation)) {
      toast.warning('3D visualization is available only for heart-related surgical consultations.');
      return;
    }

    navigate('/visualization', {
      state: {
        notes: consultation.notes,
        transcript: consultation.transcript,
        patientInfo: {
          patientName: patient.name,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          email: patient.email,
          address: patient.address,
          dateOfVisit: consultation.date,
        },
      },
    });
  };

  const hasSurgery = (consultation) =>
    detectSurgeryContext(consultation?.notes, consultation?.transcript).hasSurgery;

  const handleAutoFillPrescription = async (consultation) => {
    if (!consultation?.id) return;

    if (!String(consultation?.transcript || '').trim()) {
      toast.warning('Transcript is required to generate prescription draft.');
      return;
    }

    setIsUpdatingPrescription(true);
    try {
      toast.info('Generating AI prescription draft from consultation...');
      const newNotes = await regenerateNotes(consultation.transcript);
      const medications = String(newNotes?.medications || '').trim() || 'None prescribed';

      await updateConsultation(consultation.id, { medications });

      setPatient((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          consultations: (prev.consultations || []).map((item) =>
            item.id === consultation.id
              ? {
                  ...item,
                  notes: {
                    ...(item.notes || {}),
                    medications,
                  },
                }
              : item
          ),
        };
      });

      setSelectedConsultation((prev) => {
        if (!prev || prev.id !== consultation.id) return prev;
        return {
          ...prev,
          notes: {
            ...(prev.notes || {}),
            medications,
          },
        };
      });

      toast.success('Prescription draft updated in this patient record.');
    } catch (error) {
      toast.error(error?.message || error?.error || 'Failed to update prescription draft.');
      console.error('Auto-fill prescription error:', error);
    } finally {
      setIsUpdatingPrescription(false);
    }
  };

  const handleAutoFillAllPrescriptions = async () => {
    const consultations = patient?.consultations || [];
    if (!consultations.length) {
      toast.warning('No consultations found for this patient.');
      return;
    }

    setIsBulkUpdatingPrescriptions(true);
    try {
      let updated = 0;

      for (const consultation of consultations) {
        const transcript = String(consultation?.transcript || '').trim();
        if (!transcript) continue;

        const notes = consultation?.notes || {};
        const existingMeds = String(notes.medications || '').trim();
        if (existingMeds && existingMeds.toLowerCase() !== 'none prescribed') {
          continue;
        }

        try {
          const regenerated = await regenerateNotes(transcript);
          const medications = String(regenerated?.medications || '').trim() || 'None prescribed';

          await updateConsultation(consultation.id, { medications });
          updated += 1;

          setPatient((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              consultations: (prev.consultations || []).map((item) =>
                item.id === consultation.id
                  ? {
                      ...item,
                      notes: {
                        ...(item.notes || {}),
                        medications,
                      },
                    }
                  : item
              ),
            };
          });

          setSelectedConsultation((prev) => {
            if (!prev || prev.id !== consultation.id) return prev;
            return {
              ...prev,
              notes: {
                ...(prev.notes || {}),
                medications,
              },
            };
          });
        } catch (err) {
          console.warn('Bulk prescription update skipped for consultation', consultation.id, err);
        }
      }

      if (updated > 0) {
        toast.success(`Updated prescriptions for ${updated} consultation${updated > 1 ? 's' : ''}.`);
      } else {
        toast.info('No consultations needed prescription updates.');
      }
    } finally {
      setIsBulkUpdatingPrescriptions(false);
    }
  };

  const handleSaveConsultationNotes = async (editedNotes) => {
    if (!selectedConsultation?.id) return;

    const payload = {
      subjective: editedNotes?.chiefComplaint || '',
      objective: editedNotes?.historyOfPresentIllness || '',
      assessment: editedNotes?.assessment || '',
      plan: editedNotes?.plan || '',
      medications: editedNotes?.medications || 'None prescribed',
    };

    await updateConsultation(selectedConsultation.id, payload);

    setPatient((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        consultations: (prev.consultations || []).map((item) =>
          item.id === selectedConsultation.id
            ? {
                ...item,
                chiefComplaint: payload.subjective || item.chiefComplaint,
                notes: {
                  ...(item.notes || {}),
                  chiefComplaint: payload.subjective,
                  historyOfPresentIllness: payload.objective,
                  assessment: payload.assessment,
                  plan: payload.plan,
                  medications: payload.medications,
                },
              }
            : item
        ),
      };
    });

    setSelectedConsultation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chiefComplaint: payload.subjective || prev.chiefComplaint,
        notes: {
          ...(prev.notes || {}),
          chiefComplaint: payload.subjective,
          historyOfPresentIllness: payload.objective,
          assessment: payload.assessment,
          plan: payload.plan,
          medications: payload.medications,
        },
      };
    });

    toast.success('Consultation notes updated.');
  };

  const handleDownloadPDF = (consultation) => {
    generateConsultationPDF({
      patientInfo: {
        patientName: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        dateOfVisit: consultation.date,
      },
      notes: consultation.notes,
      transcript: consultation.transcript,
      doctorInfo: consultation.doctor ? { name: consultation.doctor } : null,
      utterances: [],
    });
  };

  const handleDeletePatient = async () => {
    setIsDeleting(true);
    try {
      await deletePatient(id);
      toast.success('Patient record deleted successfully.');
      navigate('/patients');
    } catch (err) {
      toast.error(err?.error || 'Failed to delete patient.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return <Loading fullScreen />;
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Patient not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="Patient Details" 
        subtitle="Complete patient information and consultation history"
      />
      
      <div className="p-8">
        {/* Back Button + Delete */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/patients')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            <span>Back to Patient Records</span>
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
            >
              <Trash2 size={16} />
              <span>Delete Patient</span>
            </button>
          ) : (
            <div className="flex items-center space-x-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <span className="text-sm text-red-700 font-medium">Delete <strong>{patient.name}</strong> and all records?</span>
              <button
                onClick={handleDeletePatient}
                disabled={isDeleting}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 bg-white text-gray-700 text-sm rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient Info Card */}
          <div className="lg:col-span-1">
            <div className="card sticky top-24">
              {/* Avatar and Name */}
              <div className="text-center mb-6">
                <div className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center font-bold mx-auto mb-4" style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '2px solid #BFDBFE' }}>
                  <span className="text-xs font-semibold text-blue-400 tracking-wide">ID</span>
                  <span className="text-2xl font-extrabold">{patient.id}</span>
                </div>
                {isEditing ? (
                  <input
                    className="text-center text-xl font-bold text-gray-900 border-b-2 border-blue-400 outline-none w-full mb-1 bg-transparent"
                    value={editForm.patient_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, patient_name: e.target.value }))}
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{patient.name}</h2>
                )}
                {isEditing ? (
                  <div className="flex gap-2 justify-center mt-1">
                    <input
                      type="number"
                      placeholder="Age"
                      className="w-16 text-center border-b border-gray-300 outline-none text-sm text-gray-700 bg-transparent"
                      value={editForm.age}
                      onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))}
                    />
                    <select
                      className="border-b border-gray-300 outline-none text-sm text-gray-700 bg-transparent"
                      value={editForm.gender}
                      onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-gray-500">{patient.age} years • {patient.gender}</p>
                )}
              </div>

              {/* Edit / Save / Cancel buttons */}
              <div className="flex justify-end mb-4">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: '#2563EB' }}
                    >
                      <Check size={13} />{isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <X size={13} />Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    <Pencil size={13} />Edit Info
                  </button>
                )}
              </div>

              {/* Contact Info */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <Mail className="text-gray-400 shrink-0" size={18} />
                  {isEditing ? (
                    <input
                      type="email"
                      placeholder="Email"
                      className="flex-1 border-b border-gray-300 outline-none text-sm text-gray-700 bg-transparent"
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  ) : (
                    <span className="text-gray-700">{patient.email}</span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <Phone className="text-gray-400 shrink-0" size={18} />
                  {isEditing ? (
                    <input
                      type="tel"
                      placeholder="Phone"
                      className="flex-1 border-b border-gray-300 outline-none text-sm text-gray-700 bg-transparent"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  ) : (
                    <span className="text-gray-700">{patient.phone}</span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <MapPin className="text-gray-400 shrink-0" size={18} />
                  {isEditing ? (
                    <input
                      placeholder="Address"
                      className="flex-1 border-b border-gray-300 outline-none text-sm text-gray-700 bg-transparent"
                      value={editForm.address}
                      onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  ) : (
                    <span className="text-gray-700">{patient.address}</span>
                  )}
                </div>
              </div>

              {/* Visit Summary */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Visits</span>
                  <span className="font-semibold text-gray-900">{patient.consultations.length}</span>
                </div>
                {patient.consultations.length > 0 && (
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-500">Last Visit</span>
                    <span className="font-semibold text-gray-900">{formatDate(patient.consultations[0].date)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Consultation History */}
          <div className="lg:col-span-2">
            <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    Consultation History ({patient.consultations.length})
                  </h2>
                  <button
                    onClick={handleAutoFillAllPrescriptions}
                    disabled={isBulkUpdatingPrescriptions}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors text-sm"
                  >
                    {isBulkUpdatingPrescriptions ? 'Updating All Prescriptions...' : 'Auto-fill All Prescriptions (AI)'}
                  </button>
                </div>

              <div className="space-y-4">
                {patient.consultations.map((consultation, index) => (
                  <motion.div
                    key={consultation.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="border border-gray-200 rounded-lg p-5"
                  >
                    {/* Header */}
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900 mb-1 leading-snug">
                        {consultation.chiefComplaint}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center">
                          <Calendar size={13} className="mr-1" />
                          {formatDate(consultation.date)} at {consultation.time}
                        </span>
                        {consultation.duration && (
                          <span className="text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded">
                            {consultation.duration} min
                          </span>
                        )}
                        <span className="text-blue-600 font-medium">Dr. {consultation.doctor}</span>
                      </div>
                    </div>

                    {/* Assessment — always visible */}
                    {consultation.notes?.assessment && (
                      <div className="mb-2 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-800">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assessment</p>
                        <p>{consultation.notes.assessment}</p>
                      </div>
                    )}

                    {/* Plan — always visible */}
                    {consultation.notes?.plan && (
                      <div className="mb-3 bg-blue-50 rounded-lg px-4 py-3 text-sm text-gray-800">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Plan</p>
                        <p>{consultation.notes.plan}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleViewConsultation(consultation)}
                        className="flex items-center space-x-2 px-4 py-2 text-white rounded-lg transition-colors text-sm"
                        style={{ backgroundColor: '#2563EB' }}
                      >
                        <span>View Full Notes &amp; Transcript</span>
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(consultation)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm"
                      >
                        <Download size={15} />
                        <span>Download PDF</span>
                      </button>
                      {hasSurgery(consultation) && (
                        <button
                          onClick={() => handleView3D(consultation)}
                          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <Activity size={15} />
                          <span>3D Visualization</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Consultation Detail Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Consultation Details"
        size="xl"
      >
        {selectedConsultation && (
          <div className="space-y-6">
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleAutoFillPrescription(selectedConsultation)}
                disabled={isUpdatingPrescription}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors text-sm"
              >
                <span>{isUpdatingPrescription ? 'Updating Prescription...' : 'Auto-fill Prescription (AI)'}</span>
              </button>
              {hasSurgery(selectedConsultation) && (
                <button
                  onClick={() => handleView3D(selectedConsultation)}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Activity size={15} />
                  <span>3D Visualization</span>
                </button>
              )}
              <button
                onClick={() => handleDownloadPDF(selectedConsultation)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm"
              >
                <Download size={15} />
                <span>Download PDF Report</span>
              </button>
            </div>
            {/* Transcript */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Transcript
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-64 overflow-y-auto">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {selectedConsultation.transcript}
                </p>
              </div>
            </div>

            {/* SOAP Notes */}
            {selectedConsultation.notes && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Medical Notes
                </h3>
                <SOAPEditor
                  initialNotes={selectedConsultation.notes}
                  onSave={handleSaveConsultationNotes}
                  isEditable={true}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PatientDetail;
