import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AnatomyViewer from '../components/AnatomyViewer';

const styles = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at 15% 20%, #1d2a3f 0%, #0f1726 38%, #0a0f1a 100%)',
    color: '#e6eef8',
    fontFamily:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundGlowA: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: '50%',
    background: 'rgba(48, 95, 171, 0.18)',
    filter: 'blur(50px)',
    top: -120,
    left: -110,
    pointerEvents: 'none',
  },
  backgroundGlowB: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: '50%',
    background: 'rgba(31, 161, 141, 0.14)',
    filter: 'blur(60px)',
    bottom: -130,
    right: -100,
    pointerEvents: 'none',
  },
  header: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(1.55rem, 2.5vw, 2.1rem)',
    lineHeight: 1.15,
    letterSpacing: 0.2,
    fontWeight: 800,
    color: '#f1f7ff',
  },
  subtitle: {
    margin: '8px 0 0 0',
    color: '#a9bdd6',
    fontSize: '0.98rem',
    maxWidth: 760,
  },
  statusPill: {
    alignSelf: 'center',
    border: '1px solid',
    borderRadius: 999,
    padding: '9px 14px',
    fontSize: '0.82rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(4px)',
  },
  dashboard: {
    position: 'relative',
    zIndex: 2,
    display: 'grid',
    gap: 16,
    alignItems: 'stretch',
  },
  card: {
    background: 'linear-gradient(180deg, #131d2f 0%, #10192a 100%)',
    border: '1px solid rgba(140, 171, 210, 0.18)',
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 14px 35px rgba(0,0,0,0.28)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  viewerCard: {
    background: 'linear-gradient(180deg, #111b2c 0%, #0f1827 100%)',
    border: '1px solid rgba(140, 171, 210, 0.18)',
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 14px 35px rgba(0,0,0,0.28)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minHeight: 620,
  },
  panelTitle: {
    margin: 0,
    fontSize: '1.02rem',
    color: '#d7e8fb',
    letterSpacing: 0.25,
    fontWeight: 700,
  },
  metaGroup: {
    display: 'grid',
    gap: 10,
  },
  infoRow: {
    background: 'rgba(20, 31, 49, 0.74)',
    border: '1px solid rgba(110, 148, 191, 0.2)',
    borderRadius: 12,
    padding: '10px 11px',
  },
  infoLabel: {
    fontSize: 12,
    color: '#8ea7c7',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    fontWeight: 700,
  },
  infoValue: {
    fontSize: 14,
    color: '#e7f0fb',
    lineHeight: 1.35,
    fontWeight: 600,
  },
  buttonStack: {
    display: 'grid',
    gap: 10,
    marginTop: 4,
  },
  button: {
    border: '1px solid transparent',
    borderRadius: 12,
    padding: '11px 12px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  buttonPrimary: {
    background: 'linear-gradient(135deg, #2e78d1 0%, #1f93b5 100%)',
    color: '#f6fbff',
    borderColor: 'rgba(130,196,255,0.55)',
    boxShadow: '0 8px 20px rgba(29,123,212,0.3)',
  },
  buttonSuccess: {
    background: 'linear-gradient(135deg, #1c9c77 0%, #22b887 100%)',
    color: '#f5fffb',
    borderColor: 'rgba(96,245,188,0.5)',
    boxShadow: '0 8px 20px rgba(20,173,126,0.25)',
  },
  buttonNeutral: {
    background: 'rgba(154,171,193,0.12)',
    color: '#dce8f5',
    borderColor: 'rgba(160,187,216,0.35)',
  },
  buttonDisabled: {
    background: 'rgba(84,100,121,0.3)',
    color: '#90a4bc',
    borderColor: 'rgba(112,137,163,0.35)',
    cursor: 'not-allowed',
  },
  supportNote: {
    marginTop: 2,
    fontSize: 12.5,
    color: '#9ab2cd',
    lineHeight: 1.45,
    background: 'rgba(18,28,43,0.8)',
    border: '1px solid rgba(97,126,160,0.23)',
    borderRadius: 12,
    padding: '10px 11px',
  },
  viewer: {
    position: 'relative',
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid rgba(130, 163, 204, 0.3)',
    background: '#0c1422',
    minHeight: 540,
  },
  viewerLayer: {
    position: 'absolute',
    inset: 0,
  },
  overlayMessage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(7, 13, 21, 0.82)',
    color: '#d9e9ff',
    border: '1px solid rgba(146, 179, 220, 0.45)',
    borderRadius: 12,
    padding: '14px 18px',
    textAlign: 'center',
    fontWeight: 650,
    width: 'min(90%, 560px)',
    fontSize: '0.98rem',
    boxShadow: '0 12px 32px rgba(0,0,0,0.38)',
  },
  badge: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  viewerFooter: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    background: 'rgba(7, 12, 19, 0.72)',
    color: '#d5e5f9',
    border: '1px solid rgba(140, 176, 218, 0.34)',
    borderRadius: 10,
    padding: '8px 10px',
    textAlign: 'center',
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  metricsGrid: {
    display: 'grid',
    gap: 10,
  },
  metricTile: {
    background: 'rgba(18, 30, 47, 0.75)',
    border: '1px solid rgba(111, 144, 182, 0.24)',
    borderRadius: 12,
    padding: '12px 12px',
  },
  metricLabel: {
    fontSize: 12,
    color: '#9ab2cd',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    fontWeight: 700,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 17,
    color: '#f2f7ff',
    fontWeight: 800,
  },
  noteCard: {
    marginTop: 2,
    background: 'rgba(14, 23, 37, 0.86)',
    border: '1px solid rgba(108, 141, 181, 0.28)',
    borderRadius: 12,
    padding: '12px 12px',
  },
  noteTitle: {
    color: '#d8e8fb',
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: 0.2,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  noteText: {
    margin: 0,
    color: '#bfd0e5',
    fontSize: 14,
    lineHeight: 1.5,
  },
};

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <div style={styles.metricTile}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

export default function VirtualCoronaryPlanning3D() {
  const location = useLocation();
  const caseNotes = location.state?.notes || {};
  const caseTranscript = location.state?.transcript || '';
  const casePatientInfo = location.state?.patientInfo || {};

  const [stage, setStage] = useState('initial');
  const [isNarrow, setIsNarrow] = useState(false);
  const [cutawayLevel, setCutawayLevel] = useState(0);
  const [manualMode, setManualMode] = useState(true);
  const [targetArtery, setTargetArtery] = useState('lad');
  const [positionAccuracy, setPositionAccuracy] = useState(35);
  const [stentExpansion, setStentExpansion] = useState(0);
  const [flowAssist, setFlowAssist] = useState(10);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const VIRTUAL_SURGERY_MS = 14000;

  const selectedProcedure = useMemo(() => {
    const text = [
      caseNotes?.assessment,
      caseNotes?.plan,
      caseNotes?.chiefComplaint,
      caseNotes?.historyOfPresentIllness,
      caseTranscript,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/(cabg|coronary artery bypass|bypass graft)/.test(text)) return 'CABG';
    if (/(valve|aortic valve|mitral valve|valve replacement)/.test(text)) return 'VALVE';
    if (/(pacemaker|pacing)/.test(text)) return 'PACEMAKER';
    return 'STENT';
  }, [caseNotes, caseTranscript]);

  const procedureLabel = useMemo(() => {
    if (selectedProcedure === 'CABG') return 'Coronary Artery Bypass (CABG)';
    if (selectedProcedure === 'VALVE') return 'Valve Intervention Planning';
    if (selectedProcedure === 'PACEMAKER') return 'Pacemaker Procedure Planning';
    return 'Coronary Stent Placement';
  }, [selectedProcedure]);

  const patientCaseLabel = useMemo(() => {
    const name = String(casePatientInfo?.patientName || casePatientInfo?.name || '').trim();
    return name || 'Coronary Case 01';
  }, [casePatientInfo]);

  const patientDemographics = useMemo(() => {
    const age = casePatientInfo?.age ? `${casePatientInfo.age} yrs` : '';
    const gender = String(casePatientInfo?.gender || casePatientInfo?.sex || '').trim();
    return [age, gender].filter(Boolean).join(' • ') || 'Not provided';
  }, [casePatientInfo]);

  const visitDateLabel = useMemo(() => {
    const raw = String(casePatientInfo?.dateOfVisit || '').trim();
    if (!raw) return 'Not provided';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString();
  }, [casePatientInfo]);

  const clinicalGoal = useMemo(() => {
    const fromPlan = String(caseNotes?.plan || '').trim();
    const fromAssessment = String(caseNotes?.assessment || '').trim();
    return fromPlan || fromAssessment || 'Reduce operative risk and improve efficiency';
  }, [caseNotes]);

  const chiefConcern = useMemo(() => {
    const cc = String(caseNotes?.chiefComplaint || '').trim();
    return cc || 'Coronary intervention planning';
  }, [caseNotes]);

  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 1200);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (stage !== 'virtual' || !simulationRunning) return;

    const startTime = performance.now();
    let rafId = 0;

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / VIRTUAL_SURGERY_MS, 1);
      setSimulationProgress(progress);

      if (progress >= 1) {
        setSimulationRunning(false);
        setStage('after');
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [stage, simulationRunning]);

  const manualProgress = useMemo(() => {
    const positionScore = Math.max(0, Math.min(100, Number(positionAccuracy) || 0));
    const expansionScore = Math.max(0, Math.min(100, Number(stentExpansion) || 0));
    const flowScore = Math.max(0, Math.min(100, Number(flowAssist) || 0));
    return ((positionScore * 0.45) + (expansionScore * 0.45) + (flowScore * 0.1)) / 100;
  }, [positionAccuracy, stentExpansion, flowAssist]);

  useEffect(() => {
    if (!manualMode || stage !== 'virtual') return;
    setSimulationProgress(manualProgress);
    setSimulationRunning(false);
  }, [manualMode, stage, manualProgress]);

  useEffect(() => {
    if (!manualMode || stage !== 'virtual') return;
    if (manualProgress < 0.96) return;

    const timer = window.setTimeout(() => {
      setStage('after');
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [manualMode, stage, manualProgress]);

  const stageConfig = useMemo(() => {
    const virtualBlockage = `${Math.round(78 - (54 * simulationProgress))}%`;
    const virtualFlow = simulationProgress < 0.35
      ? 'Restricted (Manual Correction Started)'
      : simulationProgress < 0.75
        ? 'Transitioning Under Manual Simulation'
        : 'Near-Improved Flow Pattern';
    const virtualRisk = simulationProgress < 0.35
      ? 'High - Under Review'
      : simulationProgress < 0.75
        ? 'Moderate - Under Review'
        : 'Reducing Risk Trend';
    const arteryLabel = String(targetArtery || 'lad').toUpperCase();

    const config = {
      initial: {
        status: 'Session Idle',
        statusColor: '#9bb0c8',
        statusBg: 'rgba(90,108,129,0.25)',
        blockage: 'Not loaded',
        flow: 'Not assessed',
        risk: 'Not assessed',
        doctorNote:
          'Load the coronary case to begin doctor-facing pre-operative visual rehearsal. Planning support only.',
        viewerFooter: 'Pre-operative planning session not yet initiated',
      },
      before: {
        status: 'Before Surgery',
        statusColor: '#ff6f6f',
        statusBg: 'rgba(255,111,111,0.18)',
        blockage: '78%',
        flow: 'Restricted',
        risk: 'High',
        doctorNote:
          'Pre-operative artery assessment indicates critical coronary narrowing. Recommend virtual pathway rehearsal prior to intervention.',
        viewerFooter: 'Critical coronary narrowing identified',
      },
      virtual: {
        status: 'Virtual Surgery Simulation',
        statusColor: '#ffd37a',
        statusBg: 'rgba(255,211,122,0.2)',
        blockage: virtualBlockage,
        flow: virtualFlow,
        risk: virtualRisk,
        doctorNote:
          manualMode
            ? `Doctor manual practice active on ${arteryLabel}. Positioning, expansion, and perfusion tuning are ${(simulationProgress * 100).toFixed(0)}% complete.`
            : `Virtual intervention in progress. Simulated stent expansion is ${(simulationProgress * 100).toFixed(0)}% complete with progressive lumen recovery.`,
        viewerFooter: manualMode ? `Manual correction active on ${arteryLabel} branch` : 'Virtual intervention in progress',
      },
      after: {
        status: 'Predicted Post-Op Outcome',
        statusColor: '#5be39a',
        statusBg: 'rgba(91,227,154,0.18)',
        blockage: '24%',
        flow: 'Improved',
        risk: 'Reduced',
        doctorNote:
          'Predicted post-operative outcome suggests improved distal perfusion. Virtual rehearsal supports lower uncertainty before live procedure.',
        viewerFooter: 'Predicted flow improvement observed',
      },
    };

    return config[stage];
  }, [stage, simulationProgress, manualMode, targetArtery]);

  const canLoad = stage === 'initial';
  const canStart = stage === 'before';
  const canDeploy = stage === 'virtual' && (!manualMode || simulationProgress >= 0.7);

  const anatomyStage = stage === 'initial' ? 'before' : stage;
  const anatomyCondition = useMemo(
    () => ({
      bodyPart: 'chest',
      bodyPartName: 'Chest / Coronary',
      bodyPartIcon: '❤️',
      laterality: 'Bilateral',
      severityLevel: stage === 'after' ? 1 : 3,
      beforeDescription: 'Critical coronary narrowing before intervention.',
      afterDescription: 'Predicted post-stent coronary flow improvement.',
      visualFlags: {
        blocked: stage !== 'after',
        reducedFlow: stage !== 'after',
        branch: targetArtery,
      },
    }),
    [stage, targetArtery]
  );

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlowA} />
      <div style={styles.backgroundGlowB} />

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Virtual Coronary Surgery Planning System</h1>
          <p style={styles.subtitle}>
            Doctor-facing pre-operative visual rehearsal for coronary artery intervention
          </p>
        </div>
        <div
          style={{
            ...styles.statusPill,
            color: stageConfig.statusColor,
            background: stageConfig.statusBg,
            borderColor: stageConfig.statusColor,
          }}
        >
          {stageConfig.status}
        </div>
      </header>

      <section
        style={{
          ...styles.dashboard,
          gridTemplateColumns: isNarrow ? '1fr' : '320px 1fr 340px',
        }}
      >
        <aside style={styles.card}>
          <h2 style={styles.panelTitle}>Case Information</h2>

          <div style={styles.metaGroup}>
            <InfoRow label="Patient Case" value={patientCaseLabel} />
            <InfoRow label="Age / Gender" value={patientDemographics} />
            <InfoRow label="Visit Date" value={visitDateLabel} />
            <InfoRow label="Procedure" value={procedureLabel} />
            <InfoRow label="Mode" value="Pre-operative Planning" />
            <InfoRow label="Chief Concern" value={chiefConcern} />
            <InfoRow label="Clinical Goal" value={clinicalGoal} />
          </div>

          <div style={{ ...styles.infoRow, padding: '12px 11px' }}>
            <div style={styles.infoLabel}>Practice Mode</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{
                  ...styles.button,
                  padding: '7px 10px',
                  fontSize: 12,
                  ...(manualMode ? styles.buttonPrimary : styles.buttonNeutral),
                }}
                onClick={() => {
                  setManualMode(true);
                  setSimulationRunning(false);
                  setSimulationProgress(manualProgress);
                }}
              >
                Manual Practice
              </button>
              <button
                style={{
                  ...styles.button,
                  padding: '7px 10px',
                  fontSize: 12,
                  ...(!manualMode ? styles.buttonPrimary : styles.buttonNeutral),
                }}
                onClick={() => setManualMode(false)}
              >
                Auto Demo
              </button>
            </div>
          </div>

          {manualMode && (
            <div style={{ ...styles.infoRow, padding: '12px 11px', display: 'grid', gap: 10 }}>
              <div style={styles.infoLabel}>Doctor Manual Controls</div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#9ab2cd', fontWeight: 700 }}>Heart Cutaway Slice: {cutawayLevel}%</div>
                <input type="range" min={0} max={100} value={cutawayLevel} onChange={(e) => setCutawayLevel(Number(e.target.value))} />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#9ab2cd', fontWeight: 700 }}>Affected Coronary Branch</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['lad', 'lcx', 'rca'].map((branch) => (
                    <button
                      key={branch}
                      style={{
                        ...styles.button,
                        padding: '6px 9px',
                        fontSize: 11,
                        ...(targetArtery === branch ? styles.buttonPrimary : styles.buttonNeutral),
                      }}
                      onClick={() => setTargetArtery(branch)}
                    >
                      {branch.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#9ab2cd', fontWeight: 700 }}>Stent Position Accuracy: {positionAccuracy}%</div>
                <input type="range" min={0} max={100} value={positionAccuracy} onChange={(e) => setPositionAccuracy(Number(e.target.value))} />
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#9ab2cd', fontWeight: 700 }}>Stent Expansion Control: {stentExpansion}%</div>
                <input type="range" min={0} max={100} value={stentExpansion} onChange={(e) => setStentExpansion(Number(e.target.value))} />
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#9ab2cd', fontWeight: 700 }}>Perfusion Assist: {flowAssist}%</div>
                <input type="range" min={0} max={100} value={flowAssist} onChange={(e) => setFlowAssist(Number(e.target.value))} />
              </div>

              <div style={{ fontSize: 12, color: '#d7e8fb', fontWeight: 700 }}>
                Manual repair completion: {Math.round(manualProgress * 100)}%
              </div>
            </div>
          )}

          <div style={styles.buttonStack}>
            <button
              style={{ ...styles.button, ...(canLoad ? styles.buttonPrimary : styles.buttonDisabled) }}
              onClick={() => {
                setSimulationRunning(false);
                setSimulationProgress(0);
                setPositionAccuracy(35);
                setStentExpansion(0);
                setFlowAssist(10);
                setStage('before');
              }}
              disabled={!canLoad}
            >
              Load Case
            </button>

            <button
              style={{ ...styles.button, ...(canStart ? styles.buttonPrimary : styles.buttonDisabled) }}
              onClick={() => {
                setStage('virtual');
                if (manualMode) {
                  setSimulationRunning(false);
                  setSimulationProgress(manualProgress);
                } else {
                  setSimulationProgress(0);
                  setSimulationRunning(true);
                }
              }}
              disabled={!canStart}
            >
              Start Virtual Surgery
            </button>

            <button
              style={{ ...styles.button, ...(canDeploy ? styles.buttonSuccess : styles.buttonDisabled) }}
              onClick={() => {
                setSimulationRunning(false);
                setSimulationProgress(1);
                setStentExpansion(100);
                setFlowAssist(100);
                setStage('after');
              }}
              disabled={!canDeploy}
            >
              Deploy Virtual Stent
            </button>

            <button
              style={{ ...styles.button, ...styles.buttonNeutral }}
              onClick={() => {
                setSimulationRunning(false);
                setSimulationProgress(0);
                setPositionAccuracy(35);
                setStentExpansion(0);
                setFlowAssist(10);
                setTargetArtery('lad');
                setStage('initial');
              }}
            >
              Reset Session
            </button>
          </div>

          <div style={styles.supportNote}>
            This interface is a pre-operative virtual rehearsal tool intended to reduce uncertainty and improve planning confidence. Planning support only.
          </div>
        </aside>

        <section style={styles.viewerCard}>
          <h2 style={styles.panelTitle}>Main Virtual Surgery Viewer (3D)</h2>

          <div style={styles.viewer}>
            <div style={styles.viewerLayer}>
              <AnatomyViewer
                condition={anatomyCondition}
                stage={anatomyStage}
                heartOnly={true}
                autoRotate={true}
                selectedSurgery={selectedProcedure}
                animationsEnabled={stage !== 'initial'}
                cameraDistanceMultiplier={0.72}
                procedureProgress={simulationProgress}
                stentTarget={targetArtery}
                cutawayLevel={cutawayLevel}
                heartVerticalOffset={1.2}
              />
            </div>

            {stage === 'initial' && (
              <div style={styles.overlayMessage}>
                Click Load Case to begin virtual pre-operative planning
              </div>
            )}

            {stage === 'before' && (
              <div
                style={{
                  ...styles.badge,
                  top: '11%',
                  background: 'rgba(140, 19, 19, 0.8)',
                  border: '1px solid rgba(255,125,125,0.8)',
                  color: '#ffd8d8',
                }}
              >
                Critical coronary narrowing identified
              </div>
            )}

            {stage === 'virtual' && (
              <>
                <div
                  style={{
                    ...styles.badge,
                    top: '11%',
                    background: 'rgba(48, 77, 117, 0.78)',
                    border: '1px solid rgba(153, 192, 238, 0.7)',
                    color: '#e9f2ff',
                  }}
                >
                  Virtual intervention in progress
                </div>
                <div
                  style={{
                    ...styles.badge,
                    top: '18%',
                    background: 'rgba(255, 229, 138, 0.84)',
                    border: '1px solid rgba(255,241,178,0.95)',
                    color: '#332600',
                  }}
                >
                  Planned stent position
                </div>

                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: '25%',
                    width: 'min(80%, 480px)',
                    background: 'rgba(8, 18, 32, 0.72)',
                    border: '1px solid rgba(145, 179, 222, 0.45)',
                    borderRadius: 10,
                    padding: '8px 10px',
                  }}
                >
                  <div
                    style={{
                      height: 8,
                      width: '100%',
                      borderRadius: 999,
                      background: 'rgba(87, 109, 140, 0.45)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round(simulationProgress * 100)}%`,
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, #3b82f6 0%, #22d3ee 50%, #22c55e 100%)',
                        transition: 'width 120ms linear',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: '#bfdbfe',
                      fontSize: 12,
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {manualMode ? 'Manual repair progression' : 'Virtual stent deployment timeline'}: {Math.round(simulationProgress * 100)}%
                  </div>
                </div>
              </>
            )}

            {stage === 'after' && (
              <div
                style={{
                  ...styles.badge,
                  top: '11%',
                  background: 'rgba(18, 114, 84, 0.8)',
                  border: '1px solid rgba(117, 241, 187, 0.82)',
                  color: '#d5fff0',
                }}
              >
                Predicted flow improvement observed
              </div>
            )}

            <div style={styles.viewerFooter}>{stageConfig.viewerFooter}</div>
          </div>
        </section>

        <aside style={styles.card}>
          <h2 style={styles.panelTitle}>Planning Metrics & Doctor Note</h2>

          <div style={styles.metricsGrid}>
            <MetricTile label="Blockage" value={stageConfig.blockage} />
            <MetricTile label="Flow" value={stageConfig.flow} />
            <MetricTile label="Risk" value={stageConfig.risk} />
          </div>

          <div style={styles.noteCard}>
            <div style={styles.noteTitle}>Doctor Planning Note</div>
            <p style={styles.noteText}>{stageConfig.doctorNote}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
