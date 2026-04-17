/**
 * AnatomyViewer.jsx  — v4
 *
 * Full-body 3D anatomical viewer using the real BodyParts3D GLB.
 * Model: /models/human_anatomy.glb (generated from 934 OBJ files)
 * Y-up normalised: feet ≈ y=0, head top ≈ y=8.2
 *
 * Named meshes:  head, neck, chest, abdomen, pelvis,
 *                shoulder_L/R, upper_arm_L/R, lower_arm_L/R, hand_L/R,
 *                upper_leg_L/R, lower_leg_L/R, foot_L/R
 */

import { useMemo, useEffect, Suspense, useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Text } from '@react-three/drei';
import * as THREE from 'three';
import HeartProcedureOverlays from './HeartProcedureOverlays';
import { useHeartbeat } from '../hooks/heartAnimations';

// ── Condition keyword → mesh-name(s) to highlight ─────────────────────────
const PART_MAP = {
  head:     ['head'],
  face:     ['head'],
  skull:    ['head'],
  neck:     ['neck'],
  chest:    ['chest'],
  thorax:   ['chest'],
  breast:   ['chest'],
  back:     ['chest', 'abdomen'],
  spine:    ['chest', 'abdomen'],
  abdomen:  ['abdomen'],
  stomach:  ['abdomen'],
  belly:    ['abdomen'],
  hip:      ['pelvis'],
  pelvis:   ['pelvis'],
  groin:    ['pelvis'],
  shoulder: ['shoulder_L', 'shoulder_R'],
  clavicle: ['shoulder_L', 'shoulder_R'],
  arm:      ['upper_arm_L', 'upper_arm_R', 'lower_arm_L', 'lower_arm_R'],
  elbow:    ['lower_arm_L', 'lower_arm_R'],
  forearm:  ['lower_arm_L', 'lower_arm_R'],
  wrist:    ['hand_L', 'hand_R'],
  hand:     ['hand_L', 'hand_R'],
  finger:   ['hand_L', 'hand_R'],
  thigh:    ['upper_leg_L', 'upper_leg_R'],
  leg:      ['upper_leg_L', 'upper_leg_R', 'lower_leg_L', 'lower_leg_R'],
  knee:     ['upper_leg_L', 'upper_leg_R', 'lower_leg_L', 'lower_leg_R'],
  calf:     ['lower_leg_L', 'lower_leg_R'],
  shin:     ['lower_leg_L', 'lower_leg_R'],
  ankle:    ['foot_L', 'foot_R'],
  foot:     ['foot_L', 'foot_R'],
  feet:     ['foot_L', 'foot_R'],
  toe:      ['foot_L', 'foot_R'],
};

// ── Severity colours ──────────────────────────────────────────────────────
const SEVERITY_HEX = {
  1: '#22c55e',   // mild     – green
  2: '#f59e0b',   // moderate – amber
  3: '#ef4444',   // severe   – red
  4: '#8b22f5',   // critical – purple
};
const HEALED_HEX = '#22c55e';

function resolveHighlightNames(bodyPart, laterality) {
  const names = PART_MAP[bodyPart] || ['chest'];
  if (!laterality || laterality === 'bilateral') return new Set(names);
  const suffix = laterality === 'Left' ? '_L' : '_R';
  const filtered = names.filter(n => n.endsWith(suffix) || (!n.endsWith('_L') && !n.endsWith('_R')));
  return new Set(filtered.length ? filtered : names);
}

// ── Material helpers ──────────────────────────────────────────────────────
// Non-highlighted meshes keep their original GLB PBR material — do NOT replace.
// Only highlighted meshes get an override.
function highlightMat(hex) {
  const c = new THREE.Color(hex);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 0.45,
    roughness: 0.50,
    metalness: 0.05,
  });
}

function ghostMat() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2f3541'),
    transparent: true,
    opacity: 0.08,
    roughness: 0.95,
    metalness: 0.0,
    depthWrite: false,
  });
}

function regionEmphasisMat() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7d8797'),
    transparent: true,
    opacity: 0.28,
    roughness: 0.82,
    metalness: 0.02,
  });
}

function getKneeRegionsForLaterality(laterality) {
  if (laterality === 'Left') return ['upper_leg_L', 'lower_leg_L'];
  if (laterality === 'Right') return ['upper_leg_R', 'lower_leg_R'];
  return ['upper_leg_L', 'lower_leg_L', 'upper_leg_R', 'lower_leg_R'];
}

function getKneeSubpartOffset(subpart, laterality) {
  const medialX = laterality === 'Left' ? 0.12 : laterality === 'Right' ? -0.12 : 0;
  const lateralX = laterality === 'Left' ? -0.12 : laterality === 'Right' ? 0.12 : 0;

  const base = {
    acl: [0.0, 0.04, 0.04],
    pcl: [0.0, -0.04, -0.06],
    mcl: [medialX, 0.0, 0.02],
    lcl: [lateralX, 0.0, 0.02],
    meniscus: [0.0, -0.06, 0.06],
    patella: [0.0, 0.02, 0.16],
    patellar_tendon: [0.0, -0.14, 0.14],
    generic: [0.0, 0.0, 0.11],
  };

  return base[subpart] || base.generic;
}

function KneeSubpartMarker({ anchor, subpart, label, laterality, stage = 'before', severityLevel = 3 }) {
  const ringRef = useRef(null);
  const haloRef = useRef(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 3.6) * 0.16;
    if (ringRef.current) ringRef.current.scale.set(pulse, pulse, pulse);
    if (haloRef.current) haloRef.current.scale.set(1 + Math.sin(t * 2.4) * 0.20, 1 + Math.sin(t * 2.4) * 0.20, 1 + Math.sin(t * 2.4) * 0.20);
  });

  if (!anchor) return null;

  const beforeColor = SEVERITY_HEX[severityLevel] || SEVERITY_HEX[3];
  const color = stage === 'after' ? '#22c55e' : beforeColor;
  const offset = getKneeSubpartOffset(subpart, laterality);
  const pos = [anchor.x + offset[0], anchor.y + offset[1], anchor.z + offset[2]];

  return (
    <group position={pos}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.23} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.29, 0.02, 14, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.95} />
      </mesh>
      <Text
        position={[0, 0.36, 0.03]}
        fontSize={0.09}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {label || 'Knee Injury Region'}
      </Text>
    </group>
  );
}

// Extract region name from node name: "upper_leg_L_0042" → "upper_leg_L"
function getRegion(nodeName) {
  return nodeName.replace(/_\d+$/, '');
}

// Preload so the first render doesn't block
useGLTF.preload('/models/human_anatomy.glb');
useGLTF.preload('/models/realistic_human_heart.glb');

// ── GLB-based human model ─────────────────────────────────────────────────
// The GLB is Y-up normalised: feet ≈ y=0, head top ≈ y=8.2 (1mm = 0.005 units)
function HumanModel({ condition, stage, onLoaded, heartOnly = false }) {
  const { scene } = useGLTF('/models/human_anatomy.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const isAfter      = stage === 'after';
  const highlighted  = resolveHighlightNames(condition?.bodyPart, condition?.laterality);
  const sev          = condition?.severityLevel || 3;
  const hiliteHex    = isAfter ? HEALED_HEX : (SEVERITY_HEX[sev] || SEVERITY_HEX[3]);
  const isKneeFocus  = !heartOnly && (condition?.focusMode === 'knee' || condition?.bodyPart === 'knee');
  const [kneeAnchor, setKneeAnchor] = useState(null);

  // Cache original materials so switching before↔after restores anatomy colours
  useEffect(() => {
    const targetKneeRegions = getKneeRegionsForLaterality(condition?.laterality);
    const regionBounds = {};

    cloned.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow    = true;
      node.receiveShadow = true;

      // Heart-only mode: keep only chest/heart region visible.
      if (heartOnly) {
        const region = getRegion(node.name).toLowerCase();
        const keep = region === 'chest' || region === 'heart';
        node.visible = keep;
        if (!keep) return;
      } else {
        node.visible = true;
      }

      // Save original GLB material on first run
      if (!node._origMaterial) node._origMaterial = node.material;
      const region = getRegion(node.name);

      const isKneeRegion = region.startsWith('upper_leg_') || region.startsWith('lower_leg_');
      const isFocusKneeRegion = targetKneeRegions.includes(region);

      if (isKneeFocus) {
        if (isFocusKneeRegion && highlighted.has(region)) {
          node.material = highlightMat(hiliteHex);
        } else if (isFocusKneeRegion) {
          node.material = node._regionEmphasisMaterial || (node._regionEmphasisMaterial = regionEmphasisMat());
        } else {
          node.material = node._ghostMaterial || (node._ghostMaterial = ghostMat());
        }
      } else {
        node.material = highlighted.has(region)
          ? highlightMat(hiliteHex)
          : node._origMaterial;
      }

      if (isKneeFocus && isKneeRegion && isFocusKneeRegion) {
        if (!regionBounds[region]) {
          regionBounds[region] = new THREE.Box3();
          regionBounds[region].makeEmpty();
        }
        const box = new THREE.Box3().setFromObject(node);
        regionBounds[region].union(box);
      }
    });

    if (isKneeFocus) {
      const combined = new THREE.Box3();
      combined.makeEmpty();

      targetKneeRegions.forEach((r) => {
        if (regionBounds[r]) combined.union(regionBounds[r]);
      });

      if (!combined.isEmpty()) {
        const c = new THREE.Vector3();
        combined.getCenter(c);
        setKneeAnchor(c);
      } else {
        setKneeAnchor(null);
      }
    } else {
      setKneeAnchor(null);
    }

    onLoaded?.();
  }, [cloned, highlighted, hiliteHex, onLoaded, heartOnly, isKneeFocus, condition?.laterality]);

  // GLB body: Y 0→8.2 units.  Centre at y=4.1; shift down so mid-body at origin.
  return (
    <group>
      <primitive
        object={cloned}
        position={[0, -4.1, 0]}
        rotation={[0, Math.PI, 0]}
      />
      {isKneeFocus && (
        <KneeSubpartMarker
          anchor={kneeAnchor}
          subpart={condition?.kneeSubpart || 'generic'}
          label={condition?.kneeSubpartLabel || 'Knee Injury Region'}
          laterality={condition?.laterality}
          stage={stage}
          severityLevel={sev}
        />
      )}
    </group>
  );
}

function FlowParticles({ curve, color = '#22d3ee', count = 12, speed = 0.18, offset = 0, pulse = 1 }) {
  const refs = useRef([]);
  const mats = useRef([]);

  useFrame(({ clock }) => {
    const heartbeat = 0.75 + 0.25 * Math.sin(clock.getElapsedTime() * (2.7 * pulse));
    const t = clock.getElapsedTime() * speed * heartbeat + offset;
    for (let i = 0; i < count; i += 1) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      const u = (t + i / count) % 1;
      const p = curve.getPointAt(u);
      mesh.position.set(p.x, p.y, p.z);
      const s = 0.8 + 0.5 * Math.sin((clock.getElapsedTime() * 3.8) + i);
      mesh.scale.setScalar(0.7 + s * 0.35);

      const mat = mats.current[i];
      if (mat) mat.opacity = 0.35 + 0.55 * heartbeat;
    }
  });

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial
            ref={(el) => { mats.current[i] = el; }}
            color={color}
            emissive={color}
            emissiveIntensity={1.0}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function WindowFlowParticles({ curve, start = 0, end = 1, color = '#ef4444', count = 10, speed = 0.1, offset = 0, pulse = 1, opacity = 0.85 }) {
  const refs = useRef([]);
  const mats = useRef([]);
  const span = Math.max(0.02, end - start);

  useFrame(({ clock }) => {
    const heartbeat = 0.75 + 0.25 * Math.sin(clock.getElapsedTime() * (2.5 * pulse));
    const t = clock.getElapsedTime() * speed * heartbeat + offset;

    for (let i = 0; i < count; i += 1) {
      const mesh = refs.current[i];
      if (!mesh) continue;

      const localU = (t + i / count) % 1;
      const u = start + localU * span;
      const p = curve.getPointAt(Math.min(0.999, Math.max(0.001, u)));
      mesh.position.set(p.x, p.y, p.z);

      const s = 0.85 + 0.35 * Math.sin((clock.getElapsedTime() * 3.2) + i);
      mesh.scale.setScalar(0.65 + s * 0.3);

      const mat = mats.current[i];
      if (mat) mat.opacity = Math.max(0.2, opacity * (0.6 + 0.4 * heartbeat));
    }
  });

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial
            ref={(el) => { mats.current[i] = el; }}
            color={color}
            emissive={color}
            emissiveIntensity={0.95}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

function sampleCurveSegment(curve, startT, endT, samples = 18) {
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = startT + ((endT - startT) * (i / samples));
    points.push(curve.getPointAt(Math.min(0.999, Math.max(0.001, t))));
  }
  return new THREE.CatmullRomCurve3(points);
}

function FlowRestrictionBand({ curve, centerT = 0.4, stage = 'before', active = false }) {
  const segmentCurve = useMemo(() => {
    const startT = Math.max(0.05, centerT - 0.08);
    const endT = Math.min(0.95, centerT + 0.08);
    return sampleCurveSegment(curve, startT, endT, 24);
  }, [curve, centerT]);

  if (!active) return null;

  const isBefore = stage === 'before';
  const color = isBefore ? '#7f1d1d' : '#22c55e';
  const radius = isBefore ? 0.028 : 0.018;
  const opacity = isBefore ? 0.72 : 0.38;

  return (
    <mesh>
      <tubeGeometry args={[segmentCurve, 48, radius, 10, false]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} transparent opacity={opacity} />
    </mesh>
  );
}

function ArteryNarrowing({ position, rotation = [0, 0, 0], active = false, stage = 'before', severity = 3 }) {
  const sleeveRef = useRef(null);
  const lumenRef = useRef(null);

  useFrame(({ clock }) => {
    if (!active || !sleeveRef.current || !lumenRef.current) return;
    const beat = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 4.2);
    const beforeBase = Math.max(0.30, 0.60 - severity * 0.08);
    const afterBase = Math.min(0.90, 0.76 + severity * 0.03);
    const pinch = stage === 'before'
      ? beforeBase + (1 - beat) * 0.16
      : afterBase + (1 - beat) * 0.05;

    const lumenBase = stage === 'before' ? 0.46 : 0.80;
    const lumenPulse = stage === 'before' ? 0.12 : 0.07;

    sleeveRef.current.scale.set(1.0, pinch, pinch);
    lumenRef.current.scale.set(1.0, lumenBase + beat * lumenPulse, lumenBase + beat * lumenPulse);
  });

  if (!active) return null;

  const wallColor = stage === 'before' ? '#7f1d1d' : '#16a34a';
  const wallEmissive = stage === 'before' ? '#991b1b' : '#15803d';
  const lumenColor = stage === 'before' ? '#dc2626' : '#f87171';

  return (
    <group position={position} rotation={rotation}>
      <mesh ref={sleeveRef}>
        <cylinderGeometry args={[0.12, 0.12, 0.25, 24]} />
        <meshStandardMaterial color={wallColor} emissive={wallEmissive} emissiveIntensity={0.6} transparent opacity={0.65} />
      </mesh>
      <mesh ref={lumenRef}>
        <cylinderGeometry args={[0.07, 0.07, 0.18, 24]} />
        <meshStandardMaterial color={lumenColor} emissive={lumenColor} emissiveIntensity={0.8} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function BlockagePulse({ position }) {
  const ringRef = useRef(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const k = 1 + 0.25 * Math.sin(clock.getElapsedTime() * 4.5);
    ringRef.current.scale.set(k, k, k);
  });

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.85} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.016, 12, 36]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.85} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function StageRegionMarker({ position, stage = 'before', active = false }) {
  const ringRef = useRef(null);
  const haloRef = useRef(null);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();
    const k = 1 + 0.22 * Math.sin(t * 3.6);
    if (ringRef.current) ringRef.current.scale.set(k, k, k);
    if (haloRef.current) haloRef.current.scale.set(1 + 0.30 * Math.sin(t * 2.4), 1 + 0.30 * Math.sin(t * 2.4), 1 + 0.30 * Math.sin(t * 2.4));
  });

  if (!active) return null;

  const isBefore = stage === 'before';
  const color = isBefore ? '#ef4444' : '#22c55e';
  const label = isBefore ? 'Damaged artery region' : 'Diagnosed region';

  return (
    <group position={position}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.19, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.018, 12, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.95} />
      </mesh>
      <Text
        position={[0, 0.30, 0.03]}
        fontSize={0.05}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

function CoronaryFlowOverlay({ reducedFlow = false, blocked = false, stage = 'before', branch = 'rca', severityLevel = 3, selectedSurgery = 'CABG' }) {
  const ladCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.25, 0.28, 0.18),
    new THREE.Vector3(-0.42, 0.22, 0.34),
    new THREE.Vector3(-0.50, 0.06, 0.30),
    new THREE.Vector3(-0.35, -0.08, 0.20),
  ]), []);

  const rcaCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.20, 0.26, 0.16),
    new THREE.Vector3(0.40, 0.18, 0.30),
    new THREE.Vector3(0.50, 0.00, 0.24),
    new THREE.Vector3(0.30, -0.12, 0.18),
  ]), []);

  const lcxCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, 0.24, 0.16),
    new THREE.Vector3(-0.34, 0.20, 0.10),
    new THREE.Vector3(-0.44, 0.08, 0.02),
    new THREE.Vector3(-0.30, -0.02, -0.10),
  ]), []);

  const diagonalCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.30, 0.22, 0.28),
    new THREE.Vector3(-0.45, 0.14, 0.26),
    new THREE.Vector3(-0.50, 0.02, 0.20),
  ]), []);

  const pdaCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.38, 0.10, 0.22),
    new THREE.Vector3(0.35, -0.04, 0.16),
    new THREE.Vector3(0.24, -0.18, 0.08),
  ]), []);

  const flowColor = stage === 'after'
    ? '#ff5f5f'
    : reducedFlow
      ? '#9f1239'
      : '#ef4444';
  const vesselColor = stage === 'after' ? '#fda4af' : '#881337';
  const speed = reducedFlow && stage === 'before' ? 0.07 : stage === 'after' ? 0.24 : 0.16;
  const opacity = reducedFlow && stage === 'before' ? 0.28 : stage === 'after' ? 0.9 : 0.72;
  const selectedCoreColor = stage === 'after' ? '#ff6b6b' : blocked ? '#7f1d1d' : '#f43f5e';
  const selectedCoreOpacity = stage === 'after' ? 0.95 : blocked ? 0.38 : 0.78;

  const selectedBranchCurve = branch === 'lad'
    ? ladCurve
    : branch === 'lcx'
      ? lcxCurve
      : rcaCurve;

  const blockage = useMemo(() => {
    if (branch === 'lad') return {
      pos: new THREE.Vector3(-0.42, 0.18, 0.32),
      rot: [0.2, 0.45, 1.25],
    };
    if (branch === 'lcx') return {
      pos: new THREE.Vector3(-0.38, 0.12, 0.04),
      rot: [0.6, -0.2, 0.95],
    };
    return {
      pos: new THREE.Vector3(0.40, 0.18, 0.30),
      rot: [0.25, -0.5, -1.05],
    };
  }, [branch]);

  const blockageT = branch === 'lad' ? 0.40 : branch === 'lcx' ? 0.44 : 0.34;
  const selectedLeadEnd = Math.max(0.12, blockageT - 0.06);
  const selectedTrailStart = Math.min(0.90, blockageT + 0.05);

  const narrowedFlowColor = stage === 'after' ? '#16a34a' : '#ef4444';
  const isCabg = String(selectedSurgery || '').toUpperCase() === 'CABG';
  const showCabgLesionCallout = blocked && isCabg;

  return (
    <group>
      {/* Coronary vessel guides */}
      <mesh>
        <tubeGeometry args={[ladCurve, 64, 0.016, 10, false]} />
        <meshStandardMaterial color={vesselColor} emissive={vesselColor} emissiveIntensity={0.45} transparent opacity={opacity} />
      </mesh>
      <mesh>
        <tubeGeometry args={[rcaCurve, 64, 0.016, 10, false]} />
        <meshStandardMaterial color={vesselColor} emissive={vesselColor} emissiveIntensity={0.45} transparent opacity={opacity} />
      </mesh>
      <mesh>
        <tubeGeometry args={[lcxCurve, 64, 0.016, 10, false]} />
        <meshStandardMaterial color={vesselColor} emissive={vesselColor} emissiveIntensity={0.40} transparent opacity={opacity * 0.9} />
      </mesh>
      <mesh>
        <tubeGeometry args={[diagonalCurve, 48, 0.012, 10, false]} />
        <meshStandardMaterial color={vesselColor} emissive={vesselColor} emissiveIntensity={0.35} transparent opacity={opacity * 0.8} />
      </mesh>
      <mesh>
        <tubeGeometry args={[pdaCurve, 48, 0.012, 10, false]} />
        <meshStandardMaterial color={vesselColor} emissive={vesselColor} emissiveIntensity={0.35} transparent opacity={opacity * 0.8} />
      </mesh>

      {/* Selected artery lumen core for clearer branch-level interpretation */}
      <mesh>
        <tubeGeometry args={[selectedBranchCurve, 64, 0.0075, 10, false]} />
        <meshStandardMaterial color={selectedCoreColor} emissive={selectedCoreColor} emissiveIntensity={0.85} transparent opacity={selectedCoreOpacity} />
      </mesh>

      {blocked && stage === 'before' && (
        <mesh>
          <tubeGeometry args={[selectedBranchCurve, 64, 0.02, 10, false]} />
          <meshStandardMaterial color={narrowedFlowColor} emissive={narrowedFlowColor} emissiveIntensity={0.75} transparent opacity={0.55} />
        </mesh>
      )}

      {/* Localized restriction zone: thick pre-op, reduced post-op */}
      <FlowRestrictionBand curve={selectedBranchCurve} centerT={blockageT} stage={stage} active={blocked} />

      {/* Animated blood-flow particles */}
      <FlowParticles curve={ladCurve} color={flowColor} speed={speed} count={20} offset={0.1} pulse={1.0} />
      <FlowParticles curve={rcaCurve} color={flowColor} speed={speed} count={20} offset={0.5} pulse={1.05} />
      <FlowParticles curve={lcxCurve} color={flowColor} speed={speed} count={16} offset={0.3} pulse={1.1} />
      <FlowParticles curve={diagonalCurve} color={flowColor} speed={speed * 0.9} count={8} offset={0.2} pulse={1.2} />
      <FlowParticles curve={pdaCurve} color={flowColor} speed={speed * 0.9} count={8} offset={0.65} pulse={0.95} />

      {/* Branch-specific hemodynamic contrast around blockage for clear before/after difference */}
      {blocked && stage === 'before' && (
        <>
          <WindowFlowParticles
            curve={selectedBranchCurve}
            start={0.03}
            end={selectedLeadEnd}
            color="#ef4444"
            count={20}
            speed={speed * 0.42}
            pulse={1.1}
            opacity={0.92}
          />
          <WindowFlowParticles
            curve={selectedBranchCurve}
            start={selectedTrailStart}
            end={0.96}
            color="#7f1d1d"
            count={4}
            speed={speed * 0.3}
            pulse={0.9}
            opacity={0.45}
          />
        </>
      )}

      {blocked && stage === 'after' && (
        <WindowFlowParticles
          curve={selectedBranchCurve}
          start={0.03}
          end={0.96}
          color="#fb7185"
          count={14}
          speed={0.25}
          pulse={1.2}
          opacity={0.8}
        />
      )}

      {/* Blockage marker shown only when mentioned in conversation */}
      {showCabgLesionCallout && stage === 'before' && <BlockagePulse position={blockage.pos} />}
      <StageRegionMarker position={blockage.pos} stage={stage} active={showCabgLesionCallout} />
      <ArteryNarrowing
        position={blockage.pos}
        rotation={blockage.rot}
        active={showCabgLesionCallout}
        stage={stage}
        severity={severityLevel}
      />
    </group>
  );
}

function IntraHeartCirculation({ stage = 'before', reducedFlow = false, blocked = false, severityLevel = 3 }) {
  const leftVentricleCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.10, -0.18, 0.02),
    new THREE.Vector3(-0.28, -0.02, 0.15),
    new THREE.Vector3(-0.12, 0.16, 0.12),
    new THREE.Vector3(0.02, -0.04, 0.03),
    new THREE.Vector3(-0.10, -0.18, 0.02),
  ], true), []);

  const rightVentricleCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.14, -0.14, 0.02),
    new THREE.Vector3(0.30, 0.00, 0.10),
    new THREE.Vector3(0.16, 0.16, 0.08),
    new THREE.Vector3(0.02, -0.02, 0.02),
    new THREE.Vector3(0.14, -0.14, 0.02),
  ], true), []);

  const systemicCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 0.20, 0.06),
    new THREE.Vector3(0.04, 0.38, 0.15),
    new THREE.Vector3(0.00, 0.55, 0.10),
  ]), []);

  const leftFlowColor = stage === 'after'
    ? '#ff6b6b'
    : (reducedFlow || blocked ? '#9f1239' : '#ef4444');
  const rightFlowColor = stage === 'after'
    ? '#60a5fa'
    : (reducedFlow || blocked ? '#1e3a8a' : '#2563eb');
  const systemicColor = leftFlowColor;

  const speedPenalty = blocked ? 0.78 : 1;
  const severityPenalty = Math.max(0.65, 1 - ((severityLevel - 1) * 0.08));
  const speed = stage === 'after' ? 0.28 : 0.18 * speedPenalty * severityPenalty;

  const labelColor = stage === 'after' ? '#fecaca' : '#fca5a5';

  return (
    <group>
      {/* Ventricular chamber guides to make internal circulation visible */}
      <mesh>
        <sphereGeometry args={[0.17, 20, 20]} />
        <meshStandardMaterial color={leftFlowColor} emissive={leftFlowColor} emissiveIntensity={0.35} transparent opacity={stage === 'after' ? 0.12 : 0.18} />
      </mesh>
      <mesh position={[0.17, -0.02, 0.02]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color={rightFlowColor} emissive={rightFlowColor} emissiveIntensity={0.34} transparent opacity={stage === 'after' ? 0.1 : 0.15} />
      </mesh>

      {/* Intrachamber loops */}
      <mesh>
        <tubeGeometry args={[leftVentricleCurve, 90, 0.01, 10, true]} />
        <meshStandardMaterial color={leftFlowColor} emissive={leftFlowColor} emissiveIntensity={0.45} transparent opacity={0.8} />
      </mesh>
      <mesh>
        <tubeGeometry args={[rightVentricleCurve, 90, 0.009, 10, true]} />
        <meshStandardMaterial color={rightFlowColor} emissive={rightFlowColor} emissiveIntensity={0.42} transparent opacity={0.72} />
      </mesh>
      <mesh>
        <tubeGeometry args={[systemicCurve, 40, 0.008, 10, false]} />
        <meshStandardMaterial color={systemicColor} emissive={systemicColor} emissiveIntensity={0.42} transparent opacity={0.76} />
      </mesh>

      {/* Blood cell stream inside chambers */}
      <FlowParticles curve={leftVentricleCurve} color={leftFlowColor} speed={speed} count={22} offset={0.15} pulse={1.2} />
      <FlowParticles curve={rightVentricleCurve} color={rightFlowColor} speed={speed * 0.95} count={18} offset={0.45} pulse={1.15} />
      <FlowParticles curve={systemicCurve} color={systemicColor} speed={speed * 0.85} count={12} offset={0.25} pulse={1.1} />

      {/* Direction arrows and labels for live teaching/demo view */}
      <group>
        <mesh position={[-0.19, 0.07, 0.12]} rotation={[0.5, -0.1, 1.1]}>
          <coneGeometry args={[0.03, 0.09, 10]} />
          <meshStandardMaterial color={leftFlowColor} emissive={leftFlowColor} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.21, 0.08, 0.09]} rotation={[0.55, 0.1, -1.05]}>
          <coneGeometry args={[0.03, 0.09, 10]} />
          <meshStandardMaterial color={rightFlowColor} emissive={rightFlowColor} emissiveIntensity={0.62} />
        </mesh>
        <mesh position={[0.02, 0.42, 0.12]} rotation={[0.2, 0, 0]}>
          <coneGeometry args={[0.03, 0.11, 10]} />
          <meshStandardMaterial color={systemicColor} emissive={systemicColor} emissiveIntensity={0.7} />
        </mesh>

        <Text
          position={[-0.31, -0.02, 0.16]}
          fontSize={0.05}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
        >
          LV circulation
        </Text>
        <Text
          position={[0.30, -0.01, 0.12]}
          fontSize={0.05}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
        >
          RV circulation
        </Text>
        <Text
          position={[0.03, 0.58, 0.12]}
          fontSize={0.05}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
        >
          Aortic outflow
        </Text>
      </group>
    </group>
  );
}

function SceneClipPlane({ enabled = false, cutawayLevel = 0 }) {
  const { gl } = useThree();

  useEffect(() => {
    if (!enabled) {
      gl.localClippingEnabled = false;
      gl.clippingPlanes = [];
      return;
    }

    const level = Math.max(0, Math.min(100, Number(cutawayLevel) || 0));
    const constant = THREE.MathUtils.lerp(-2.8, 2.8, level / 100);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), constant);
    gl.localClippingEnabled = true;
    gl.clippingPlanes = [plane];

    return () => {
      gl.localClippingEnabled = false;
      gl.clippingPlanes = [];
    };
  }, [enabled, cutawayLevel, gl]);

  return null;
}

// Dedicated heart GLB model for heart-only mode
function HeartModel({ stage, severityLevel = 3, onLoaded, visualFlags = {}, selectedSurgery = 'CABG', animationsEnabled = true, procedureProgress = 0, stentTarget = 'lad', heartVerticalOffset = 1.2 }) {
  const { scene } = useGLTF('/models/realistic_human_heart.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const beatRef = useRef(null);
  const isAfter = stage === 'after';
  const colorHex = isAfter ? HEALED_HEX : (SEVERITY_HEX[severityLevel] || SEVERITY_HEX[3]);
  const shellOpacity = isAfter ? 0.26 : 0.34;
  const activeBranch = String(stentTarget || visualFlags?.branch || 'lad').toLowerCase();
  const blocked = Boolean(visualFlags?.blocked);
  const reducedFlow = Boolean(visualFlags?.reducedFlow);
  const verticalLift = Number(heartVerticalOffset) || 0;
  const stageYOffset = stage === 'before' ? 0.34 : 0;
  const centerBiasY = 0;

  const [fit, setFit] = useState({ center: [0, 0, 0], scale: 1.5 });

  useHeartbeat(beatRef, {
    enabled: animationsEnabled,
    bpm: 74,
    intensity: 0.02,
    baseScale: 1,
  });

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Fit model into view regardless of source units/orientation.
    const maxAxis = Math.max(size.x || 1, size.y || 1, size.z || 1);
    const targetSpan = 5.5;
    const scale = targetSpan / maxAxis;

    setFit({ center: [center.x, center.y, center.z], scale });

    cloned.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: isAfter ? 0.22 : 0.34,
        roughness: 0.22,
        metalness: 0.03,
        transparent: true,
        opacity: shellOpacity,
        transmission: 0.55,
        ior: 1.22,
        thickness: 0.32,
        clearcoat: 0.55,
        clearcoatRoughness: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    });

    onLoaded?.();
  }, [cloned, colorHex, onLoaded, shellOpacity]);

  return (
    <group
      position={[0, verticalLift + stageYOffset, 0]}
      rotation={[0, Math.PI, 0]}
    >
      <group
        ref={beatRef}
        scale={fit.scale}
        position={[-fit.center[0], -fit.center[1] + centerBiasY, -fit.center[2]]}
      >
        <primitive object={cloned} />
        <IntraHeartCirculation
          stage={stage}
          reducedFlow={reducedFlow}
          blocked={blocked}
          severityLevel={severityLevel}
        />
        <CoronaryFlowOverlay
          stage={stage}
          reducedFlow={reducedFlow}
          blocked={blocked}
          branch={activeBranch}
          severityLevel={severityLevel}
          selectedSurgery={selectedSurgery}
        />
        <HeartProcedureOverlays
          selectedSurgery={selectedSurgery}
          stage={stage}
          playing={animationsEnabled}
          procedureProgress={procedureProgress}
          stentTarget={activeBranch}
        />
      </group>
    </group>
  );
}

// ── Exported viewer ───────────────────────────────────────────────────────
export default function AnatomyViewer({ condition, stage = 'before', heartOnly = false, autoRotate = false, selectedSurgery = 'CABG', animationsEnabled = true, cameraDistanceMultiplier = 1, procedureProgress = 0, stentTarget = 'lad', cutawayLevel = 0, heartVerticalOffset = 1.2 }) {
  const [loaded, setLoaded] = useState(false);
  const [manualAutoRotate, setManualAutoRotate] = useState(autoRotate);
  const onLoaded = useCallback(() => setLoaded(true), []);
  const isKneeFocus = !heartOnly && (condition?.focusMode === 'knee' || condition?.bodyPart === 'knee');
  const orbitRef = useRef(null);
  const cameraRef = useRef(null);
  const previousStageRef = useRef(stage);

  const cameraConfig = useMemo(() => {
    if (!isKneeFocus) {
      const distanceMultiplier = Math.min(1.4, Math.max(0.65, Number(cameraDistanceMultiplier) || 1));
      const isHeartMode = Boolean(heartOnly);
      const heartY = Number.isFinite(Number(heartVerticalOffset)) ? Number(heartVerticalOffset) : 1.2;
      const targetY = isHeartMode ? heartY - 0.18 : 0;
      const heartDistance = isHeartMode ? 10 : 14;
      const cameraY = isHeartMode ? heartY : 0;
      return {
        position: [0, cameraY, heartDistance * distanceMultiplier],
        fov: isHeartMode ? 38 : 42,
        target: [0, targetY, 0],
        minDistance: (isHeartMode ? 1.6 : 4.2) * distanceMultiplier,
        maxDistance: (isHeartMode ? 12 : 22) * distanceMultiplier,
        autoRotateSpeed: 0.8,
      };
    }

    const sideX = condition?.laterality === 'Left' ? -1.05 : condition?.laterality === 'Right' ? 1.05 : 0;
    return {
      position: [sideX, -1.0, 5.6],
      fov: 36,
      target: [sideX, -1.25, 0.05],
      minDistance: 2.5,
      maxDistance: 9,
      autoRotateSpeed: 0.35,
    };
  }, [isKneeFocus, condition?.laterality, cameraDistanceMultiplier, heartOnly, heartVerticalOffset]);

  useEffect(() => {
    setManualAutoRotate(autoRotate);
  }, [autoRotate, isKneeFocus, condition?.laterality, heartOnly]);

  useEffect(() => {
    if (!heartOnly) {
      previousStageRef.current = stage;
      return;
    }

    if (previousStageRef.current === stage) return;
    previousStageRef.current = stage;

    const controls = orbitRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;

    cam.position.set(...cameraConfig.position);
    controls.target.set(...cameraConfig.target);
    cam.updateProjectionMatrix();
    setManualAutoRotate(autoRotate);
    controls.update();
  }, [stage, heartOnly, cameraConfig, autoRotate]);

  const getControlContext = () => {
    const controls = orbitRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return null;
    return { controls, cam };
  };

  const applyManualControl = (fn) => {
    const ctx = getControlContext();
    if (!ctx) return;
    setManualAutoRotate(false);
    fn(ctx);
    ctx.controls.update();
  };

  const zoomIn = () => {
    applyManualControl(({ controls, cam }) => {
      const offset = cam.position.clone().sub(controls.target);
      const nextLen = THREE.MathUtils.clamp(offset.length() * 0.82, controls.minDistance, controls.maxDistance);
      offset.setLength(nextLen);
      cam.position.copy(controls.target.clone().add(offset));
    });
  };

  const zoomOut = () => {
    applyManualControl(({ controls, cam }) => {
      const offset = cam.position.clone().sub(controls.target);
      const nextLen = THREE.MathUtils.clamp(offset.length() * 1.18, controls.minDistance, controls.maxDistance);
      offset.setLength(nextLen);
      cam.position.copy(controls.target.clone().add(offset));
    });
  };

  const rotateLeft = () => {
    applyManualControl(({ controls, cam }) => {
      const offset = cam.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.28);
      cam.position.copy(controls.target.clone().add(offset));
    });
  };

  const rotateRight = () => {
    applyManualControl(({ controls, cam }) => {
      const offset = cam.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.28);
      cam.position.copy(controls.target.clone().add(offset));
    });
  };

  const resetView = () => {
    const ctx = getControlContext();
    if (!ctx) return;
    const { controls, cam } = ctx;
    cam.position.set(...cameraConfig.position);
    controls.target.set(...cameraConfig.target);
    cam.updateProjectionMatrix();
    setManualAutoRotate(autoRotate);
    controls.update();
  };

  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
        gl={{ antialias: true, toneMappingExposure: 1.15 }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Gradient dark background matching reference image */}
        <color attach="background" args={['#0d1117']} />

        <SceneClipPlane enabled={Boolean(heartOnly && cutawayLevel > 0)} cutawayLevel={cutawayLevel} />

        {/* Anatomy lighting: reveal muscle depth and vessel contrast */}
        {/* Soft overall bounce — low enough that vertex colours dominate */}
        <ambientLight intensity={0.22} />
        {/* Key: top-front, exposes muscle surfaces */}
        <directionalLight position={[2, 9, 6]}   intensity={1.8}
          castShadow shadow-mapSize={2048}
          shadow-camera-near={0.5} shadow-camera-far={50}
          shadow-camera-left={-8} shadow-camera-right={8}
          shadow-camera-top={12} shadow-camera-bottom={-12}
        />
        {/* Fill: left side keeps shadow gradient visible but not pitch black */}
        <directionalLight position={[-5, 2, 3]}  intensity={0.65} />
        {/* Rim: back-top, creates edge glow that separates body from bg */}
        <directionalLight position={[0, 5, -9]}  intensity={0.90} color="#ffd5c0" />
        {/* Low warm point for under-body fill */}
        <pointLight       position={[0, -5, 5]}  intensity={0.28} color="#ffccaa" />

        <Suspense fallback={null}>
          {heartOnly ? (
            <HeartModel
              stage={stage}
              severityLevel={condition?.severityLevel || 3}
              visualFlags={condition?.visualFlags || {}}
              selectedSurgery={selectedSurgery}
              animationsEnabled={animationsEnabled}
              procedureProgress={procedureProgress}
              stentTarget={stentTarget}
              heartVerticalOffset={heartVerticalOffset}
              onLoaded={onLoaded}
            />
          ) : (
            <HumanModel condition={condition} stage={stage} onLoaded={onLoaded} heartOnly={heartOnly} />
          )}
          <Environment preset="city" />
        </Suspense>

        <OrbitControls
          ref={orbitRef}
          enablePan={false}
          target={cameraConfig.target}
          minDistance={cameraConfig.minDistance}
          maxDistance={cameraConfig.maxDistance}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI - 0.1}
          autoRotate={manualAutoRotate}
          autoRotateSpeed={cameraConfig.autoRotateSpeed}
        />
      </Canvas>

      <div className="absolute right-4 bottom-14 flex flex-col gap-2 z-20">
        <button onClick={zoomIn} className="px-3 py-1.5 text-xs rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:bg-slate-700">Zoom In</button>
        <button onClick={zoomOut} className="px-3 py-1.5 text-xs rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:bg-slate-700">Zoom Out</button>
        <button onClick={rotateLeft} className="px-3 py-1.5 text-xs rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:bg-slate-700">Rotate Left</button>
        <button onClick={rotateRight} className="px-3 py-1.5 text-xs rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:bg-slate-700">Rotate Right</button>
        <button onClick={resetView} className="px-3 py-1.5 text-xs rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:bg-slate-700">Reset</button>
      </div>

      {/* Loading spinner — disappears once GLB materials are applied */}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 gap-3 pointer-events-none">
          <svg className="animate-spin w-9 h-9 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-slate-400 text-sm">Loading anatomy model…</p>
        </div>
      )}
    </div>
  );
}
