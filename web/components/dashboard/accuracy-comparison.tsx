"use client";

import { MousePointer2 } from "lucide-react";
import { useState } from "react";

import { formatDelta, formatPercent, speakDelta } from "@/lib/format";
import type { ValidationReport } from "@/lib/report-schema";

import styles from "./report-charts.module.css";

type AccuracyKey = "reference" | "delta" | "candidate";

export function AccuracyComparison({ report }: { report: ValidationReport }) {
  const [activeKey, setActiveKey] = useState<AccuracyKey>("delta");
  const [pinnedKey, setPinnedKey] = useState<AccuracyKey | null>(null);
  const countDifference = report.candidate.correct_count - report.reference.correct_count;
  const countDirection = countDifference === 0
    ? "the same number of"
    : `${Math.abs(countDifference).toLocaleString()} ${countDifference > 0 ? "more" : "fewer"}`;

  const details: Record<AccuracyKey, { label: string; value: string; description: string }> = {
    reference: {
      label: `${report.reference.precision} reference`,
      value: formatPercent(report.reference.top1_accuracy),
      description: `${report.reference.correct_count.toLocaleString()} of ${report.sample_count.toLocaleString()} paired examples were correct.`,
    },
    delta: {
      label: "Observed accuracy change",
      value: formatDelta(report.accuracy_delta_pp),
      description: `The ${report.candidate.precision} candidate was ${speakDelta(report.accuracy_delta_pp)} and produced ${countDirection} correct predictions.`,
    },
    candidate: {
      label: `${report.candidate.precision} candidate`,
      value: formatPercent(report.candidate.top1_accuracy),
      description: `${report.candidate.correct_count.toLocaleString()} of ${report.sample_count.toLocaleString()} paired examples were correct.`,
    },
  };
  const active = details[activeKey];

  function preview(key: AccuracyKey) {
    setActiveKey(key);
  }

  function endPreview() {
    setActiveKey(pinnedKey ?? "delta");
  }

  function togglePinned(key: AccuracyKey) {
    setActiveKey(key);
    setPinnedKey((current) => current === key ? null : key);
  }

  const interactionProps = (key: AccuracyKey) => ({
    "aria-describedby": "accuracy-interaction-readout",
    "aria-pressed": pinnedKey === key,
    "data-active": activeKey === key,
    onBlur: endPreview,
    onClick: () => togglePinned(key),
    onFocus: () => preview(key),
    onMouseEnter: () => preview(key),
    onMouseLeave: endPreview,
  });

  return (
    <div className={styles.accuracyExplorer}>
      <p className={styles.interactionHint}>
        <MousePointer2 size={15} aria-hidden="true" />
        Hover or focus a metric for exact counts. Select it to keep the detail pinned.
      </p>

      <div className={styles.accuracyGrid} aria-label="Interactive overall accuracy comparison">
        <button
          className={styles.accuracyCard}
          data-tone="fp32"
          type="button"
          aria-label={`${details.reference.label}: ${details.reference.value}. ${details.reference.description}`}
          {...interactionProps("reference")}
        >
          <header><span>Reference</span><strong>{report.reference.precision}</strong></header>
          <span className={styles.accuracyValue}>{formatPercent(report.reference.top1_accuracy)}</span>
          <span className={styles.accuracyTrack} aria-hidden="true"><i style={{ width: `${report.reference.top1_accuracy * 100}%` }} /></span>
          <small>{report.reference.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
        </button>

        <button
          className={styles.deltaCard}
          type="button"
          aria-label={`${details.delta.label}: ${details.delta.value}. ${details.delta.description}`}
          {...interactionProps("delta")}
        >
          <span>Candidate − reference</span>
          <strong>{formatDelta(report.accuracy_delta_pp)}</strong>
        </button>

        <button
          className={styles.accuracyCard}
          data-tone="int8"
          type="button"
          aria-label={`${details.candidate.label}: ${details.candidate.value}. ${details.candidate.description}`}
          {...interactionProps("candidate")}
        >
          <header><span>Candidate</span><strong>{report.candidate.precision}</strong></header>
          <span className={styles.accuracyValue}>{formatPercent(report.candidate.top1_accuracy)}</span>
          <span className={styles.accuracyTrack} aria-hidden="true"><i style={{ width: `${report.candidate.top1_accuracy * 100}%` }} /></span>
          <small>{report.candidate.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
        </button>
      </div>

      <div id="accuracy-interaction-readout" className={styles.metricReadout} role="status" aria-live="polite" aria-atomic="true">
        <span>{active.label}</span>
        <div><strong>{active.value}</strong><small>{active.description}</small></div>
      </div>
    </div>
  );
}
