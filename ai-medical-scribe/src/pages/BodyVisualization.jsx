import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Activity, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import AnatomyViewer from '../components/AnatomyViewer';
import { SEVERITY_META, parseBodyCondition } from '../utils/medicalBodyParser';
import { detectSurgeryContext } from '../utils/surgeryVideos';

const SURGERY_OPTIONS = ['CABG', 'VALVE', 'STENT', 'PACEMAKER'];

const SURGERY_INFO = {
  CABG: {
    title: 'CABG (Bypass Surgery)',
    description: 'Shows blocked coronary flow in red and bypass graft perfusion in green.',
  },
  VALVE: {
    title: 'Valve Surgery',
    description: 'Simulates restricted valve opening before surgery and wider opening after repair/replacement.',
  },
  STENT: {
    title: 'Stent Placement',
    description: 'Visualizes narrowed artery with staged stent expansion and restored lumen width.',
  },
  PACEMAKER: {
    title: 'Pacemaker',
    description: 'Shows pacemaker device pulses and lead activity synchronized with heartbeat animation.',
  },
};

function inferSurgeryFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/pacemaker|bradycardia|heart block|arrhythmia/.test(t)) return 'PACEMAKER';
  if (/stent|angioplasty|pci/.test(t)) return 'STENT';
  if (/valve|aortic stenosis|mitral regurgitation|valvular/.test(t)) return 'VALVE';
  if (/cabg|bypass|coronary graft/.test(t)) return 'CABG';
  return 'CABG';
}

function normalizeSurgeryType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SURGERY_OPTIONS.includes(normalized) ? normalized : null;
}

export default function BodyVisualization() {
  const navigate = useNavigate();
  const location = useLocation();
  const { generatedNotes, patientInfo: ctxPatientInfo, transcript: ctxTranscript } = useAppContext();
  const [stage, setStage] = useState('before');
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [selectedSurgery, setSelectedSurgery] = useState('CABG');
  const [heartAnimationPlaying, setHeartAnimationPlaying] = useState(true);
  const [surgerySource, setSurgerySource] = useState('manual');
  const [analyzingSurgery, setAnalyzingSurgery] = useState(false);

  // Prefer navigation state (from PatientDetail) over live AppContext so that
  // existing saved records can also be visualised.
  const stateNotes = location.state?.notes || generatedNotes;
  const stateTranscript = location.state?.transcript || ctxTranscript;
  const patientInfo = location.state?.patientInfo || ctxPatientInfo;

  const rawText = [stateNotes?.assessment, stateNotes?.plan, stateTranscript].filter(Boolean).join(' ').toLowerCase();
  const inferredSeverity = /critical|life-threatening|cardiogenic shock|stemi|severe/.test(rawText)
    ? 3
    : /mild|stable|early/.test(rawText)
      ? 1
      : 2;

  const hasBlockageSignal = /blockage|blocked artery|coronary artery disease|cad|stenosis|occlusion/.test(rawText);
  const hasReducedFlowSignal = /reduced blood flow|ischemia|ischemic|poor perfusion|decreased flow/.test(rawText);

  const [showBlockage, setShowBlockage] = useState(true);
  const [showReducedFlow, setShowReducedFlow] = useState(true);

  const coronaryBranch = useMemo(() => {
    if (/lad|left anterior descending|anterior wall/.test(rawText)) return 'lad';
    if (/rca|right coronary|inferior wall/.test(rawText)) return 'rca';
    if (/lcx|left circumflex|circumflex|lateral wall/.test(rawText)) return 'lcx';
    return 'rca';
  }, [rawText]);

  const parsedCondition = useMemo(
    () => parseBodyCondition(stateNotes || {}, stateTranscript || ''),
    [stateNotes, stateTranscript]
  );

  const condition = {
    ...parsedCondition,
    // Keep severity inferred from full transcript context for consistent visual intensity.
    severityLevel: inferredSeverity,
    visualFlags: {
      blocked: showBlockage && hasBlockageSignal,
      reducedFlow: showReducedFlow && hasReducedFlowSignal,
      branch: coronaryBranch,
    },
    patientGender: patientInfo?.gender || patientInfo?.sex || '',
  };
  const cardiacSignal = /heart|cardiac|coronary|stent|angioplasty|cabg|bypass|valve|myocard/i.test(rawText);
  const surgeryContext = detectSurgeryContext(stateNotes, stateTranscript);
  const isCardiacSurgeryCase = Boolean(surgeryContext?.hasSurgery && cardiacSignal);
  const useHeartOnly = isCardiacSurgeryCase;
  const surgeryInfo = SURGERY_INFO[selectedSurgery] || SURGERY_INFO.CABG;
  const meta = SEVERITY_META[condition.severityLevel] || SEVERITY_META[3];
  const demoDurationMs = 3200;
  const demoLabels = [
    'Baseline anatomy view',
    'Clinical highlight view',
    'Focused severity view',
    'Post-treatment recovery',
  ];

  const isAfter = stage === 'after';

  useEffect(() => {
    if (!demoPlaying) return;

    if (demoStep === 0) {
      setStage('before');
      setShowReducedFlow(false);
      setShowBlockage(false);
    } else if (demoStep === 1) {
      setStage('before');
      setShowReducedFlow(Boolean(hasReducedFlowSignal));
      setShowBlockage(false);
    } else if (demoStep === 2) {
      setStage('before');
      setShowReducedFlow(Boolean(hasReducedFlowSignal));
      setShowBlockage(Boolean(hasBlockageSignal));
    } else {
      setStage('after');
      setShowReducedFlow(false);
      setShowBlockage(false);
    }

    if (demoStep >= 3) {
      const stopTimer = window.setTimeout(() => {
        setDemoPlaying(false);
      }, demoDurationMs);
      return () => window.clearTimeout(stopTimer);
    }

    const timer = window.setTimeout(() => {
      setDemoStep((s) => Math.min(s + 1, 3));
    }, demoDurationMs);

    return () => window.clearTimeout(timer);
  }, [demoPlaying, demoStep, demoDurationMs, hasReducedFlowSignal, hasBlockageSignal]);

  useEffect(() => {
    if (!useHeartOnly) return;
    const inferred = inferSurgeryFromText(rawText);
    setSelectedSurgery(inferred);
    setSurgerySource('notes');
  }, [useHeartOnly, rawText]);

  useEffect(() => {
    if (!useHeartOnly) return;

    const controller = new AbortController();
    const analyze = async () => {
      try {
        setAnalyzingSurgery(true);
        const flaskBase = import.meta.env.VITE_FLASK_API_URL || 'http://localhost:8000';
        const response = await fetch(`${flaskBase}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: stateNotes || {},
            transcript: stateTranscript || '',
            text: rawText,
          }),
          signal: controller.signal,
        });

        if (!response.ok) return;
        const data = await response.json();
        const recommended = normalizeSurgeryType(data?.recommended_surgery);
        if (recommended) {
          setSelectedSurgery(recommended);
          setSurgerySource('backend');
        }
      } catch {
        // Keep inferred/manual selection when backend is unavailable.
      } finally {
        if (!controller.signal.aborted) setAnalyzingSurgery(false);
      }
    };

    analyze();
    return () => controller.abort();
  }, [useHeartOnly, stateNotes, stateTranscript, rawText]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/60 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back to Notes</span>
        </button>
        <div className="flex items-center gap-2 text-white">
          <Activity size={18} className="text-blue-400" />
          <span className="font-semibold">Body Visualization</span>
        </div>
        {patientInfo?.name && (
          <span className="text-sm text-slate-400">{patientInfo.name}</span>
        )}
      </header>

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>
        {/* ── LEFT: 3D canvas ── */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <AnatomyViewer
            condition={condition}
            stage={stage}
            heartOnly={useHeartOnly}
            autoRotate={true}
            selectedSurgery={selectedSurgery}
            animationsEnabled={heartAnimationPlaying}
          />

          {/* Stage label overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <span
              className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg ${
                isAfter
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}
            >
              {isAfter ? 'Post-Treatment' : 'Pre-Treatment'}
            </span>
          </div>

          {/* Drag hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-xs pointer-events-none select-none">
            Drag to rotate · Scroll to zoom
          </div>

          {demoPlaying && (
            <div className="absolute top-4 right-4 bg-slate-900/75 border border-cyan-500/40 text-cyan-200 text-xs px-3 py-1.5 rounded-full">
              Demo Playing: {demoLabels[demoStep]}
            </div>
          )}
        </div>

        {/* ── RIGHT: Info panel ── */}
        <aside className="w-80 flex flex-col bg-slate-900/80 backdrop-blur border-l border-slate-700/50 overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-5 space-y-5">

            {/* Stage toggle */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Treatment Stage
              </p>
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                <button
                  onClick={() => setStage('before')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    !isAfter
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Before
                </button>
                <button
                  onClick={() => setStage('after')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    isAfter
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  After
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Video Demo Mode
              </p>

              <div className="text-sm text-slate-300">
                {demoLabels[demoStep]}
              </div>

              <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${((demoStep + 1) / demoLabels.length) * 100}%` }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (demoPlaying) {
                      setDemoPlaying(false);
                      return;
                    }
                    setDemoPlaying(true);
                  }}
                  className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
                >
                  {demoPlaying ? 'Pause Demo' : 'Play Demo'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDemoStep(0);
                    setDemoPlaying(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
                >
                  Replay
                </button>
              </div>
            </div>

            {/* Condition card */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden">
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ background: isAfter ? '#14532d' : meta.bgColor + '33' }}
              >
                <span className="text-2xl">{condition.bodyPartIcon}</span>
                <div>
                  <p className="font-bold text-white capitalize">
                    {condition.bodyPartName}
                  </p>
                  <p className="text-xs" style={{ color: isAfter ? '#86efac' : meta.textColor }}>
                    {isAfter ? 'Recovered' : meta.label}
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm text-slate-300">
                {!isAfter && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} style={{ color: meta.color }} />
                    <span>Severity: <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span></span>
                  </div>
                )}
                {isAfter && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle size={14} />
                    <span className="font-medium">Treatment complete</span>
                  </div>
                )}
                <div className="flex items-start gap-2 text-slate-400">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{isAfter ? condition.afterDescription : condition.beforeDescription}</span>
                </div>
              </div>
            </div>

            {/* Treatment info */}
            {condition.treatmentType && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Treatment Plan
                </p>
                <p className="text-sm text-slate-200 capitalize font-medium">
                  {condition.treatmentType}
                </p>
              </div>
            )}

            {useHeartOnly && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Cardiac Procedure View
                </p>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Procedure</label>
                  <select
                    value={selectedSurgery}
                    onChange={(e) => {
                      const next = normalizeSurgeryType(e.target.value) || 'CABG';
                      setSelectedSurgery(next);
                      setSurgerySource('manual');
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm"
                  >
                    {SURGERY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHeartAnimationPlaying((v) => !v)}
                    className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
                  >
                    {heartAnimationPlaying ? 'Pause Animation' : 'Play Animation'}
                  </button>
                </div>

                <div className="text-xs text-slate-400">
                  Source: <span className="font-semibold text-slate-300 uppercase">{surgerySource}</span>
                  {analyzingSurgery && <span className="ml-2 text-cyan-300">Analyzing...</span>}
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-100">{surgeryInfo.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{surgeryInfo.description}</p>
                </div>
              </div>
            )}

            {(condition.bodyPart === 'chest' || hasBlockageSignal || hasReducedFlowSignal) && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Heart Overlay Controls
              </p>

              <label className={`flex items-center justify-between gap-3 text-sm ${hasReducedFlowSignal ? 'text-slate-200' : 'text-slate-500'}`}>
                <span>Reduced blood-flow overlay</span>
                <input
                  type="checkbox"
                  checked={showReducedFlow && hasReducedFlowSignal}
                  disabled={!hasReducedFlowSignal}
                  onChange={(e) => setShowReducedFlow(e.target.checked)}
                  className="h-4 w-4 accent-cyan-500 disabled:opacity-40"
                />
              </label>

              <label className={`flex items-center justify-between gap-3 text-sm ${hasBlockageSignal ? 'text-slate-200' : 'text-slate-500'}`}>
                <span>Coronary blockage marker</span>
                <input
                  type="checkbox"
                  checked={showBlockage && hasBlockageSignal}
                  disabled={!hasBlockageSignal}
                  onChange={(e) => setShowBlockage(e.target.checked)}
                  className="h-4 w-4 accent-red-500 disabled:opacity-40"
                />
              </label>

              <div className="text-xs text-slate-400">
                Coronary branch focus: <span className="font-semibold text-slate-300 uppercase">{coronaryBranch}</span>
              </div>
            </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Source
              </p>
              <p className="text-sm text-slate-200">
                3D highlights are generated from parsed SOAP notes and transcript context.
              </p>
            </div>

            {/* Severity scale (only in before view) */}
            {!isAfter && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Severity Scale
                </p>
                <div className="space-y-1.5">
                  {[1, 2, 3, 4].map((lvl) => {
                    const m = SEVERITY_META[lvl];
                    const isActive = lvl === condition.severityLevel;
                    return (
                      <div
                        key={lvl}
                        className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all ${
                          isActive ? 'ring-1' : 'opacity-40'
                        }`}
                        style={{
                          background: isActive ? m.bgColor + '40' : 'transparent',
                          ringColor: m.color,
                        }}
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: m.color }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{ color: isActive ? m.color : '#94a3b8' }}
                        >
                          Level {lvl}: {m.label}
                        </span>
                        {isActive && (
                          <span className="ml-auto text-xs font-bold" style={{ color: m.color }}>
                            ◀
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Affected zones */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Highlighted Zones
              </p>
              <div className="flex flex-wrap gap-1.5">
                {condition.affectedMeshes.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300 capitalize"
                  >
                    {m.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>

            {/* Color legend */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Color Key
              </p>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#d4956a' }} />
                  Normal tissue
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: isAfter ? '#22c55e' : meta.color }} />
                  {isAfter ? 'Healed area' : `Affected area (${meta.label})`}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#c07848' }} />
                  Joint / cartilage
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
