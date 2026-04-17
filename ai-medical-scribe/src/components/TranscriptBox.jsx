import { motion } from 'framer-motion';
import { FileText, Stethoscope, User, RefreshCw, Volume2 } from 'lucide-react';

const TranscriptBox = ({ transcript, isRecording, isTranscribing, lang = 'en', currentSpeaker, onToggleSpeaker }) => {
  const langConfig = {
    en: { live: 'Live in English', transcribing: 'Processing English transcript…' },
    kn: { live: 'Live in Kannada', transcribing: 'Converting Kannada to English with AI…' },
    hi: { live: 'Live in Hindi', transcribing: 'Converting Hindi to English with AI…' },
    ta: { live: 'Live in Tamil', transcribing: 'Converting Tamil to English with AI…' },
  };

  const selectedLang = langConfig[String(lang || 'en').toLowerCase()] || langConfig.en;
  const langLabel = isTranscribing
    ? selectedLang.transcribing
    : `${selectedLang.live} · English translation runs after stop`;

  return (
    <div className="card h-full">
      <div className="flex items-center space-x-2 mb-3">
        <FileText className="text-primary" size={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-gray-900 leading-tight">Live Transcript</h3>
            {isRecording && (
              <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-medium shrink-0">
                Preview
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{langLabel}</p>
        </div>
        {isRecording && (
          <motion.div
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center space-x-2 ml-auto"
          >
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-sm text-red-500 font-medium">REC</span>
          </motion.div>
        )}
      </div>

      {/* Live speaker indicator + manual toggle */}
      {isRecording && currentSpeaker && (
        <div className="mb-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-green-50 border-2 border-gray-300">
            <div className="flex items-center space-x-2">
              {currentSpeaker === 'Doctor' ? (
                <Stethoscope size={16} className="text-blue-600" />
              ) : (
                <User size={16} className="text-green-600" />
              )}
              <span className="text-xs text-gray-600 font-medium">Now speaking:</span>
              <span className={`text-sm font-bold ${currentSpeaker === 'Doctor' ? 'text-blue-600' : 'text-green-600'}`}>
                {currentSpeaker}
              </span>
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              >
                <Volume2 size={14} className={currentSpeaker === 'Doctor' ? 'text-blue-400' : 'text-green-400'} />
              </motion.div>
            </div>
            {onToggleSpeaker && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleSpeaker}
                title="Click to switch speaker (Space bar)"
                className="flex items-center space-x-2 bg-white text-primary hover:bg-primary hover:text-white font-semibold border-2 border-primary px-3 py-1.5 rounded-lg transition-all shadow-sm"
              >
                <RefreshCw size={14} />
                <span className="text-sm">Switch Speaker</span>
              </motion.button>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">💡 Tip: Click "Switch Speaker" button when the other person talks, or press Space bar</p>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4 h-56 overflow-y-auto border border-gray-200">
        {transcript ? (
          <div className="text-gray-700 leading-relaxed space-y-3">
            {transcript.split('\n\n').filter(line => line.trim()).map((line, index) => {
              const isDoctor = line.startsWith('Doctor:');
              const isPatient = line.startsWith('Patient:');
              
              if (isDoctor || isPatient) {
                const speaker = isDoctor ? 'Doctor' : 'Patient';
                const text = line.replace(/^(Doctor:|Patient:)\s*/, '');
                
                return (
                  <div key={index} className={`flex ${isDoctor ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      isDoctor
                        ? 'bg-blue-50 border border-blue-100 rounded-tl-sm'
                        : 'bg-green-50 border border-green-100 rounded-tr-sm'
                    }`}>
                      <div className="flex items-center space-x-1 mb-0.5">
                        {isDoctor
                          ? <Stethoscope size={10} className="text-blue-400" />
                          : <User size={10} className="text-green-400" />}
                        <span className={`text-xs font-semibold ${isDoctor ? 'text-blue-600' : 'text-green-600'}`}>
                          {speaker}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{text}</p>
                    </div>
                  </div>
                );
              }
              
              return (
                <p key={index} className="text-gray-700 text-sm">
                  {line}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-center mt-16 text-sm">
            {isRecording
              ? 'Listening... start speaking'
              : 'No transcript yet. Start recording to begin.'}
          </p>
        )}
      </div>

      {isRecording && (
        <p className="text-xs text-gray-500 mt-2 text-center bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          ⏱️ <strong>Live Preview Only</strong> - After you stop, AssemblyAI will accurately identify Doctor &amp; Patient throughout the entire conversation.
        </p>
      )}
    </div>
  );
};

export default TranscriptBox;

