"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

import { createCompressionParticleData } from "@/lib/three/particle-data";

const vertexShader = `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  attribute vec3 aSource;
  attribute vec3 aTarget;
  attribute float aPhase;
  varying float vJourney;
  varying float vGlow;

  float easeInOut(float value) {
    return value * value * (3.0 - 2.0 * value);
  }

  void main() {
    float delayed = clamp((uProgress * 1.34) - (aPhase * 0.34), 0.0, 1.0);
    float journey = easeInOut(delayed);
    vec3 transformed = mix(aSource, aTarget, journey);

    float funnel = sin(journey * 3.14159265);
    transformed.yz *= 1.0 - funnel * 0.76;
    transformed.y += sin(uTime * 0.72 + aPhase * 18.0) * (0.025 + (1.0 - journey) * 0.035);
    transformed.z += cos(uTime * 0.54 + aPhase * 14.0) * (0.018 + funnel * 0.045);
    transformed.x += sin(uTime * 0.4 + aPhase * 25.0) * 0.018;

    vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    float perspective = 8.0 / max(1.0, -viewPosition.z);
    gl_PointSize = mix(3.2, 2.2, journey) * perspective * uPixelRatio;
    vJourney = journey;
    vGlow = 0.72 + sin(aPhase * 31.0 + uTime * 1.1) * 0.28;
  }
`;

const fragmentShader = `
  varying float vJourney;
  varying float vGlow;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(point);
    if (distanceToCenter > 0.5) discard;

    vec3 fp32 = vec3(0.10, 0.23, 0.95);
    vec3 highlight = vec3(0.44, 0.58, 1.0);
    vec3 int8 = vec3(1.0, 0.24, 0.08);
    vec3 color = mix(mix(fp32, highlight, vGlow * 0.42), int8, smoothstep(0.56, 0.95, vJourney));
    float alpha = smoothstep(0.5, 0.06, distanceToCenter) * (0.62 + vGlow * 0.34);
    gl_FragColor = vec4(color, alpha);
  }
`;

type FP32ParticleFieldProps = {
  progress: MotionValue<number>;
  pointer: RefObject<{ x: number; y: number }>;
};

export function FP32ParticleField({ progress, pointer }: FP32ParticleFieldProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const viewportWidth = useThree((state) => state.size.width);
  const pixelRatio = useThree((state) => state.viewport.dpr);
  const particleCount = viewportWidth <= 820 ? 1600 : 6800;
  const data = useMemo(() => createCompressionParticleData(particleCount), [particleCount]);
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(data.source, 3));
    nextGeometry.setAttribute("aSource", new THREE.BufferAttribute(data.source, 3));
    nextGeometry.setAttribute("aTarget", new THREE.BufferAttribute(data.target, 3));
    nextGeometry.setAttribute("aPhase", new THREE.BufferAttribute(data.phase, 1));
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [data]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
      materialRef.current.uniforms.uProgress.value = progress.get();
      materialRef.current.uniforms.uPixelRatio.value = Math.min(pixelRatio, 1.5);
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y += (pointer.current.x * 0.055 - pointsRef.current.rotation.y) * 0.025;
      pointsRef.current.rotation.x += (-pointer.current.y * 0.035 - pointsRef.current.rotation.x) * 0.025;
    }
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uPixelRatio: { value: 1 },
    }),
    [],
  );

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
