"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

type CompressionApertureProps = {
  progress: MotionValue<number>;
  compact: boolean;
};

export function CompressionAperture({ progress, compact }: CompressionApertureProps) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const value = progress.get();
    const elapsed = clock.elapsedTime;
    if (groupRef.current) {
      // Keep the ring normal pitched toward the camera. The bounded motion
      // preserves an open ellipse instead of eventually settling edge-on.
      groupRef.current.rotation.x = 0.08 + Math.sin(elapsed * 0.31) * 0.075 + value * 0.1;
      groupRef.current.rotation.y = 0.64 + Math.cos(elapsed * 0.27) * 0.09 - value * 0.08;
      groupRef.current.rotation.z = 0.05 + Math.sin(elapsed * 0.22) * 0.025;
      const baseScale = compact ? 0.98 : 1.07;
      const pulse = baseScale + Math.sin(elapsed * 1.18) * 0.028 + Math.sin(value * Math.PI) * 0.065;
      groupRef.current.scale.setScalar(pulse);
    }
    if (innerRef.current) {
      innerRef.current.rotation.x = 0.12 + Math.cos(elapsed * 0.61) * 0.055 - value * 0.08;
      innerRef.current.rotation.y = Math.PI / 2 + Math.sin(elapsed * 0.47) * 0.07;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 2.8 + Math.sin(elapsed * 1.18) * 0.45 + value * 0.55;
    }
  });

  return (
    <group ref={groupRef} position={[compact ? 0.12 : 0.3, 0, 0]} rotation={[0.08, 0.64, 0.05]} scale={compact ? 0.98 : 1.07}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.08, 0.13, compact ? 16 : 28, compact ? 48 : 96]} />
        {compact ? (
          <meshStandardMaterial color="#f0d2bd" metalness={0.88} roughness={0.2} emissive="#c36434" emissiveIntensity={0.22} />
        ) : (
          <meshPhysicalMaterial color="#f0d2bd" metalness={0.92} roughness={0.16} clearcoat={1} clearcoatRoughness={0.08} emissive="#c36434" emissiveIntensity={0.22} />
        )}
      </mesh>
      <mesh ref={innerRef} rotation={[0.12, Math.PI / 2, 0]}>
        <torusGeometry args={[0.8, 0.065, compact ? 14 : 22, compact ? 40 : 80]} />
        {compact ? (
          <meshStandardMaterial color="#8d9fff" metalness={0.7} roughness={0.2} emissive="#294cff" emissiveIntensity={0.38} />
        ) : (
          <meshPhysicalMaterial color="#8d9fff" metalness={0.76} roughness={0.16} clearcoat={1} emissive="#294cff" emissiveIntensity={0.38} />
        )}
      </mesh>
      <mesh rotation={[-0.12, Math.PI / 2, 0]}>
        <torusGeometry args={[1.32, 0.035, compact ? 10 : 16, compact ? 48 : 96]} />
        <meshStandardMaterial color="#f0d7c1" metalness={0.86} roughness={0.25} transparent opacity={0.62} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.72, compact ? 32 : 64]} />
        <meshBasicMaterial
          color="#3d62ff"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight ref={lightRef} color="#ffb37f" intensity={2.8} distance={5.4} decay={2} />
    </group>
  );
}
