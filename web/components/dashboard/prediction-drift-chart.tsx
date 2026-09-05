"use client";

import { MousePointer2 } from "lucide-react";
import { type CSSProperties, useState } from "react";

import type { ValidationReport } from "@/lib/report-schema";

import styles from "./report-charts.module.css";

type DriftKey = "observed" | "review" | "block";
type MarkerStyle = CSSProperties & {
  "--marker-color": string;
  "--marker-position": string;
};

function thresholdDistance(value: number, threshold: number) {
  const difference = Math.abs(value - threshold).toFixed(3);
  if (value === threshold) return "The observation is exactly at this threshold.";
  return `The observation is ${difference} nats ${value < threshold ? "below" : "above"} this threshold.`;
}

export function PredictionDriftChart({ report }: { report: ValidationReport }) {
  const [activeKey, setActiveKey] = useState<DriftKey>("observed");
  const [pinnedKey, setPinnedKey] = useState<DriftKey | null>(null);
  const observed = report.confidence_drift.value;
  const review = report.verdict.policy.review_confidence_kl;
  const block = report.verdict.policy.block_confidence_kl;
  const domainMaximum = Math.max(observed, review, block, 0.001) * 1.08;

  const points: Array<{
    key: DriftKey;
    label: string;
    value: number;
    color: string;
    description: string;
  }> = [
    {
      key: "observed",
      label: "Observed mean KL",
      value: observed,
      color: "#315cf5",
      description: `Measured from reference to candidate across ${report.confidence_drift.sample_count.toLocaleString()} paired examples.`,
    },
    {
      key: "review",
      label: "Review threshold",
      value: review,
      color: "#b78537",
      description: `${thresholdDistance(observed, review)} This is the report policy’s review boundary, not a universal safety limit.`,
    },
    {
      key: "block",
      label: "Block threshold",
      value: block,
      color: "#d14526",
      description: `${thresholdDistance(observed, block)} This boundary comes from policy ${report.verdict.policy.name} v${report.verdict.policy.version}.`,
    },
  ];
  const active = points.find((point) => point.key === activeKey) ?? points[0];

  function preview(key: DriftKey) {
    setActiveKey(key);
  }

  function endPreview() {
    setActiveKey(pinnedKey ?? "observed");
  }

  function togglePinned(key: DriftKey) {
    setActiveKey(key);
    setPinnedKey((current) => current === key ? null : key);
  }

  const interactionProps = (key: DriftKey) => ({
    "aria-describedby": "drift-interaction-readout",
    "aria-pressed": pinnedKey === key,
    "data-active": activeKey === key,
    onBlur: endPreview,
    onClick: () => togglePinned(key),
    onFocus: () => preview(key),
    onMouseEnter: () => preview(key),
    onMouseLeave: endPreview,
  });

  return (
    <figure className={styles.driftExplorer} aria-label="Interactive KL divergence distance gauge">
      <div className={styles.driftBody}>
        <button
          className={styles.driftReading}
          type="button"
          aria-label={`Observed mean KL divergence: ${observed.toFixed(3)} nats. ${points[0].description}`}
          {...interactionProps("observed")}
        >
          <small>Distance gauge</small>
          <strong>{observed.toFixed(3)}</strong>
          <span>nats · mean KL</span>
        </button>

        <div className={styles.driftPlot} role="group" aria-label="Observed drift and policy thresholds">
          <p><MousePointer2 size={14} aria-hidden="true" /> Hover, focus, or select a row to inspect its exact meaning.</p>
          {points.map((point) => {
            const markerStyle: MarkerStyle = {
              "--marker-color": point.color,
              "--marker-position": `${Math.min(96, Math.max(2, point.value / domainMaximum * 100))}%`,
            };
            return (
              <button
                className={styles.driftRow}
                type="button"
                key={point.key}
                aria-label={`${point.label}: ${point.value.toFixed(3)} nats. ${point.description}`}
                {...interactionProps(point.key)}
              >
                <span>{point.label}</span>
                <span className={styles.driftTrack} style={markerStyle} aria-hidden="true" />
                <strong>{point.value.toFixed(3)} nats</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div id="drift-interaction-readout" className={styles.driftDetail} role="status" aria-live="polite" aria-atomic="true">
        <header><span>{active.label}</span><strong>{active.value.toFixed(3)} nats</strong></header>
        <p>{active.description}</p>
      </div>
      <figcaption className={styles.driftCaption}>
        This is a distance gauge, not a pie chart: lower KL means the two output distributions are closer. Hover and focus expose the same report-backed values.
      </figcaption>
    </figure>
  );
}
