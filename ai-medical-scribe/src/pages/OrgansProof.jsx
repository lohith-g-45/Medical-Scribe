import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnatomyViewer from '../components/AnatomyViewer';

const ORGANS = [
  'brain',
  'mouth',
  'larynx',
  'trachea',
  'main_bronchus',
  'heart',
  'lung',
  'thymus',
  'blood_vasculature',
  'liver',
  'pancreas',
  'spleen',
  'small_intestine',
  'large_intestine',
  'left_kidney',
  'right_kidney',
  'left_ureter',
  'right_ureter',
  'urinary_bladder',
  'pelvis',
  'spinal_cord',
  'left_knee',
  'right_knee',
  'lymph_node',
  'skin',
];

export default function OrgansProof() {
  const [searchParams] = useSearchParams();
  const selected = searchParams.get('organ') || 'heart';
  const organ = ORGANS.includes(selected) ? selected : 'heart';

  // PRE-SURGERY: Normal healthy state (NO highlighting - affectedMeshes is empty)
  const preCondition = useMemo(() => ({
    bodyPart: organ,
    bodyPartName: organ.replace(/_/g, ' '),
    bodyPartIcon: '🫀',
    severityLevel: 0,  // No severity = normal rendering
    treatmentType: 'none',
    laterality: '',
    affectedMeshes: [],  // NOT affected - no highlighting
    primaryGlowMeshes: [],
    beforeDescription: `Pre-Surgery: Healthy ${organ.replace(/_/g, ' ')}`,
    afterDescription: `Post-Surgery: Treated ${organ.replace(/_/g, ' ')}`,
  }), [organ]);

  // POST-SURGERY: Affected & treated with full highlighting and glow
  const postCondition = useMemo(() => ({
    bodyPart: organ,
    bodyPartName: organ.replace(/_/g, ' '),
    bodyPartIcon: '🫀',
    severityLevel: 3,  // Severity 3 = RED color + strong glow
    treatmentType: 'surgical',
    laterality: '',
    affectedMeshes: [organ],  // Highlight this organ RED
    primaryGlowMeshes: [organ],  // Add pulsing glow
    beforeDescription: `Pre-Surgery: Healthy ${organ.replace(/_/g, ' ')}`,
    afterDescription: `Post-Surgery: Treated ${organ.replace(/_/g, ' ')}`,
  }), [organ]);

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '16px' }}>
      <div style={{ maxWidth: '100%', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '24px', textAlign: 'center' }}>
          PRE vs POST-SURGERY: {organ.replace(/_/g, ' ').toUpperCase()}
        </h1>
        <p style={{ marginTop: '8px', marginBottom: '16px', fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
          <span style={{ color: '#22c55e' }}>● Green (Left) = Healthy</span>
          <span style={{ margin: '0 12px', color: '#999' }}>|</span>
          <span style={{ color: '#ef4444' }}>● Red (Right) = Post-Treatment</span>
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          {/* PRE-SURGERY */}
          <div style={{ flex: 1, maxWidth: '600px' }}>
            <div style={{
              textAlign: 'center',
              marginBottom: '8px',
              padding: '8px',
              background: '#1e293b',
              borderRadius: '8px',
              border: '2px solid #22c55e'
            }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#22c55e' }}>
                ✓ PRE-SURGERY (HEALTHY)
              </h2>
            </div>
            <div style={{ height: '600px', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
              <AnatomyViewer condition={preCondition} stage="before" />
            </div>
          </div>

          {/* POST-SURGERY */}
          <div style={{ flex: 1, maxWidth: '600px' }}>
            <div style={{
              textAlign: 'center',
              marginBottom: '8px',
              padding: '8px',
              background: '#1e293b',
              borderRadius: '8px',
              border: '2px solid #ef4444'
            }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#ef4444' }}>
                ⚕️ POST-SURGERY (TREATED)
              </h2>
            </div>
            <div style={{ height: '600px', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
              <AnatomyViewer condition={postCondition} stage="after" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
          Left shows normal organ; Right shows affected organ with treatment highlights and glow effects
        </div>
      </div>
    </div>
  );
}
