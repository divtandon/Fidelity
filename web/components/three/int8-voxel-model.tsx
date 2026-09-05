"use client";

import { useLayoutEffect, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

const SIDE = 5;
const COUNT = SIDE ** 3;

type INT8VoxelModelProps = {
  progress: MotionValue<number>;
  compact: boolean;
};

export function INT8VoxelModel({ progress, compact }: INT8VoxelModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const object = new THREE.Object3D();
    let index = 0;
    for (let x = 0; x < SIDE; x += 1) {
      for (let y = 0; y < SIDE; y += 1) {
        for (let z = 0; z < SIDE; z += 1) {
          object.position.set((x - 2) * 0.28, (y - 2) * 0.28, (z - 2) * 0.28);
          object.updateMatrix();
          meshRef.current.setMatrixAt(index, object.matrix);
          index += 1;
        }
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const value = THREE.MathUtils.smoothstep(progress.get(), 0.54, 0.94);
    const elapsed = clock.elapsedTime;
    const restingScale = compact ? 0.68 : 0.66;
    const finalScale = compact ? 0.9 : 0.94;
    const settledScale = restingScale + value * (finalScale - restingScale);
    const pulse = 1 + Math.sin(elapsed * 1.42) * (0.035 - value * 0.012);
    groupRef.current.scale.setScalar(settledScale * pulse);
    groupRef.current.position.y = Math.sin(elapsed * 0.62) * 0.055;
    groupRef.current.rotation.x = Math.sin(elapsed * 0.29) * 0.07;
    groupRef.current.rotation.y = elapsed * 0.18 + (1 - value) * 0.32;
    groupRef.current.rotation.z = Math.sin(elapsed * 0.43) * 0.045;
    if (lightRef.current) {
      lightRef.current.intensity = 4.8 + Math.sin(elapsed * 1.42) * 0.75 + value * 0.9;
    }
  });

  return (
    <group ref={groupRef} position={[compact ? 2.72 : 3.25, 0, 0]} scale={compact ? 0.68 : 0.66}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        {compact ? (
          <meshStandardMaterial color="#ff3f12" emissive="#ff1800" emissiveIntensity={1.05} metalness={0.18} roughness={0.18} toneMapped={false} />
        ) : (
          <meshPhysicalMaterial color="#ff3f12" emissive="#ff1800" emissiveIntensity={1.05} metalness={0.22} roughness={0.15} clearcoat={1} toneMapped={false} />
        )}
      </instancedMesh>
      <mesh scale={1.06}>
        <boxGeometry args={[1.45, 1.45, 1.45]} />
        <meshBasicMaterial
          color="#ff6a43"
          transparent
          opacity={compact ? 0.09 : 0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[1.45, 1.45, 1.45]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color="#ffb099" lineWidth={compact ? 0.9 : 1.5} />
      </mesh>
      <pointLight ref={lightRef} color="#ff3215" intensity={4.8} distance={5.4} decay={2} />
    </group>
  );
}
