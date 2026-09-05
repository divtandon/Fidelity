"use client";

import { Component, type ReactNode, Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

import { CompressionAperture } from "@/components/three/compression-aperture";
import { FP32ParticleField } from "@/components/three/fp32-particle-field";
import { INT8VoxelModel } from "@/components/three/int8-voxel-model";

type CompressionSceneProps = { progress: MotionValue<number> };

function CompressionRig({ progress }: CompressionSceneProps) {
  const rigRef = useRef<THREE.Group>(null);
  useFrame(({ pointer }) => {
    if (!rigRef.current) return;
    rigRef.current.rotation.y += (pointer.x * 0.045 - rigRef.current.rotation.y) * 0.025;
    rigRef.current.rotation.x += (-pointer.y * 0.025 - rigRef.current.rotation.x) * 0.025;
  });

  return (
    <group ref={rigRef} position={[0.65, 0.12, 0]} scale={1.02}>
      <FP32ParticleField progress={progress} />
      <CompressionAperture progress={progress} />
      <INT8VoxelModel progress={progress} />
    </group>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* Poster remains visible below this layer. */ }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CompressionScene({ progress }: CompressionSceneProps) {
  return (
    <SceneErrorBoundary>
      <div className="compression-canvas">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 9], fov: 43, near: 0.1, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={1.6} color="#f7f3ff" />
          <directionalLight position={[1, 4, 6]} intensity={2.6} color="#fff4e9" />
          <directionalLight position={[-5, -2, 3]} intensity={1.2} color="#7791ff" />
          <Suspense fallback={null}><CompressionRig progress={progress} /></Suspense>
        </Canvas>
      </div>
    </SceneErrorBoundary>
  );
}
