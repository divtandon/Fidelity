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

  useFrame(({ clock }) => {
    const value = progress.get();
    if (groupRef.current) {
      groupRef.current.rotation.x = clock.elapsedTime * 0.09 + value * 0.55;
      const pulse = 1 + Math.sin(value * Math.PI) * 0.07;
      groupRef.current.scale.setScalar(pulse);
    }
    if (innerRef.current) innerRef.current.rotation.x = -clock.elapsedTime * 0.17 - value * 0.4;
  });

  return (
    <group ref={groupRef} position={[0.65, 0, 0]} rotation={[0.08, 0, 0.05]}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.08, 0.13, compact ? 16 : 28, compact ? 48 : 96]} />
        {compact ? (
          <meshStandardMaterial color="#d8c7bd" metalness={0.88} roughness={0.24} />
        ) : (
          <meshPhysicalMaterial color="#d8c7bd" metalness={0.92} roughness={0.2} clearcoat={1} clearcoatRoughness={0.12} />
        )}
      </mesh>
      <mesh ref={innerRef} rotation={[0.12, Math.PI / 2, 0]}>
        <torusGeometry args={[0.8, 0.065, compact ? 14 : 22, compact ? 40 : 80]} />
        {compact ? (
          <meshStandardMaterial color="#8d94c2" metalness={0.7} roughness={0.22} emissive="#4457c2" emissiveIntensity={0.12} />
        ) : (
          <meshPhysicalMaterial color="#8d94c2" metalness={0.76} roughness={0.18} clearcoat={1} emissive="#4457c2" emissiveIntensity={0.12} />
        )}
      </mesh>
      <mesh rotation={[-0.12, Math.PI / 2, 0]}>
        <torusGeometry args={[1.32, 0.035, compact ? 10 : 16, compact ? 48 : 96]} />
        <meshStandardMaterial color="#f0d7c1" metalness={0.86} roughness={0.25} transparent opacity={0.62} />
      </mesh>
      <pointLight color="#f7c49f" intensity={1.4} distance={4.5} decay={2} />
    </group>
  );
}
