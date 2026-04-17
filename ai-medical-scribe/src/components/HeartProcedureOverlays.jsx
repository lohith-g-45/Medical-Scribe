import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useHeartbeat, useFlowAnimation, usePulseSignal } from '../hooks/heartAnimations';

const RED = '#ef4444';
const GREEN = '#22c55e';
const BLUE = '#3b82f6';

function CABGOverlay({ stage, playing }) {
  const blockedMatRef = useRef(null);
  const graftMatRef = useRef(null);
  const labelRef = useRef(null);
  const stenosisRef = useRef(null);
  const particlesRef = useRef([]);
  const ischemicParticlesRef = useRef([]);

  // Aortic root -> distal LAD style bypass path (kept close to anterior heart surface).
  const bypassCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.04, 0.23, 0.11),
    new THREE.Vector3(0.02, 0.20, 0.14),
    new THREE.Vector3(0.10, 0.14, 0.13),
    new THREE.Vector3(0.18, 0.07, 0.11),
  ]), []);

  const bypassTube = useMemo(
    () => new THREE.TubeGeometry(bypassCurve, 72, 0.012, 12, false),
    [bypassCurve]
  );

  // Native diseased segment shown slightly under the graft.
  const blockedCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.03, 0.16, 0.10),
    new THREE.Vector3(0.08, 0.12, 0.11),
    new THREE.Vector3(0.20, 0.06, 0.09),
  ]), []);

  const blockedTube = useMemo(
    () => new THREE.TubeGeometry(blockedCurve, 62, 0.010, 10, false),
    [blockedCurve]
  );

  usePulseSignal(blockedMatRef, {
    enabled: playing && stage === 'before',
    minIntensity: 0.6,
    maxIntensity: 1.8,
    speed: 4.2,
    color: RED,
  });

  useFlowAnimation(particlesRef, bypassCurve, {
    enabled: playing,
    speed: stage === 'after' ? 0.36 : 0.24,
    pulse: 1.2,
  });

  useFlowAnimation(ischemicParticlesRef, blockedCurve, {
    enabled: playing && stage === 'before',
    speed: 0.16,
    pulse: 0.9,
  });

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const isAfter = stage === 'after';

    if (graftMatRef.current) {
      const intensity = isAfter ? 1.35 : 0.22;
      graftMatRef.current.emissiveIntensity = intensity;
      graftMatRef.current.opacity = isAfter ? 0.95 : 0.28;
      graftMatRef.current.color = new THREE.Color(isAfter ? GREEN : '#64748b');
      graftMatRef.current.emissive = new THREE.Color(isAfter ? GREEN : '#334155');
    }

    if (blockedMatRef.current) {
      blockedMatRef.current.opacity = isAfter ? 0.2 : 0.9;
      blockedMatRef.current.emissiveIntensity = isAfter ? 0.2 : 1.0;
    }

    if (stenosisRef.current) {
      const pulse = 1 + Math.sin(t * 4.8) * 0.08;
      stenosisRef.current.visible = !isAfter;
      stenosisRef.current.scale.set(pulse, pulse, pulse);
    }

    if (labelRef.current) {
      const flowPct = isAfter ? 92 : 28;
      const nextText = `Bypass perfusion ${flowPct}%`;
      if (labelRef.current.text !== nextText) {
        labelRef.current.text = nextText;
        labelRef.current.sync();
      }
      labelRef.current.color = isAfter ? '#86efac' : '#fca5a5';
    }
  });

  return (
    <group>
      <mesh geometry={blockedTube}>
        <meshStandardMaterial
          ref={blockedMatRef}
          color={RED}
          emissive={RED}
          emissiveIntensity={1.0}
          transparent
          opacity={0.88}
        />
      </mesh>

      <mesh geometry={bypassTube}>
        <meshStandardMaterial
          ref={graftMatRef}
          color={GREEN}
          emissive={GREEN}
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh ref={stenosisRef} position={[0.10, 0.12, 0.11]} rotation={[0.1, 0.5, 0.2]}>
        <torusGeometry args={[0.024, 0.006, 12, 26]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={1.4} transparent opacity={0.95} />
      </mesh>

      {/* Anastomosis markers: proximal (aorta) and distal (coronary). */}
      <mesh position={[-0.04, 0.23, 0.11]}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0.18, 0.07, 0.11]}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={1.4} />
      </mesh>

      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} ref={(el) => { particlesRef.current[i] = el; }}>
          <sphereGeometry args={[0.010, 10, 10]} />
          <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={1.0} />
        </mesh>
      ))}

      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={`ischemic-${i}`} ref={(el) => { ischemicParticlesRef.current[i] = el; }}>
          <sphereGeometry args={[0.009, 10, 10]} />
          <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={0.95} transparent opacity={0.9} />
        </mesh>
      ))}

      <Text
        ref={labelRef}
        position={[0.0, 0.30, 0.12]}
        fontSize={0.038}
        color={stage === 'after' ? '#86efac' : '#fca5a5'}
        anchorX="center"
        anchorY="middle"
      >
        Bypass perfusion 0%
      </Text>
    </group>
  );
}

function ValveOverlay({ stage, playing }) {
  const groupRef = useRef(null);
  const leftLeafRef = useRef(null);
  const rightLeafRef = useRef(null);
  const markerMatRef = useRef(null);
  const stenosisRef = useRef(null);
  const apertureRef = useRef(null);
  const labelRef = useRef(null);

  useHeartbeat(groupRef, { enabled: playing, bpm: 72, intensity: 0.03, baseScale: 1 });
  usePulseSignal(markerMatRef, {
    enabled: playing,
    minIntensity: stage === 'before' ? 0.5 : 0.3,
    maxIntensity: stage === 'before' ? 1.4 : 0.9,
    speed: 3.0,
    color: stage === 'before' ? RED : GREEN,
  });

  useFrame(({ clock }) => {
    if (!leftLeafRef.current || !rightLeafRef.current) return;

    const t = clock.getElapsedTime();
    const cycle = 0.5 + 0.5 * Math.sin(t * 3.0);
    // Intentionally widen before/after separation so the procedural effect is obvious.
    const minOpen = stage === 'before' ? 0.03 : 0.26;
    const maxOpen = stage === 'before' ? 0.16 : 0.95;
    const open = minOpen + (maxOpen - minOpen) * cycle;
    const openingPct = Math.round((open / 0.95) * 100);

    leftLeafRef.current.rotation.y = open;
    rightLeafRef.current.rotation.y = -open;

    if (apertureRef.current) {
      const apertureScale = THREE.MathUtils.lerp(0.34, 1.0, openingPct / 100);
      apertureRef.current.scale.set(apertureScale, apertureScale, 1);
    }

    if (stenosisRef.current) {
      const pulse = 1 + Math.sin(t * 4.0) * 0.09;
      stenosisRef.current.visible = stage === 'before';
      stenosisRef.current.scale.set(pulse, pulse, pulse);
    }

    if (labelRef.current) {
      const nextText = `Valve opening ${openingPct}%`;
      if (labelRef.current.text !== nextText) {
        labelRef.current.text = nextText;
        labelRef.current.sync();
      }
      labelRef.current.color = stage === 'before' ? '#fca5a5' : '#86efac';
    }
  });

  return (
    <group ref={groupRef} position={[0.02, 0.08, 0.12]}>
      <mesh ref={leftLeafRef} position={[-0.04, 0, 0]}>
        <boxGeometry args={[0.10, 0.012, 0.12]} />
        <meshStandardMaterial color="#f8fafc" emissive="#94a3b8" emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={rightLeafRef} position={[0.04, 0, 0]}>
        <boxGeometry args={[0.10, 0.012, 0.12]} />
        <meshStandardMaterial color="#f8fafc" emissive="#94a3b8" emissiveIntensity={0.25} />
      </mesh>

      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.11, 0.009, 12, 40]} />
        <meshStandardMaterial
          ref={markerMatRef}
          color={stage === 'before' ? RED : GREEN}
          emissive={stage === 'before' ? RED : GREEN}
          emissiveIntensity={0.7}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Pre-op stenosis ring: visible only before surgery to indicate restricted orifice. */}
      <mesh ref={stenosisRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.072, 0.010, 12, 40]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={1.25} transparent opacity={0.96} />
      </mesh>

      {/* Dynamic aperture indicator: shrunk in stenosis, expanded after repair. */}
      <mesh ref={apertureRef} position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.045, 0.082, 36]} />
        <meshStandardMaterial
          color={stage === 'before' ? '#fca5a5' : '#86efac'}
          emissive={stage === 'before' ? '#ef4444' : '#22c55e'}
          emissiveIntensity={0.75}
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Text
        ref={labelRef}
        position={[0, 0.17, 0.05]}
        fontSize={0.04}
        color={stage === 'before' ? '#fca5a5' : '#86efac'}
        anchorX="center"
        anchorY="middle"
      >
        Valve opening 0%
      </Text>
    </group>
  );
}

function StentOverlay({ stage, playing, procedureProgress = 0, stentTarget = 'lad' }) {
  const stentRef = useRef(null);
  const arteryRef = useRef(null);
  const narrowingRef = useRef(null);
  const labelRef = useRef(null);
  const lumenRef = useRef(null);
  const stentMatRef = useRef(null);
  const arteryMatRef = useRef(null);
  const restrictedFlowMatRef = useRef(null);
  const restoredFlowMatRef = useRef(null);
  const inflowRefs = useRef([]);
  const lesionRefs = useRef([]);
  const outflowRefs = useRef([]);

  const inflowCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.08, 0.18, 0.08),
    new THREE.Vector3(0.16, 0.14, 0.08),
    new THREE.Vector3(0.22, 0.11, 0.08),
  ]), []);

  const lesionCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.22, 0.11, 0.08),
    new THREE.Vector3(0.24, 0.08, 0.08),
    new THREE.Vector3(0.27, 0.05, 0.08),
  ]), []);

  const outflowCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.27, 0.05, 0.08),
    new THREE.Vector3(0.33, 0.01, 0.08),
    new THREE.Vector3(0.39, -0.03, 0.08),
  ]), []);

  const lesionTube = useMemo(
    () => new THREE.TubeGeometry(lesionCurve, 48, 0.014, 12, false),
    [lesionCurve]
  );

  const targetPosition = useMemo(() => {
    const map = {
      lad: [0.24, 0.08, 0.08],
      lcx: [0.16, 0.13, 0.09],
      rca: [0.31, 0.02, 0.08],
    };
    return map[String(stentTarget || 'lad').toLowerCase()] || map.lad;
  }, [stentTarget]);

  const transition = stage === 'after' ? 1 : stage === 'virtual' ? THREE.MathUtils.clamp(procedureProgress, 0, 1) : 0;

  useFlowAnimation(inflowRefs, inflowCurve, {
    enabled: playing,
    speed: stage === 'before' ? 0.1 : stage === 'virtual' ? (0.12 + 0.20 * transition) : 0.32,
    pulse: 1.0,
  });

  useFlowAnimation(lesionRefs, lesionCurve, {
    enabled: playing,
    speed: stage === 'before' ? 0.07 : stage === 'virtual' ? (0.09 + 0.23 * transition) : 0.3,
    pulse: 1.35,
  });

  useFlowAnimation(outflowRefs, outflowCurve, {
    enabled: playing,
    speed: stage === 'before' ? 0.09 : stage === 'virtual' ? (0.12 + 0.24 * transition) : 0.35,
    pulse: 1.15,
  });

  useFrame(({ clock }) => {
    if (!stentRef.current || !arteryRef.current) return;

    const t = clock.getElapsedTime();
    const phase = playing ? (0.5 + 0.5 * Math.sin(t * 2.8)) : 1;
    const transitionNow = stage === 'after' ? 1 : stage === 'virtual' ? THREE.MathUtils.clamp(procedureProgress, 0, 1) : 0;

    const arteryLumen = THREE.MathUtils.lerp(0.42, 0.98, transitionNow) + 0.06 * phase;
    const stentExpand = THREE.MathUtils.lerp(0.34, 1.02, transitionNow) + 0.05 * phase;
    const lumenPct = Math.round(THREE.MathUtils.lerp(34, 96, transitionNow));

    stentRef.current.scale.set(stentExpand, 1, stentExpand);
    arteryRef.current.scale.set(arteryLumen, 1, arteryLumen);

    if (narrowingRef.current) {
      narrowingRef.current.visible = transitionNow < 0.98;
      const pulse = 1 + Math.sin(t * 5.2) * 0.1;
      narrowingRef.current.scale.set(pulse, 1, pulse);
    }

    if (stentMatRef.current) {
      stentMatRef.current.opacity = THREE.MathUtils.lerp(0.62, 1, transitionNow);
      stentMatRef.current.emissive = new THREE.Color(transitionNow > 0.95 ? GREEN : '#60a5fa');
      stentMatRef.current.color = new THREE.Color(transitionNow > 0.95 ? '#86efac' : BLUE);
      stentMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.55, 1.25, transitionNow);
    }

    if (arteryMatRef.current) {
      arteryMatRef.current.color = new THREE.Color(transitionNow > 0.86 ? '#22c55e' : RED);
      arteryMatRef.current.emissive = new THREE.Color(transitionNow > 0.86 ? '#16a34a' : RED);
      arteryMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.45, 0.95, transitionNow);
      arteryMatRef.current.opacity = THREE.MathUtils.lerp(0.48, 0.42, transitionNow);
    }

    if (restrictedFlowMatRef.current) {
      restrictedFlowMatRef.current.opacity = THREE.MathUtils.lerp(0.82, 0.05, transitionNow);
      restrictedFlowMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(1.25, 0.2, transitionNow);
    }

    if (restoredFlowMatRef.current) {
      restoredFlowMatRef.current.opacity = THREE.MathUtils.lerp(0.05, 0.92, transitionNow);
      restoredFlowMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.2, 1.2, transitionNow);
    }

    if (lumenRef.current) {
      const ringScale = THREE.MathUtils.lerp(0.45, 1.0, lumenPct / 100);
      lumenRef.current.scale.set(ringScale, ringScale, 1);
    }

    if (labelRef.current) {
      const stageLabel = transitionNow < 0.02 ? 'Pre-op lumen' : transitionNow >= 0.98 ? 'Post-op lumen' : 'Virtual deployment';
      const nextText = `${stageLabel} ${lumenPct}%`;
      if (labelRef.current.text !== nextText) {
        labelRef.current.text = nextText;
        labelRef.current.sync();
      }
      labelRef.current.color = transitionNow >= 0.98 ? '#86efac' : transitionNow > 0.02 ? '#bfdbfe' : '#fca5a5';
    }
  });

  return (
    <group position={targetPosition} rotation={[0, 0, Math.PI / 2.9]}>
      <mesh ref={arteryRef}>
        <cylinderGeometry args={[0.034, 0.034, 0.34, 24, 1, true]} />
        <meshStandardMaterial ref={arteryMatRef} color={RED} emissive={RED} emissiveIntensity={0.45} transparent opacity={0.48} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={stentRef}>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 22, 1, true]} />
        <meshStandardMaterial ref={stentMatRef} color={BLUE} emissive={BLUE} emissiveIntensity={1.0} wireframe transparent opacity={0.95} />
      </mesh>

      <mesh ref={narrowingRef}>
        <torusGeometry args={[0.042, 0.008, 12, 24]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={1.2} transparent opacity={0.9} />
      </mesh>

      <mesh geometry={lesionTube}>
        <meshStandardMaterial
          ref={restrictedFlowMatRef}
          color={'#ef4444'}
          emissive={'#ef4444'}
          emissiveIntensity={1.25}
          transparent
          opacity={0.82}
        />
      </mesh>

      <mesh geometry={lesionTube}>
        <meshStandardMaterial
          ref={restoredFlowMatRef}
          color={'#22c55e'}
          emissive={'#22c55e'}
          emissiveIntensity={0.2}
          transparent
          opacity={0.05}
        />
      </mesh>

      <mesh ref={lumenRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.012, 0.03, 28]} />
        <meshStandardMaterial color={stage === 'after' ? GREEN : stage === 'virtual' ? '#3b82f6' : RED} emissive={stage === 'after' ? GREEN : stage === 'virtual' ? '#3b82f6' : RED} emissiveIntensity={0.9} side={THREE.DoubleSide} />
      </mesh>

      <Text
        ref={labelRef}
        position={[0, 0.15, 0.03]}
        fontSize={0.032}
        color={stage === 'after' ? '#86efac' : stage === 'virtual' ? '#bfdbfe' : '#fca5a5'}
        anchorX="center"
        anchorY="middle"
      >
        Pre-op lumen 0%
      </Text>

      <Text
        position={[0.08, 0.01, 0.03]}
        fontSize={0.023}
        color={'#fca5a5'}
        anchorX="center"
        anchorY="middle"
      >
        Restricted flow zone
      </Text>

      <Text
        position={[0.33, -0.02, 0.03]}
        fontSize={0.023}
        color={'#86efac'}
        anchorX="center"
        anchorY="middle"
      >
        Restored flow
      </Text>

      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`inflow-${i}`} ref={(el) => { inflowRefs.current[i] = el; }}>
          <sphereGeometry args={[0.006, 10, 10]} />
          <meshStandardMaterial
            color={stage === 'after' ? '#22c55e' : stage === 'virtual' ? '#60a5fa' : '#f97316'}
            emissive={stage === 'after' ? '#22c55e' : stage === 'virtual' ? '#60a5fa' : '#f97316'}
            emissiveIntensity={1.0}
            transparent
            opacity={THREE.MathUtils.lerp(0.55, 0.9, transition)}
          />
        </mesh>
      ))}

      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`lesion-${i}`} ref={(el) => { lesionRefs.current[i] = el; }}>
          <sphereGeometry args={[0.0065, 10, 10]} />
          <meshStandardMaterial
            color={stage === 'after' ? '#4ade80' : stage === 'virtual' ? '#3b82f6' : '#ef4444'}
            emissive={stage === 'after' ? '#4ade80' : stage === 'virtual' ? '#3b82f6' : '#ef4444'}
            emissiveIntensity={1.1}
            transparent
            opacity={THREE.MathUtils.lerp(0.45, 0.95, transition)}
          />
        </mesh>
      ))}

      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={`outflow-${i}`} ref={(el) => { outflowRefs.current[i] = el; }}>
          <sphereGeometry args={[0.006, 10, 10]} />
          <meshStandardMaterial
            color={stage === 'after' ? '#22c55e' : stage === 'virtual' ? '#60a5fa' : '#fb7185'}
            emissive={stage === 'after' ? '#22c55e' : stage === 'virtual' ? '#60a5fa' : '#fb7185'}
            emissiveIntensity={1.0}
            transparent
            opacity={THREE.MathUtils.lerp(0.5, 0.9, transition)}
          />
        </mesh>
      ))}
    </group>
  );
}

function PacemakerOverlay({ stage, playing }) {
  const deviceMatRef = useRef(null);
  const leadGroupRef = useRef(null);
  const rhythmLabelRef = useRef(null);
  const leadTipRef = useRef(null);

  const leadCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.48, 0.33, 0.22),
    new THREE.Vector3(0.32, 0.24, 0.18),
    new THREE.Vector3(0.17, 0.14, 0.12),
    new THREE.Vector3(0.04, 0.05, 0.08),
  ]), []);

  const leadTube = useMemo(
    () => new THREE.TubeGeometry(leadCurve, 48, 0.008, 10, false),
    [leadCurve]
  );

  useHeartbeat(leadGroupRef, {
    enabled: playing,
    bpm: 72,
    intensity: 0.015,
    baseScale: 1,
  });

  useFrame(({ clock }) => {
    if (!deviceMatRef.current) return;

    const t = clock.getElapsedTime();
    const isAfter = stage === 'after';
    const active = playing ? 1 : 0;
    const irregular = 0.45 + 0.28 * Math.sin(t * 2.1) + 0.22 * Math.sin(t * 7.6) + 0.15 * Math.sin(t * 13.4);
    const stable = 0.7 + 0.35 * Math.sin(t * 3.1);
    const intensity = active * (isAfter ? stable : irregular);

    deviceMatRef.current.emissive = new THREE.Color(isAfter ? BLUE : '#ef4444');
    deviceMatRef.current.color = new THREE.Color(isAfter ? BLUE : '#f87171');
    deviceMatRef.current.emissiveIntensity = THREE.MathUtils.clamp(intensity, 0.1, 1.9);

    if (leadTipRef.current) {
      const tipPulse = isAfter ? (0.8 + 0.2 * Math.sin(t * 3.1)) : (0.5 + 0.35 * Math.sin(t * 8.7));
      leadTipRef.current.material.emissiveIntensity = tipPulse;
      leadTipRef.current.material.color = new THREE.Color(isAfter ? BLUE : '#ef4444');
      leadTipRef.current.material.emissive = new THREE.Color(isAfter ? BLUE : '#ef4444');
    }

    if (rhythmLabelRef.current) {
      const nextText = isAfter ? 'Rhythm stabilized' : 'Rhythm irregular';
      if (rhythmLabelRef.current.text !== nextText) {
        rhythmLabelRef.current.text = nextText;
        rhythmLabelRef.current.sync();
      }
      rhythmLabelRef.current.color = isAfter ? '#86efac' : '#fca5a5';
    }
  });

  return (
    <group>
      <mesh position={[0.5, 0.33, 0.22]}>
        <boxGeometry args={[0.12, 0.08, 0.04]} />
        <meshStandardMaterial
          ref={deviceMatRef}
          color={BLUE}
          emissive={BLUE}
          emissiveIntensity={0.9}
          metalness={0.35}
          roughness={0.4}
        />
      </mesh>

      <group ref={leadGroupRef}>
        <mesh geometry={leadTube}>
          <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.7} />
        </mesh>
        <mesh ref={leadTipRef} position={[0.04, 0.05, 0.08]}>
          <sphereGeometry args={[0.012, 12, 12]} />
          <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.8} />
        </mesh>
      </group>

      <Text
        ref={rhythmLabelRef}
        position={[0.48, 0.43, 0.24]}
        fontSize={0.03}
        color={stage === 'after' ? '#86efac' : '#fca5a5'}
        anchorX="center"
        anchorY="middle"
      >
        Rhythm irregular
      </Text>
    </group>
  );
}

export default function HeartProcedureOverlays({ selectedSurgery = 'CABG', stage = 'before', playing = true, procedureProgress = 0, stentTarget = 'lad' }) {
  if (selectedSurgery === 'VALVE') {
    return <ValveOverlay stage={stage} playing={playing} />;
  }

  if (selectedSurgery === 'STENT') {
    return <StentOverlay stage={stage} playing={playing} procedureProgress={procedureProgress} stentTarget={stentTarget} />;
  }

  if (selectedSurgery === 'PACEMAKER') {
    return <PacemakerOverlay stage={stage} playing={playing} />;
  }

  return <CABGOverlay stage={stage} playing={playing} />;
}
