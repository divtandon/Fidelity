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
    const settledScale = 0.08 + value * 0.92;
    groupRef.current.scale.setScalar(settledScale);
    groupRef.current.rotation.y = clock.elapsedTime * 0.08 + (1 - value) * 0.45;
    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.35) * 0.035;
  });

  return (
    <group ref={groupRef} position={[3.2, 0, 0]} scale={0.08}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        {compact ? (
          <meshStandardMaterial color="#ff532d" emissive="#ff3815" emissiveIntensity={0.33} metalness={0.16} roughness={0.24} />
        ) : (
          <meshPhysicalMaterial color="#ff532d" emissive="#ff3815" emissiveIntensity={0.33} metalness={0.2} roughness={0.2} clearcoat={1} />
        )}
      </instancedMesh>
      {!compact ? <mesh>
        <boxGeometry args={[1.45, 1.45, 1.45]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color="#ff8e6f" lineWidth={1.2} />
      </mesh> : null}
      <pointLight color="#ff4b27" intensity={2.2} distance={4} decay={2} />
    </group>
  );
}
