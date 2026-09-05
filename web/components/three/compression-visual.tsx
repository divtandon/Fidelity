"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useInView, type MotionValue } from "motion/react";

import { ScenePoster } from "@/components/three/scene-poster";
import { usePrefersReducedMotion } from "@/lib/reduced-motion";

const CompressionScene = dynamic(
  () => import("@/components/three/compression-scene").then((module) => module.CompressionScene),
  { ssr: false, loading: () => null },
);

type CompressionVisualProps = {
  progress: MotionValue<number>;
  pointer: RefObject<{ x: number; y: number }>;
};

let cachedWebGLSupport: boolean | undefined;
const COMPACT_SCENE_QUERY = "(max-width: 820px)";

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

function subscribeToCompactScene(callback: () => void) {
  const media = window.matchMedia(COMPACT_SCENE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function isCompactScene() {
  return window.matchMedia(COMPACT_SCENE_QUERY).matches;
}

function isPageVisible() {
  return document.visibilityState !== "hidden";
}

export function CompressionVisual({ progress, pointer }: CompressionVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { margin: "200px" });
  const reduceMotion = usePrefersReducedMotion();
  const supportsWebGL = useSyncExternalStore(subscribeToWebGLSupport, getWebGLSupport, () => false);
  const pageVisible = useSyncExternalStore(
    subscribeToPageVisibility,
    isPageVisible,
    () => false,
  );
  const compactScene = useSyncExternalStore(
    subscribeToCompactScene,
    isCompactScene,
    () => false,
  );
  const [compactSceneRequested, setCompactSceneRequested] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    if (!compactScene || compactSceneRequested) return;

    const requestScene = () => setCompactSceneRequested(true);
    const requestTimer = window.setTimeout(requestScene, 350);
    if (window.scrollY > 4) {
      requestScene();
      window.clearTimeout(requestTimer);
      return;
    }

    window.addEventListener("scroll", requestScene, { passive: true, once: true });
    window.addEventListener("pointerdown", requestScene, { passive: true, once: true });
    window.addEventListener("keydown", requestScene, { once: true });
    return () => {
      window.clearTimeout(requestTimer);
      window.removeEventListener("scroll", requestScene);
      window.removeEventListener("pointerdown", requestScene);
      window.removeEventListener("keydown", requestScene);
    };
  }, [compactScene, compactSceneRequested]);

  const compactSceneReady = !compactScene || compactSceneRequested;
  const showLiveScene = !reduceMotion && compactSceneReady && inView && supportsWebGL && pageVisible;
  const markSceneReady = useCallback(() => setSceneReady(true), []);
  const markSceneFailed = useCallback(() => setSceneReady(false), []);

  return (
    <div className={`compression-visual${showLiveScene && sceneReady ? " compression-visual--live" : ""}`} ref={containerRef} aria-hidden="true">
      <ScenePoster />
      {showLiveScene ? (
        <CompressionScene
          progress={progress}
          pointer={pointer}
          compact={compactScene}
          onReady={markSceneReady}
          onFailure={markSceneFailed}
        />
      ) : null}
    </div>
  );
}
