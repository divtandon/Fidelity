"use client";

import { Component, type ReactNode, type RefObject, Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

import { CompressionAperture } from "@/components/three/compression-aperture";
import { FP32ParticleField } from "@/components/three/fp32-particle-field";
import { INT8VoxelModel } from "@/components/three/int8-voxel-model";

type CompressionSceneProps = {
  progress: MotionValue<number>;
  pointer: RefObject<{ x: number; y: number }>;
  compact: boolean;
};

function CompressionRig({ progress, pointer, compact }: CompressionSceneProps) {
  const rigRef = useRef<THREE.Group>(null);
  const { width, height } = useThree((state) => state.size);
  const aspect = width / height;
  const sceneScale = compact
    ? Math.min(0.58, Math.max(0.32, aspect * 0.74))
    : Math.min(1.32, Math.max(1.06, aspect * 0.82));
  const sceneX = compact ? 0.03 : 0;
  useFrame(({ clock }, delta) => {
    if (!rigRef.current) return;
    const elapsed = clock.elapsedTime;
    const damping = 1 - Math.exp(-delta * 2.4);
    const idleYaw = Math.sin(elapsed * 0.23) * 0.022;
    const idlePitch = Math.cos(elapsed * 0.19) * 0.012;
    const targetYaw = pointer.current.x * 0.045 + idleYaw;
    const targetPitch = -pointer.current.y * 0.025 + idlePitch;
    rigRef.current.rotation.y += (targetYaw - rigRef.current.rotation.y) * damping;
    rigRef.current.rotation.x += (targetPitch - rigRef.current.rotation.x) * damping;
    rigRef.current.position.y = 0.12 + Math.sin(elapsed * 0.34) * 0.025;
  });

  return (
    <group ref={rigRef} position={[sceneX, 0.12, 0]} scale={sceneScale}>
      <FP32ParticleField progress={progress} pointer={pointer} />
      <CompressionAperture progress={progress} compact={compact} />
      <INT8VoxelModel progress={progress} compact={compact} />
    </group>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* Poster remains visible below this layer. */ }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CompressionScene({ progress, pointer, compact }: CompressionSceneProps) {
  return (
    <SceneErrorBoundary>
      <div className="compression-canvas">
        <Canvas
          dpr={compact ? 1 : [1, 1.5]}
          frameloop="always"
          camera={{ position: [0, 0, 9], fov: 43, near: 0.1, far: 40 }}
          gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={2.05} color="#f7f3ff" />
          <directionalLight position={[1, 4, 6]} intensity={3.7} color="#fff1e5" />
          <directionalLight position={[-5, -2, 3]} intensity={1.9} color="#526fff" />
          <Suspense fallback={null}><CompressionRig progress={progress} pointer={pointer} compact={compact} /></Suspense>
        </Canvas>
      </div>
    </SceneErrorBoundary>
  );
}
