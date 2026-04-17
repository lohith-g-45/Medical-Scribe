import { useRef, Suspense, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { HEALED_COLOR } from '../utils/medicalBodyParser';

// ── Constants ──────────────────────────────────────────────────────────────
const BONE_COLOR   = '#e8dcc8';   // natural bone/ivory
const ORGAN_COLOR  = '#c0736a';   // visceral pinkish-red
const SKIN_EMISSIVE = '#000000';
const BASE_SCALE = 0.000095;

const SEVERITY_COLORS = {
  1: '#eab308',
  2: '#f97316',
  3: '#ef4444',
  4: '#9333ea',
};

// ── STL model catalogue ────────────────────────────────────────────────────
// Each entry: file (in public/models/), meshId (matches medicalBodyParser IDs),
// position [x,y,z] in scene units, rotation [rx,ry,rz] rad,
// scale (uniform float), baseColor, type ('bone'|'organ'|'skin')
const STL_MODELS = [
  // ── Core organ-focused model set from NIH STL dataset ──
  { file: 'skin.stl',             meshId: 'skin',             position: [0.00,  0.00,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.88, baseColor: '#d4956a', type: 'skin', gender: 'male'  },
  { file: 'body_skin.stl',        meshId: 'body_skin',        position: [0.00,  0.00,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.88, baseColor: '#d7a08a', type: 'skin', gender: 'female'  },
  { file: 'brain.stl',            meshId: 'brain',            position: [0.00,  0.02,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: '#d4a0a0', type: 'organ' },
  { file: 'skull.stl',            meshId: 'skull',            position: [0.00,  0.02,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR, type: 'bone' },
  { file: 'mouth.stl',            meshId: 'mouth',            position: [0.00,  0.02,  0.03], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.35, baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'larynx.stl',           meshId: 'larynx',           position: [0.00,  0.01,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'trachea.stl',          meshId: 'trachea',          position: [0.00,  0.01,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'main_bronchus.stl',    meshId: 'main_bronchus',    position: [0.00,  0.01, -0.01], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'heart.stl',            meshId: 'heart',            position: [0.00, -0.01, -0.03], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.92, baseColor: '#c0302a', type: 'organ' },
  { file: 'lung.stl',             meshId: 'lung',             position: [0.00, -0.01,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: '#c06060', type: 'organ' },
  { file: 'lung_left.stl',        meshId: 'lung_left',        position: [-0.06, -0.01,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: '#c06060', type: 'organ' },
  { file: 'lung_right.stl',       meshId: 'lung_right',       position: [0.06, -0.01,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: '#c06060', type: 'organ' },
  { file: 'thymus.stl',           meshId: 'thymus',           position: [0.00,  0.00,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'blood_vasculature.stl',meshId: 'blood_vasculature',position: [0.00,  0.00,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.98, baseColor: '#b91c1c', type: 'organ' },
  { file: 'liver.stl',            meshId: 'liver',            position: [0.08, -0.06,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.94, baseColor: '#8b3a3a', type: 'organ' },
  { file: 'pancreas.stl',         meshId: 'pancreas',         position: [0.00, -0.05,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'spleen.stl',           meshId: 'spleen',           position: [-0.08,-0.06,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'small_intestine.stl',  meshId: 'small_intestine',  position: [0.00, -0.10,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'large_intestine.stl',  meshId: 'large_intestine',  position: [0.00, -0.09,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'left_kidney.stl',      meshId: 'left_kidney',      position: [-0.09,-0.05, -0.05], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'right_kidney.stl',     meshId: 'right_kidney',     position: [0.09, -0.05, -0.05], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'left_ureter.stl',      meshId: 'left_ureter',      position: [-0.05,-0.10,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'right_ureter.stl',     meshId: 'right_ureter',     position: [0.05, -0.10,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'urinary_bladder.stl',  meshId: 'urinary_bladder',  position: [0.00, -0.13,  0.01], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: ORGAN_COLOR, type: 'organ' },
  { file: 'pelvis.stl',           meshId: 'pelvis',           position: [0.00, -0.12,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone'  },
  { file: 'pelvis_left.stl',      meshId: 'pelvis_left',      position: [0.00, -0.12,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone'  },
  { file: 'pelvis_right.stl',     meshId: 'pelvis_right',     position: [0.00, -0.12,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone'  },
  { file: 'spinal_cord.stl',      meshId: 'spinal_cord',      position: [0.00, -0.02, -0.07], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: '#facc15', type: 'organ' },
  { file: 'spine_thoracic.stl',   meshId: 'spine_thoracic',   position: [0.00, -0.02, -0.07], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'vertebra_lumbar.stl',  meshId: 'vertebra_lumbar',  position: [0.00, -0.10, -0.07], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'left_knee.stl',        meshId: 'left_knee',        position: [-0.10,-0.32,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.90, baseColor: BONE_COLOR,  type: 'bone'  },
  { file: 'right_knee.stl',       meshId: 'right_knee',       position: [0.10, -0.32,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.90, baseColor: BONE_COLOR,  type: 'bone'  },
  { file: 'femur_left.stl',       meshId: 'femur_left',       position: [-0.10, -0.25,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'femur_right.stl',      meshId: 'femur_right',      position: [0.10, -0.25,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'femur_head_left.stl',  meshId: 'femur_head_left',  position: [-0.06, -0.11,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'femur_head_right.stl', meshId: 'femur_head_right', position: [0.06, -0.11,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'tibia_left.stl',       meshId: 'tibia_left',       position: [-0.10, -0.42,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'tibia_right.stl',      meshId: 'tibia_right',      position: [0.10, -0.42,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'humerus_left.stl',     meshId: 'humerus_left',     position: [-0.24,  0.05,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'humerus_right.stl',    meshId: 'humerus_right',    position: [0.24,  0.05,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'radius_left.stl',      meshId: 'radius_left',      position: [-0.30, -0.08,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'radius_right.stl',     meshId: 'radius_right',     position: [0.30, -0.08,  0.00], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'scapula_left.stl',     meshId: 'scapula_left',     position: [-0.20,  0.16, -0.08], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'scapula_right.stl',    meshId: 'scapula_right',    position: [0.20,  0.16, -0.08], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE,        baseColor: BONE_COLOR,  type: 'bone' },
  { file: 'lymph_node.stl',       meshId: 'lymph_node',       position: [0.00, -0.01,  0.02], rotation: [-Math.PI/2, 0, 0], scale: BASE_SCALE * 0.95, baseColor: ORGAN_COLOR, type: 'organ' },
];

// ── Mesh-ID → approximate world-space centre for glow spheres ─────────────
// These are calibrated for the BodyParts3D coordinate system after applying
// the uniform scale=0.000095 and -90° X rotation (Z-up → Y-up).
// Units: scene units (roughly metres scale).
const GLOW_CENTRES = {
  brain:            [ 0.00,  1.62,  0.00],
  mouth:            [ 0.00,  1.45,  0.06],
  larynx:           [ 0.00,  1.30,  0.00],
  trachea:          [ 0.00,  1.15,  0.00],
  main_bronchus:    [ 0.00,  1.02,  0.00],
  heart:            [ 0.00,  0.92, -0.04],
  lung:             [ 0.00,  0.95,  0.00],
  thymus:           [ 0.00,  1.03,  0.00],
  blood_vasculature:[ 0.00,  0.85,  0.00],
  liver:            [ 0.12,  0.62,  0.00],
  pancreas:         [ 0.00,  0.55,  0.00],
  spleen:           [-0.14,  0.62,  0.00],
  small_intestine:  [ 0.00,  0.42,  0.00],
  large_intestine:  [ 0.00,  0.48,  0.00],
  left_kidney:      [-0.12,  0.62, -0.08],
  right_kidney:     [ 0.12,  0.62, -0.08],
  left_ureter:      [-0.09,  0.42, -0.02],
  right_ureter:     [ 0.09,  0.42, -0.02],
  urinary_bladder:  [ 0.00,  0.26,  0.00],
  pelvis:           [ 0.00,  0.30,  0.00],
  spinal_cord:      [ 0.00,  0.86, -0.10],
  spine_thoracic:   [ 0.00,  0.82, -0.09],
  vertebra_lumbar:  [ 0.00,  0.52, -0.08],
  left_knee:        [-0.11, -0.28,  0.00],
  right_knee:       [ 0.11, -0.28,  0.00],
  femur_left:       [-0.10, -0.06,  0.00],
  femur_right:      [ 0.10, -0.06,  0.00],
  tibia_left:       [-0.10, -0.48,  0.00],
  tibia_right:      [ 0.10, -0.48,  0.00],
  humerus_left:     [-0.28,  0.88,  0.00],
  humerus_right:    [ 0.28,  0.88,  0.00],
  radius_left:      [-0.34,  0.64,  0.00],
  radius_right:     [ 0.34,  0.64,  0.00],
  scapula_left:     [-0.20,  1.02, -0.07],
  scapula_right:    [ 0.20,  1.02, -0.07],
  lymph_node:       [ 0.00,  0.86,  0.04],
};

const GLOW_RADIUS = {
  brain: 0.10,
  mouth: 0.08,
  larynx: 0.07,
  trachea: 0.07,
  main_bronchus: 0.08,
  heart: 0.12,
  lung: 0.16,
  thymus: 0.08,
  blood_vasculature: 0.14,
  liver: 0.12,
  pancreas: 0.10,
  spleen: 0.10,
  small_intestine: 0.13,
  large_intestine: 0.14,
  left_kidney: 0.09,
  right_kidney: 0.09,
  left_ureter: 0.07,
  right_ureter: 0.07,
  urinary_bladder: 0.09,
  pelvis: 0.14,
  spinal_cord: 0.12,
  left_knee: 0.10,
  right_knee: 0.10,
  lymph_node: 0.08,
};

// ── Pulsing glow overlay sphere ────────────────────────────────────────────
function PulsingGlow({ position, radius, color, severity }) {
  const meshRef = useRef();
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 2.8) * 0.07 * Math.min(severity, 3);
    meshRef.current.scale.setScalar(pulse);
    meshRef.current.material.opacity = 0.38 + Math.sin(t * 2.8) * 0.14;
  });
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[radius, 18, 18]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.4}
        emissive={color}
        emissiveIntensity={1.8}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Single STL part ────────────────────────────────────────────────────────
function STLPart({ model, isAffected, highlightColor, highlightEmissive, emissiveIntensity, isBefore, contextOnly = false, scaleBoost = 1 }) {
  const geometry = useLoader(STLLoader, `/models/${model.file}`);
  const isSkin = model.type === 'skin';
  const swellFactor = isAffected && isBefore ? (model.type === 'bone' ? 1.18 : 1.1) : 1.0;
  const color   = isAffected ? highlightColor    : contextOnly ? '#4b5563' : model.baseColor;
  const emissive= isAffected ? highlightEmissive : '#000000';
  const eiVal   = isAffected ? emissiveIntensity  : 0;
  const skinOpacity = contextOnly ? 0.18 : isAffected ? 0.26 : 0.14;
  const baseOpacity = contextOnly ? 0.22 : 1;

  return (
    <mesh
      geometry={geometry}
      position={model.position}
      rotation={model.rotation}
      scale={[
        model.scale * swellFactor * scaleBoost,
        model.scale * swellFactor * scaleBoost,
        model.scale * swellFactor * scaleBoost,
      ]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={eiVal}
        roughness={model.type === 'skin' ? 0.78 : model.type === 'organ' ? 0.6 : 0.55}
        metalness={model.type === 'bone' ? 0.08 : 0}
        side={model.type === 'skin' ? THREE.DoubleSide : THREE.DoubleSide}
        transparent={isSkin || contextOnly}
        opacity={isSkin ? skinOpacity : baseOpacity}
        depthWrite={!isSkin}
        polygonOffset
        polygonOffsetFactor={isSkin ? 2 : 0}
        polygonOffsetUnits={isSkin ? 2 : 0}
      />
    </mesh>
  );
}

function buildFocusModelIds({ focusMeshes = [], bodyPart = '', laterality = '' }) {
  const ids = new Set(focusMeshes);

  // For knee cases, render the complete affected leg (hip-to-shin) for context.
  if (bodyPart === 'knee' || ids.has('left_knee') || ids.has('right_knee')) {
    if (laterality === 'Left' || ids.has('left_knee')) {
      ids.add('pelvis_left');
      ids.add('femur_head_left');
      ids.add('femur_left');
      ids.add('left_knee');
      ids.add('tibia_left');
    }
    if (laterality === 'Right' || ids.has('right_knee')) {
      ids.add('pelvis_right');
      ids.add('femur_head_right');
      ids.add('femur_right');
      ids.add('right_knee');
      ids.add('tibia_right');
    }
    if (!laterality && !ids.has('left_knee') && !ids.has('right_knee')) {
      ids.add('pelvis_left');
      ids.add('femur_head_left');
      ids.add('femur_left');
      ids.add('left_knee');
      ids.add('tibia_left');
    }
  }

  return Array.from(ids);
}

function FocusedAnatomyMesh({ condition, stage }) {
  const isBefore = stage === 'before';
  const severity = condition?.severityLevel || 2;
  const severityColor = SEVERITY_COLORS[severity] || '#ef4444';
  const highlightColor = severityColor;
  const highlightEmissive = isBefore ? severityColor : '#fb923c';
  const emissiveIntensity = isBefore ? 0.55 : 0.75;

  const focusModelIds = buildFocusModelIds({
    focusMeshes: condition?.focusMeshes || [],
    bodyPart: condition?.bodyPart || '',
    laterality: condition?.laterality || '',
  });

  const models = useMemo(
    () => STL_MODELS.filter((m) => focusModelIds.includes(m.meshId) && m.type !== 'skin'),
    [focusModelIds]
  );

  const files = useMemo(() => models.map((m) => `/models/${m.file}`), [models]);
  const geometries = useLoader(STLLoader, files);

  const isKneeCase = condition?.bodyPart === 'knee';
  const isAfter = stage === 'after';

  const normalized = useMemo(() => {
    const union = new THREE.Box3();
    const hasGeom = Array.isArray(geometries) ? geometries.length > 0 : Boolean(geometries);
    if (!hasGeom) return { center: new THREE.Vector3(0, 0, 0), scale: 1, boundsByMeshId: {} };

    const geoList = Array.isArray(geometries) ? geometries : [geometries];
    const boundsByMeshId = {};

    geoList.forEach((g, index) => {
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox) {
        const model = models[index];
        const bb = g.boundingBox.clone();
        const euler = new THREE.Euler(...model.rotation);
        const quat = new THREE.Quaternion().setFromEuler(euler);
        const pos = new THREE.Vector3(...model.position);
        const scl = new THREE.Vector3(model.scale, model.scale, model.scale);
        const mat = new THREE.Matrix4().compose(pos, quat, scl);
        bb.applyMatrix4(mat);
        union.union(bb);
        boundsByMeshId[model.meshId] = bb;
      }
    });

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    union.getSize(size);
    union.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Normalize all focused parts to a consistent viewport size.
    const scale = 1.45 / maxDim;
    return { center, scale, boundsByMeshId };
  }, [geometries, models]);

  const damageMarkerPosition = useMemo(() => {
    if (!isKneeCase) return null;

    const laterality = condition?.laterality === 'Right' ? 'right' : 'left';
    const preferredKneeId = laterality === 'right' ? 'right_knee' : 'left_knee';
    const kneeBounds =
      normalized.boundsByMeshId[preferredKneeId] ||
      normalized.boundsByMeshId.left_knee ||
      normalized.boundsByMeshId.right_knee;

    if (!kneeBounds) return null;

    const center = kneeBounds.getCenter(new THREE.Vector3());
    const size = kneeBounds.getSize(new THREE.Vector3());
    const medialDir = laterality === 'right' ? -1 : 1;
    const lateralDir = -medialDir;

    const subpart = condition?.kneeSubpart || 'generic';
    const offsetMap = {
      acl:             [0,               size.y * 0.10,  size.z * 0.20],
      pcl:             [0,               size.y * 0.06, -size.z * 0.18],
      mcl:             [size.x * 0.22 * medialDir,   size.y * 0.02,  0],
      lcl:             [size.x * 0.22 * lateralDir,  size.y * 0.02,  0],
      meniscus:        [0,              -size.y * 0.02,  size.z * 0.04],
      patella:         [0,               size.y * 0.16,  size.z * 0.30],
      patellar_tendon: [0,              -size.y * 0.16,  size.z * 0.22],
      generic:         [0,               0,              size.z * 0.12],
    };

    const [ox, oy, oz] = offsetMap[subpart] || offsetMap.generic;
    return [
      center.x + ox - normalized.center.x,
      center.y + oy - normalized.center.y,
      center.z + oz - normalized.center.z,
    ];
  }, [condition?.bodyPart, condition?.laterality, condition?.kneeSubpart, isKneeCase, normalized]);

  const damageMarkerColor = isAfter ? '#22c55e' : '#ef4444';

  const geoList = Array.isArray(geometries) ? geometries : [geometries];

  return (
    <Center>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={[normalized.scale, normalized.scale, normalized.scale]}>
        <group position={[-normalized.center.x, -normalized.center.y, -normalized.center.z]}>
          {models.map((model, index) => {
            const isAffected = (condition?.affectedMeshes || []).includes(model.meshId);
            return (
              <mesh
                key={model.file}
                geometry={geoList[index]}
                position={model.position}
                rotation={model.rotation}
                scale={[model.scale, model.scale, model.scale]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial
                  color={
                    isKneeCase
                      ? (isAffected ? (isAfter ? '#9fd7b3' : '#f0d8d4') : model.baseColor)
                      : (isAffected ? highlightColor : model.baseColor)
                  }
                  emissive={
                    isKneeCase
                      ? (isAffected ? (isAfter ? '#22c55e' : '#ef4444') : '#000000')
                      : (isAffected ? highlightEmissive : '#000000')
                  }
                  emissiveIntensity={isKneeCase ? (isAffected ? (isAfter ? 0.22 : 0.18) : 0) : (isAffected ? emissiveIntensity : 0)}
                  roughness={model.type === 'organ' ? 0.6 : 0.55}
                  metalness={model.type === 'bone' ? 0.08 : 0}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          })}

          {damageMarkerPosition && (
            <>
              <mesh position={damageMarkerPosition}>
                <sphereGeometry args={[0.022, 24, 24]} />
                <meshStandardMaterial
                  color={damageMarkerColor}
                  emissive={damageMarkerColor}
                  emissiveIntensity={1.4}
                />
              </mesh>
              <PulsingGlow
                position={damageMarkerPosition}
                radius={isAfter ? 0.048 : 0.058}
                color={damageMarkerColor}
                severity={severity}
              />
            </>
          )}
        </group>
      </group>
    </Center>
  );
}

function expandFocusMeshes(meshes = []) {
  const set = new Set(meshes);

  if (set.has('left_knee')) {
    set.add('femur_left');
    set.add('tibia_left');
  }

  if (set.has('right_knee')) {
    set.add('femur_right');
    set.add('tibia_right');
  }

  return Array.from(set);
}

// ── Full anatomical body assembled from STL parts ──────────────────────────
function HumanBodyMesh({ affectedMeshes, primaryGlowMeshes, severity, stage, focusOnly = false, focusMeshes = [], patientGender = '' }) {
  const isBefore = stage === 'before';
  const severityColor    = SEVERITY_COLORS[severity] || '#ef4444';
  // For post-surgery, show the severity color (what was treated) NOT the healed color
  const highlightColor   = severityColor;
  const highlightEmissive = isBefore ? severityColor : '#fb923c';  // Orange for post-treatment glow
  const emissiveIntensity = isBefore ? 0.55 : 0.75;  // Brighter for post to show it clearly

  const targetFocusMeshes = focusMeshes.length > 0 ? focusMeshes : affectedMeshes;
  const expandedFocusMeshes = expandFocusMeshes(targetFocusMeshes);
  const normalizedGender = String(patientGender || '').toLowerCase();
  const preferredSkinMeshId = normalizedGender === 'female' ? 'body_skin' : 'skin';
  const isKneeFocus = expandedFocusMeshes.includes('left_knee') || expandedFocusMeshes.includes('right_knee');

  const visibleModels = STL_MODELS.filter((model) => {
    if (!focusOnly) return true;
    if (model.type === 'skin') {
      return model.meshId === preferredSkinMeshId;
    }
    return expandedFocusMeshes.includes(model.meshId);
  });

  return (
    <Center>
      <group>
        {visibleModels.map((model) => {
          const isAffected = affectedMeshes.includes(model.meshId);
          const isContextOnly = focusOnly && model.type === 'skin';
          return (
            <STLPart
              key={model.file}
              model={model}
              isAffected={isAffected}
              highlightColor={highlightColor}
              highlightEmissive={highlightEmissive}
              emissiveIntensity={emissiveIntensity}
              isBefore={isBefore}
              contextOnly={isContextOnly}
              scaleBoost={focusOnly ? (isAffected ? (isKneeFocus ? 3.4 : 2.4) : (isKneeFocus ? 2.8 : 2.0)) : 1}
            />
          );
        })}

        {/* ── Pulsing glow overlays on affected regions ── */}
        {!focusOnly && primaryGlowMeshes.map((id) => {
          const pos = GLOW_CENTRES[id];
          if (!pos) return null;
          const r = GLOW_RADIUS[id] || 0.12;
          return (
            <PulsingGlow
              key={id}
              position={pos}
              radius={r}
              color={highlightColor}
              severity={severity}
            />
          );
        })}

        {/* ── Ground shadow disc ── */}
        <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.5, 32]} />
          <meshStandardMaterial color="#c0c0c0" transparent opacity={0.22} />
        </mesh>
      </group>
    </Center>
  );
}

// ── Scene wrapper ──────────────────────────────────────────────────────────
function Scene({ condition, stage, controlsRef, autoRotateEnabled = true }) {
  const { affectedMeshes, primaryGlowMeshes, severityLevel, focusOnly = false, focusMeshes = [], patientGender = '' } = condition;
  const targetId = focusMeshes?.[0] || primaryGlowMeshes?.[0] || affectedMeshes?.[0] || 'heart';
  const focusPoint = focusOnly ? [0, 0, 0] : (GLOW_CENTRES[targetId] || [0, 0.8, 0]);
  const isAfter = stage === 'after';
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
      <directionalLight position={[-3, 3, -2]} intensity={0.35} color="#b8d4ff" />
      <pointLight position={[0, 2, 3]} intensity={0.5} color="#fff5e0" />
      <pointLight
        position={[-1.8, 1.5, 1.2]}
        intensity={0.45}
        color={isAfter ? '#22c55e' : '#ef4444'}
      />

      {focusOnly ? (
        <FocusedAnatomyMesh condition={condition} stage={stage} />
      ) : (
        <HumanBodyMesh
          affectedMeshes={affectedMeshes}
          primaryGlowMeshes={primaryGlowMeshes}
          severity={severityLevel}
          stage={stage}
          focusOnly={focusOnly}
          focusMeshes={focusMeshes}
          patientGender={patientGender}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        target={focusPoint}
        minDistance={focusOnly ? 0.5 : 1.5}
        maxDistance={focusOnly ? 2.4 : 6}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI - 0.2}
        autoRotate={autoRotateEnabled}
        autoRotateSpeed={focusOnly ? 0.35 : 0.5}
      />
    </>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function LoadingBody() {
  return (
    <mesh position={[0, 0, 0]}>
      <capsuleGeometry args={[0.18, 1.4, 8, 16]} />
      <meshStandardMaterial color="#334155" transparent opacity={0.4} wireframe />
    </mesh>
  );
}

// ── Public component ───────────────────────────────────────────────────────
export default function HumanBody3D({ condition, stage = 'before' }) {
  const orbitRef = useRef(null);
  const cameraRef = useRef(null);
  const [manualAutoRotate, setManualAutoRotate] = useState(true);
  const focusOnly = Boolean(condition?.focusOnly);
  const focusMeshes = condition?.focusMeshes || [];
  const targetId = focusMeshes?.[0] || condition?.primaryGlowMeshes?.[0] || condition?.affectedMeshes?.[0] || 'heart';
  const target = GLOW_CENTRES[targetId] || [0, 0.8, 0];
  const cameraPosition = focusOnly
    ? [0.15, 0.2, 1.45]
    : [0, 0.4, 3.2];

  useEffect(() => {
    setManualAutoRotate(true);
  }, [focusOnly, targetId, stage]);

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
    cam.position.set(...cameraPosition);
    controls.target.set(focusOnly ? 0 : target[0], focusOnly ? 0 : target[1], focusOnly ? 0 : target[2]);
    cam.updateProjectionMatrix();
    setManualAutoRotate(true);
    controls.update();
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', position: 'relative' }}>
      <Canvas
        camera={{ position: cameraPosition, fov: focusOnly ? 34 : 45 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', width: '100%', height: '100%' }}
        shadows
      >
        <Suspense fallback={<LoadingBody />}>
          <Scene condition={condition} stage={stage} controlsRef={orbitRef} autoRotateEnabled={manualAutoRotate} />
        </Suspense>
      </Canvas>

      <div style={{ position: 'absolute', right: 16, bottom: 56, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 20 }}>
        <button onClick={zoomIn} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #64748b', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0' }}>Zoom In</button>
        <button onClick={zoomOut} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #64748b', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0' }}>Zoom Out</button>
        <button onClick={rotateLeft} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #64748b', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0' }}>Rotate Left</button>
        <button onClick={rotateRight} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #64748b', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0' }}>Rotate Right</button>
        <button onClick={resetView} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #64748b', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0' }}>Reset</button>
      </div>
    </div>
  );
}
