"use client";

import { useRef, useSyncExternalStore, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useInView, useReducedMotion, type MotionValue } from "motion/react";

import { ScenePoster } from "@/components/three/scene-poster";

const CompressionScene = dynamic(
  () => import("@/components/three/compression-scene").then((module) => module.CompressionScene),
  { ssr: false, loading: () => null },
);

type CompressionVisualProps = {
  progress: MotionValue<number>;
  pointer: RefObject<{ x: number; y: number }>;
};

let cachedWebGLSupport: boolean | undefined;

function getWebGLSupport() {
  if (cachedWebGLSupport !== undefined) return cachedWebGLSupport;
  try {
    const canvas = document.createElement("canvas");
    cachedWebGLSupport = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    cachedWebGLSupport = false;
  }
  return cachedWebGLSupport;
}

function subscribeToWebGLSupport() {
  return () => undefined;
}

function subscribeToPageVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function isPageVisible() {
  return document.visibilityState !== "hidden";
}

export function CompressionVisual({ progress, pointer }: CompressionVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { margin: "200px" });
  const reduceMotion = useReducedMotion();
  const supportsWebGL = useSyncExternalStore(subscribeToWebGLSupport, getWebGLSupport, () => false);
  const pageVisible = useSyncExternalStore(
    subscribeToPageVisibility,
    isPageVisible,
    () => false,
  );
  const showLiveScene = !reduceMotion && inView && supportsWebGL && pageVisible;

  return (
    <div className={`compression-visual${showLiveScene ? " compression-visual--live" : ""}`} ref={containerRef} aria-hidden="true">
      <ScenePoster />
      {showLiveScene ? <CompressionScene progress={progress} pointer={pointer} /> : null}
    </div>
  );
}
