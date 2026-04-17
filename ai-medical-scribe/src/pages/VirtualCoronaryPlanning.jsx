import { useEffect, useMemo, useState } from 'react';

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
  viewerImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'contrast(1.03) brightness(0.58) saturate(1.08)',
  },
  viewerOverlay: {
    position: 'absolute',
    inset: 0,
  },
  initialOverlayMessage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(7, 13, 21, 0.8)',
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
  blockageCircleRed: {
    position: 'absolute',
    top: '44.5%',
    left: '47%',
    width: 44,
    height: 44,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    border: '2px solid rgba(255,120,120,0.95)',
    boxShadow:
      '0 0 0 10px rgba(255,65,65,0.18), 0 0 28px rgba(255,72,72,0.82), inset 0 0 18px rgba(255,78,78,0.38)',
    background: 'rgba(255,68,68,0.15)',
  },
  blockageCircleGreen: {
    position: 'absolute',
    top: '44.5%',
    left: '47%',
    width: 44,
    height: 44,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    border: '2px solid rgba(86,255,163,0.95)',
    boxShadow:
      '0 0 0 10px rgba(57,215,131,0.18), 0 0 24px rgba(57,215,131,0.82), inset 0 0 18px rgba(67,242,151,0.36)',
    background: 'rgba(62,222,138,0.14)',
  },
  badgeCritical: {
    position: 'absolute',
    top: '37%',
    left: '52%',
    transform: 'translateX(-50%)',
    background: 'rgba(140, 19, 19, 0.8)',
    border: '1px solid rgba(255,125,125,0.8)',
    color: '#ffd8d8',
    borderRadius: 999,
    padding: '7px 12px',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  badgeIntervention: {
    position: 'absolute',
    top: '11%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(48, 77, 117, 0.78)',
    border: '1px solid rgba(153, 192, 238, 0.7)',
    color: '#e9f2ff',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  stentMarker: {
    position: 'absolute',
    top: '53.5%',
    left: '59%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(255, 229, 138, 0.84)',
    color: '#332600',
    border: '1px solid rgba(255,241,178,0.95)',
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 800,
    boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
  },
  badgeImproved: {
    position: 'absolute',
    top: '10%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(18, 114, 84, 0.8)',
    border: '1px solid rgba(117, 241, 187, 0.82)',
    color: '#d5fff0',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  flowPath: {
    position: 'absolute',
    top: '47%',
    left: '39%',
    width: '29%',
    borderTop: '2px dashed rgba(113, 248, 183, 0.92)',
    filter: 'drop-shadow(0 0 8px rgba(57,215,131,0.7))',
  },
  flowArrow: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    color: '#86f3c6',
    fontSize: 25,
    fontWeight: 800,
    textShadow: '0 0 10px rgba(82,231,157,0.9)',
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

export default function VirtualCoronaryPlanning() {
  const [stage, setStage] = useState('initial');
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 1200);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const stageConfig = useMemo(() => {
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
        blockage: '78%',
        flow: 'Under Simulation',
        risk: 'Under Review',
        doctorNote:
          'Virtual intervention in progress with planned stent landing zone verification. Reviewing lumen coverage and trajectory safety.',
        viewerFooter: 'Virtual intervention in progress',
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
  }, [stage]);

  const canLoad = stage === 'initial';
  const canStart = stage === 'before';
  const canDeploy = stage === 'virtual';

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlowA} />
      <div style={styles.backgroundGlowB} />

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Virtual Coronary Surgery Planning System</h1>
          <p style={styles.subtitle}>
            Doctor-facing pre-operative visual rehearsal for coronary artery
            intervention
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
            <InfoRow label="Patient Case" value="Coronary Case 01" />
            <InfoRow label="Procedure" value="Coronary Stent Placement" />
            <InfoRow label="Mode" value="Pre-operative Planning" />
            <InfoRow
              label="Clinical Goal"
              value="Reduce operative risk and improve efficiency"
            />
          </div>

          <div style={styles.buttonStack}>
            <button
              style={{
                ...styles.button,
                ...(canLoad ? styles.buttonPrimary : styles.buttonDisabled),
              }}
              onClick={() => setStage('before')}
              disabled={!canLoad}
            >
              Load Case
            </button>

            <button
              style={{
                ...styles.button,
                ...(canStart ? styles.buttonPrimary : styles.buttonDisabled),
              }}
              onClick={() => setStage('virtual')}
              disabled={!canStart}
            >
              Start Virtual Surgery
            </button>

            <button
              style={{
                ...styles.button,
                ...(canDeploy ? styles.buttonSuccess : styles.buttonDisabled),
              }}
              onClick={() => setStage('after')}
              disabled={!canDeploy}
            >
              Deploy Virtual Stent
            </button>

            <button
              style={{ ...styles.button, ...styles.buttonNeutral }}
              onClick={() => setStage('initial')}
            >
              Reset Session
            </button>
          </div>

          <div style={styles.supportNote}>
            This interface is a pre-operative virtual rehearsal tool intended to
            reduce uncertainty and improve planning confidence. Planning support
            only.
          </div>
        </aside>

        <section style={styles.viewerCard}>
          <h2 style={styles.panelTitle}>Main Virtual Surgery Viewer</h2>

          <div style={styles.viewer}>
            <img
              src="/images/coronary-before.jpg"
              alt="Coronary artery planning view"
              style={styles.viewerImage}
            />

            <div style={styles.viewerOverlay}>
              {stage === 'initial' && (
                <div style={styles.initialOverlayMessage}>
                  Click Load Case to begin virtual pre-operative planning
                </div>
              )}

              {(stage === 'before' || stage === 'virtual') && (
                <>
                  <div style={styles.blockageCircleRed} />
                  <div style={styles.badgeCritical}>Critical Blockage</div>
                </>
              )}

              {stage === 'virtual' && (
                <>
                  <div style={styles.badgeIntervention}>
                    Virtual intervention in progress
                  </div>
                  <div style={styles.stentMarker}>Planned Stent Position</div>
                </>
              )}

              {stage === 'after' && (
                <>
                  <div style={styles.blockageCircleGreen} />
                  <div style={styles.badgeImproved}>
                    Predicted flow improvement observed
                  </div>

                  <div style={styles.flowPath} />
                  <div style={{ ...styles.flowArrow, top: '46%', left: '43%' }}>
                    {'>'}
                  </div>
                  <div style={{ ...styles.flowArrow, top: '46%', left: '52%' }}>
                    {'>'}
                  </div>
                  <div style={{ ...styles.flowArrow, top: '46%', left: '61%' }}>
                    {'>'}
                  </div>
                </>
              )}
            </div>

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
