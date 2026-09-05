"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { formatDelta, formatPercent } from "@/lib/format";
import type { ClassAccuracy } from "@/lib/report-schema";

import styles from "./class-behavior-chart.module.css";

type ClassBehaviorChartProps = {
  rows: ClassAccuracy[];
  referencePrecision: string;
  candidatePrecision: string;
  runLabel: string;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function barWidth(value: number, domainStart: number) {
  return Math.min(100, Math.max(0, ((value * 100 - domainStart) / (100 - domainStart)) * 100));
}

export function ClassBehaviorChart({
  rows,
  referencePrecision,
  candidatePrecision,
  runLabel,
}: ClassBehaviorChartProps) {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => (
      Math.abs(right.delta_pp) - Math.abs(left.delta_pp)
      || left.class_id - right.class_id
    )),
    [rows],
  );
  const [activeClassId, setActiveClassId] = useState(() => sortedRows[0]?.class_id);
  const rowButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeRow = sortedRows.find((row) => row.class_id === activeClassId) ?? sortedRows[0];
  const minimumAccuracy = Math.min(
    ...sortedRows.flatMap((row) => [row.reference_accuracy, row.candidate_accuracy]),
  ) * 100;
  const domainStart = Math.max(0, Math.floor((minimumAccuracy - 5) / 5) * 5);
  const midpoint = domainStart + (100 - domainStart) / 2;

  function activateAndFocus(index: number) {
    const nextIndex = (index + sortedRows.length) % sortedRows.length;
    setActiveClassId(sortedRows[nextIndex].class_id);
    rowButtons.current[nextIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = index + 1;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = sortedRows.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    activateAndFocus(nextIndex);
  }

  if (!activeRow) return null;

  return (
    <figure className={styles.chart} aria-labelledby="method-class-chart-title">
      <figcaption className={styles.header}>
        <div>
          <span id="method-class-chart-title">Verified class comparison</span>
          <strong>{runLabel}</strong>
        </div>
        <div className={styles.legend} aria-label="Chart legend">
          <span><i className={styles.referenceSwatch} aria-hidden="true" /> {referencePrecision}</span>
          <span><i className={styles.candidateSwatch} aria-hidden="true" /> {candidatePrecision}</span>
        </div>
      </figcaption>

      <div className={styles.layout}>
        <div className={styles.plot}>
          <div className={styles.axis} aria-hidden="true">
            <span>{domainStart}%</span><span>{midpoint}%</span><span>100%</span>
          </div>
          <div className={styles.rows}>
            {sortedRows.map((row, index) => {
              const className = titleCase(row.class_name);
              const reference = formatPercent(row.reference_accuracy);
              const candidate = formatPercent(row.candidate_accuracy);
              const delta = formatDelta(row.delta_pp);
              const isActive = row.class_id === activeRow.class_id;

              return (
                <button
                  aria-label={`${className}: ${referencePrecision} ${reference}, ${candidatePrecision} ${candidate}, change ${delta}`}
                  aria-pressed={isActive}
                  className={styles.row}
                  data-active={isActive ? "true" : undefined}
                  key={row.class_id}
                  onClick={() => setActiveClassId(row.class_id)}
                  onFocus={() => setActiveClassId(row.class_id)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onPointerEnter={() => setActiveClassId(row.class_id)}
                  ref={(node) => { rowButtons.current[index] = node; }}
                  type="button"
                >
                  <span className={styles.rowLabel}>
                    <small>{String(index + 1).padStart(2, "0")}</small>{className}
                  </span>
                  <span className={styles.barPair} aria-hidden="true">
                    <i><b className={styles.referenceBar} style={{ width: `${barWidth(row.reference_accuracy, domainStart)}%` }} /></i>
                    <i><b className={styles.candidateBar} style={{ width: `${barWidth(row.candidate_accuracy, domainStart)}%` }} /></i>
                  </span>
                  <span className={styles.delta}>{delta}</span>
                </button>
              );
            })}
          </div>
          <p className={styles.scaleNote}>Accuracy scale begins at {domainStart}% so nearby class results remain legible. Exact values stay visible in the reading.</p>
        </div>

        <div className={styles.reading} aria-atomic="true" aria-live="polite" data-testid="class-behavior-reading">
          <p>Current reading</p>
          <div className={styles.readingTitle}>
            <span>Class {String(activeRow.class_id).padStart(2, "0")}</span>
            <h3>{titleCase(activeRow.class_name)}</h3>
          </div>
          <dl>
            <div><dt>{referencePrecision}</dt><dd>{formatPercent(activeRow.reference_accuracy)}<small>{activeRow.reference_correct.toLocaleString()} of {activeRow.sample_count.toLocaleString()} correct</small></dd></div>
            <div><dt>{candidatePrecision}</dt><dd>{formatPercent(activeRow.candidate_accuracy)}<small>{activeRow.candidate_correct.toLocaleString()} of {activeRow.sample_count.toLocaleString()} correct</small></dd></div>
          </dl>
          <div className={styles.readingDelta}><span>Candidate change</span><strong>{formatDelta(activeRow.delta_pp)}</strong></div>
          <small className={styles.readingHint}>Hover, focus, or select any class row. Use arrow keys to move between rows.</small>
        </div>
      </div>
    </figure>
  );
}
