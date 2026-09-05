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
  varying float vFlow;

  float easeInOut(float value) {
    return value * value * (3.0 - 2.0 * value);
  }

  void main() {
    float delayed = clamp((uProgress * 1.34) - (aPhase * 0.34), 0.0, 1.0);
    float scrollJourney = easeInOut(delayed);

    // A stable subset continuously travels through the compressor even when
    // scroll progress is stationary. Scroll still advances the full field.
    float courier = step(0.65, fract(aPhase * 11.73));
    float flowCycle = fract(aPhase * 5.17 + uTime * 0.1);
    float flowVisibility = smoothstep(0.0, 0.08, flowCycle)
      * (1.0 - smoothstep(0.9, 1.0, flowCycle));
    float idleJourney = easeInOut(flowCycle) * courier;
    float journey = max(scrollJourney, idleJourney);
    vec3 source = aSource;
    source.x = -2.2 + (aSource.x + 2.65) * 0.7;
    source.yz *= 1.12;
    vec3 target = aTarget;
    target.x = 3.25 + (aTarget.x - 3.2) * 0.92;
    target.yz *= 1.04;
    vec3 transformed = mix(source, target, journey);

    float funnel = sin(journey * 3.14159265);
    transformed.yz *= 1.0 - funnel * 0.76;
    transformed.y += sin(uTime * 0.96 + aPhase * 18.0) * (0.032 + (1.0 - journey) * 0.045);
    transformed.z += cos(uTime * 0.71 + aPhase * 14.0) * (0.024 + funnel * 0.065);
    transformed.x += sin(uTime * 0.52 + aPhase * 25.0) * (0.022 + funnel * 0.018);

    vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    float perspective = 8.0 / max(1.0, -viewPosition.z);
    float flowEnergy = courier * flowVisibility;
    gl_PointSize = (mix(5.3, 3.35, journey) + funnel * 0.95 + flowEnergy * 1.5)
      * perspective * uPixelRatio;
    vJourney = journey;
    vGlow = 0.72 + sin(aPhase * 31.0 + uTime * 1.35) * 0.28;
    vFlow = flowEnergy;
  }
`;

const fragmentShader = `
  varying float vJourney;
  varying float vGlow;
  varying float vFlow;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(point);
    if (distanceToCenter > 0.5) discard;

    vec3 fp32 = vec3(0.035, 0.12, 1.0);
    vec3 highlight = vec3(0.3, 0.49, 1.0);
    vec3 int8 = vec3(1.0, 0.105, 0.015);
    vec3 color = mix(mix(fp32, highlight, vGlow * 0.58), int8, smoothstep(0.46, 0.92, vJourney));
    color += vec3(0.34, 0.22, 0.14) * vFlow;
    float alpha = smoothstep(0.5, 0.045, distanceToCenter) * (0.78 + vGlow * 0.22);
    alpha *= mix(0.95, 1.0, vFlow);
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
  const particleCount = viewportWidth <= 820 ? 3200 : 12_000;
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

  useFrame(({ clock }, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
      materialRef.current.uniforms.uProgress.value = progress.get();
      materialRef.current.uniforms.uPixelRatio.value = Math.min(pixelRatio, 1.5);
    }
    if (pointsRef.current) {
      const damping = 1 - Math.exp(-delta * 2.8);
      const idleYaw = Math.sin(clock.elapsedTime * 0.2) * 0.035;
      const idlePitch = Math.cos(clock.elapsedTime * 0.17) * 0.018;
      const targetYaw = pointer.current.x * 0.055 + idleYaw;
      const targetPitch = -pointer.current.y * 0.035 + idlePitch;
      pointsRef.current.rotation.y += (targetYaw - pointsRef.current.rotation.y) * damping;
      pointsRef.current.rotation.x += (targetPitch - pointsRef.current.rotation.x) * damping;
      pointsRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.13) * 0.012;
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
        toneMapped={false}
      />
    </points>
  );
}
