"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen } from "lucide-react";
import { useAnimationFrame, useMotionValue } from "motion/react";

import { AccuracyMeter } from "@/components/home/accuracy-meter";
import { CompressionVisual } from "@/components/three/compression-visual";
import { usePrefersReducedMotion } from "@/lib/reduced-motion";
import {
  COMPRESSION_PROGRESS_MIN,
  getCompressionStageIndex,
  getContinuousCompressionProgress,
} from "@/lib/three/continuous-progress";

export type FeaturedRunSummary = {
  href: string;
  label: string;
  sampleCount: number;
  reference: { precision: string; value: string; fillPercent: number; correctCount: number };
  candidate: { precision: string; value: string; fillPercent: number; correctCount: number };
  delta: string;
  pValue: string;
};

const stages = [
  "Reference model",
  "Preparing compression",
  "Quantizing to INT8",
  "Comparing predictions",
  "Validation complete",
];

export function CompressionHero({ featuredRun }: { featuredRun: FeaturedRunSummary }) {
  const pointerRef = useRef({ x: 0, y: 0 });
  const elapsedRef = useRef(0);
  const stageRef = useRef(0);
  const [activeStage, setActiveStage] = useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const sceneProgress = useMotionValue(COMPRESSION_PROGRESS_MIN);
  const summaryMetrics = [
    { label: "Delta", value: featuredRun.delta, tone: "neutral" },
    { label: "p-value", value: featuredRun.pValue, tone: "neutral" },
  ];
  useAnimationFrame((_time, delta) => {
    if (reduceMotion) {
      sceneProgress.set(COMPRESSION_PROGRESS_MIN);
      if (stageRef.current !== 0) {
        stageRef.current = 0;
        setActiveStage(0);
      }
      return;
    }

    if (document.visibilityState === "hidden") return;
    elapsedRef.current += Math.min(delta, 50);
    const nextProgress = getContinuousCompressionProgress(elapsedRef.current);
    sceneProgress.set(nextProgress);

    const nextStage = getCompressionStageIndex(nextProgress, stages.length);
    if (nextStage !== stageRef.current) {
      stageRef.current = nextStage;
      setActiveStage(nextStage);
    }
  });

  return (
    <section
      className="hero"
      aria-labelledby="hero-title"
      data-animation="continuous"
      data-animation-stage={activeStage}
      onPointerMove={(event) => {
        pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointerRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      }}
      onPointerLeave={() => {
        pointerRef.current.x = 0;
        pointerRef.current.y = 0;
      }}
    >
      <div className="hero__stage">
      <div className="hero__visual" aria-hidden="true">
        <CompressionVisual progress={sceneProgress} pointer={pointerRef} />
        <div className="hero__wash" />
      </div>
      <div className="hero-annotation hero-annotation--reference" aria-hidden="true"><i /><span>FP32</span><small>Reference model<br />high precision</small></div>
      <div className="hero-annotation hero-annotation--aperture" aria-hidden="true"><span>Post-training<br />quantization</span><i /></div>
      <div className="hero-annotation hero-annotation--candidate" aria-hidden="true"><i /><span>INT8</span><small>Candidate model<br />smaller representation</small></div>

      <div className="page-shell hero__content">
        <div className="hero__copy">
          <p className="eyebrow">FP32 <span aria-hidden="true">→</span> INT8 · Model validation</p>
          <h1 id="hero-title">Prove the model<br />after the <em>transformation.</em></h1>
          <p className="hero__lead">
            Fidelity compares a compressed model with its full-precision reference—across accuracy,
            class behavior, prediction drift, and statistical significance.
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" href={featuredRun.href}>View verified report <ArrowRight size={17} /></Link>
            <Link className="button button--quiet" href="/methods"><BookOpen size={16} /> Read the method</Link>
          </div>
        </div>

        <div className="proof-cluster">
          <span className="proof-label"><i /> {featuredRun.label}</span>
          <dl className="proof-strip">
            <AccuracyMeter
              correctCount={featuredRun.reference.correctCount}
              fillPercent={featuredRun.reference.fillPercent}
              precision={featuredRun.reference.precision}
              sampleCount={featuredRun.sampleCount}
              tone="blue"
              value={featuredRun.reference.value}
            />
            <AccuracyMeter
              correctCount={featuredRun.candidate.correctCount}
              fillPercent={featuredRun.candidate.fillPercent}
              precision={featuredRun.candidate.precision}
              sampleCount={featuredRun.sampleCount}
              tone="orange"
              value={featuredRun.candidate.value}
            />
            {summaryMetrics.map((metric) => (
              <div className={`proof-strip__metric proof-strip__metric--${metric.tone}`} key={metric.label}>
                <dt>{metric.label}</dt><dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <a className="scroll-cue" href="#why-fidelity"><span>Explore the evidence</span><i><ArrowDown size={13} /></i></a>
      <div className="hero-stage-progress" aria-hidden="true">
        <span>{String(activeStage + 1).padStart(2, "0")}</span>
        <strong>{stages[activeStage]}</strong>
        <div aria-hidden="true">
          {stages.map((stage, index) => <i className={index <= activeStage ? "is-active" : ""} key={stage} />)}
        </div>
      </div>
      </div>
    </section>
  );
}
