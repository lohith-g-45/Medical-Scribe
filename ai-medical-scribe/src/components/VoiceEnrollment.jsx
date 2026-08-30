import { useEffect, useRef, useState } from 'react';
import { Mic, CheckCircle, RefreshCw } from 'lucide-react';
import { getVoiceEnrollmentStatus, enrollVoice } from '../services/api';
import { useToast } from './Toast';

const TARGET_SECONDS = 10;
const MIN_SECONDS = 4;
const ENROLLMENT_PROMPT =
  'Please read this sentence aloud: "I am recording a short voice sample so the system can recognize my voice during consultations."';

const VoiceEnrollment = () => {
  const toast = useToast();
  const [status, setStatus] = useState(null); // { enrolled, enrolledAt }
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const refreshStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await getVoiceEnrollmentStatus();
      setStatus(data);
    } catch (error) {
      // Voice ID may be unavailable on this deployment — treat as "not enrolled", not an error toast.
      setStatus({ enrolled: false });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const supportedType = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const durationMs = seconds * 1000;

        if (seconds < MIN_SECONDS) {
          toast.warning(`Recording too short — please record at least ${MIN_SECONDS} seconds.`);
          return;
        }

        setIsSubmitting(true);
        try {
          await enrollVoice(blob, durationMs);
          toast.success('Voice enrolled successfully.');
          await refreshStatus();
        } catch (error) {
          toast.error(error?.error || error?.message || 'Failed to enroll voice');
        } finally {
          setIsSubmitting(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          if (next >= TARGET_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      toast.error('Microphone access denied. Please allow microphone permission and try again.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Enroll your voice once so the system can tell your voice apart from the patient's during a
        consultation — this is what makes Doctor/Patient labeling reliable regardless of what either
        of you says.
      </p>

      {isLoadingStatus ? (
        <div className="text-sm text-gray-400">Checking enrollment status...</div>
      ) : (
        <>
          {status?.enrolled && (
            <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <CheckCircle size={18} className="text-green-600" />
              <span>
                Voice enrolled{status.enrolledAt ? ` on ${new Date(status.enrolledAt).toLocaleDateString()}` : ''}.
              </span>
            </div>
          )}

          {!status?.enrolled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              No voice enrolled yet. Speaker labeling will fall back to conversation-content
              guessing until you enroll.
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-700 mb-4">{ENROLLMENT_PROMPT}</p>

            <div className="flex items-center space-x-4">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isSubmitting}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  isRecording ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-primary text-white hover:bg-blue-700'
                }`}
              >
                <Mic size={18} />
                <span>
                  {isSubmitting
                    ? 'Enrolling...'
                    : isRecording
                      ? `Recording... ${seconds}s (stop early or wait for ${TARGET_SECONDS}s)`
                      : status?.enrolled
                        ? 'Re-record voice sample'
                        : 'Record voice sample'}
                </span>
              </button>

              {status?.enrolled && !isRecording && (
                <RefreshCw size={16} className="text-gray-400" />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VoiceEnrollment;
