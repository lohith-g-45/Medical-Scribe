import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function useHeartbeat(targetRef, options = {}) {
  const {
    enabled = true,
    bpm = 72,
    intensity = 0.045,
    baseScale = 1,
  } = options;

  useFrame(({ clock }) => {
    if (!targetRef?.current) return;

    if (!enabled) {
      targetRef.current.scale.setScalar(baseScale);
      return;
    }

    const t = clock.getElapsedTime();
    const hz = bpm / 60;
    // Add a soft second harmonic to mimic systole/diastole feel.
    const beat = Math.sin(t * hz * Math.PI * 2) * 0.7 + Math.sin(t * hz * Math.PI * 4) * 0.3;
    const s = baseScale + beat * intensity;
    targetRef.current.scale.setScalar(s);
  });
}

export function useFlowAnimation(particleRefs, curve, options = {}) {
  const {
    enabled = true,
    speed = 0.22,
    pulse = 1,
  } = options;

  useFrame(({ clock }) => {
    if (!curve || !particleRefs?.current) return;

    const elapsed = clock.getElapsedTime();
    const refs = particleRefs.current;
    const count = refs.length;
    if (!count) return;

    const flow = enabled ? speed : speed * 0.2;
    const heartbeatBoost = enabled ? 0.85 + 0.15 * Math.sin(elapsed * pulse * 3.0) : 0.8;

    for (let i = 0; i < count; i += 1) {
      const mesh = refs[i];
      if (!mesh) continue;
      const u = (elapsed * flow * heartbeatBoost + i / count) % 1;
      const p = curve.getPointAt(u);
      mesh.position.set(p.x, p.y, p.z);
    }
  });
}

export function usePulseSignal(materialRef, options = {}) {
  const {
    enabled = true,
    minIntensity = 0.45,
    maxIntensity = 1.5,
    speed = 3.2,
    color = '#3b82f6',
  } = options;

  useFrame(({ clock }) => {
    const mat = materialRef?.current;
    if (!mat) return;

    if (!enabled) {
      mat.emissive = new THREE.Color(color);
      mat.emissiveIntensity = minIntensity;
      return;
    }

    const t = clock.getElapsedTime();
    const a = 0.5 + 0.5 * Math.sin(t * speed);
    mat.emissive = new THREE.Color(color);
    mat.emissiveIntensity = minIntensity + (maxIntensity - minIntensity) * a;
  });
}
