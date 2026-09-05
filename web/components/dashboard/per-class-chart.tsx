"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { Table2, X } from "lucide-react";

import { formatDelta, formatPercent, speakDelta } from "@/lib/format";
import type { ClassAccuracy } from "@/lib/report-schema";

import styles from "./report-charts.module.css";

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type ClassChartDatum = {
  name: string;
  FP32: number;
  INT8: number;
  row: ClassAccuracy;
};

function ClassTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as ClassChartDatum | undefined;
  if (!active || !datum) return null;

  return (
    <div className={styles.chartTooltip} data-testid="class-chart-tooltip">
      <p>{datum.name}</p>
      <dl>
        <div><dt>FP32</dt><dd>{formatPercent(datum.row.reference_accuracy)}</dd></div>
        <div><dt>INT8</dt><dd>{formatPercent(datum.row.candidate_accuracy)}</dd></div>
        <div><dt>Delta</dt><dd>{formatDelta(datum.row.delta_pp)}</dd></div>
      </dl>
      <small>{datum.row.sample_count.toLocaleString()} paired labeled examples</small>
    </div>
  );
}

export function PerClassChart({ rows }: { rows: ClassAccuracy[] }) {
  const [showTable, setShowTable] = useState(false);
  const [selected, setSelected] = useState<ClassAccuracy | null>(null);
  const [previewed, setPreviewed] = useState<ClassAccuracy | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sorted = useMemo(() => [...rows].sort((left, right) => Math.abs(right.delta_pp) - Math.abs(left.delta_pp)), [rows]);
  const chartData: ClassChartDatum[] = sorted.map((row) => ({
    name: titleCase(row.class_name),
    FP32: Number((row.reference_accuracy * 100).toFixed(2)),
    INT8: Number((row.candidate_accuracy * 100).toFixed(2)),
    row,
  }));
  const minimumAccuracy = Math.min(
    ...chartData.flatMap((row) => [row.FP32, row.INT8]),
  );
  const accuracyDomainStart = Math.max(
    0,
    Math.floor((minimumAccuracy - 5) / 5) * 5,
  );
  const largest = sorted[0];
  const activeClass = previewed ?? largest;

  useEffect(() => {
    if (selected && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [selected]);

  function closeDialog() {
    dialogRef.current?.close();
    setSelected(null);
  }

  return (
    <section className="report-panel class-panel" aria-labelledby="class-chart-title">
      <div className="report-panel__heading">
        <div>
          <p className="report-kicker">Class fidelity</p>
          <h2 id="class-chart-title">Where did behavior change?</h2>
          <p>Per-class top-1 accuracy, sorted by absolute percentage-point difference.</p>
        </div>
        <button className="panel-toggle" type="button" aria-pressed={showTable} onClick={() => setShowTable((value) => !value)}>
          <Table2 size={15} /> {showTable ? "View chart" : "View data table"}
        </button>
      </div>

      <p className={styles.chartSummary} aria-live="polite">
        Largest observed class change: <strong>{titleCase(largest.class_name)}</strong>, {speakDelta(largest.delta_pp)}.
      </p>

      {showTable ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <caption>FP32 and INT8 accuracy by class, sorted by absolute change</caption>
            <thead><tr><th scope="col">Class</th><th scope="col">FP32</th><th scope="col">INT8</th><th scope="col">Delta</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.class_id}>
                  <th scope="row">{titleCase(row.class_name)}</th><td>{formatPercent(row.reference_accuracy)}</td><td>{formatPercent(row.candidate_accuracy)}</td><td>{formatDelta(row.delta_pp)}</td>
                  <td><button type="button" onClick={() => setSelected(row)}>Inspect<span className="sr-only"> {row.class_name}</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={styles.chartRegion} role="region" aria-label="Interactive grouped bar chart comparing FP32 and INT8 top-1 accuracy by class">
            <p className="sr-only">Focus the chart and use arrow keys to move between classes. Hovering a class displays its exact FP32, INT8, and percentage-point delta.</p>
            <div className={styles.chartCanvas}>
              <ResponsiveContainer width="100%" height={430}>
                <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ top: 14, right: 28, bottom: 14, left: 18 }} barGap={4}>
                  <CartesianGrid stroke="#e2e3e9" horizontal={false} />
                  <XAxis type="number" domain={[accuracyDomainStart, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#696e80", fontSize: 13 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={104} tick={{ fill: "#282d49", fontSize: 13 }} axisLine={false} tickLine={false} />
                  <Tooltip content={ClassTooltip} cursor={{ fill: "rgba(49, 92, 245, 0.055)" }} isAnimationActive={false} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 14 }} />
                  <Bar dataKey="FP32" name="FP32" fill="#315cf5" radius={[0, 5, 5, 0]} maxBarSize={12} activeBar={{ fill: "#153fcf", stroke: "#102d9f", strokeWidth: 1 }} isAnimationActive="auto" />
                  <Bar dataKey="INT8" name="INT8" fill="#f4562e" radius={[0, 5, 5, 0]} maxBarSize={12} activeBar={{ fill: "#d9401c", stroke: "#a62f15", strokeWidth: 1 }} isAnimationActive="auto" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={styles.classExplorer}>
            <div className={styles.classReadout} role="status" aria-live="polite" aria-atomic="true">
              <div><span>Class explorer</span><strong>{titleCase(activeClass.class_name)}</strong></div>
              <dl>
                <div><dt>FP32</dt><dd>{formatPercent(activeClass.reference_accuracy)}</dd></div>
                <div><dt>INT8</dt><dd>{formatPercent(activeClass.candidate_accuracy)}</dd></div>
                <div><dt>Delta</dt><dd>{formatDelta(activeClass.delta_pp)}</dd></div>
              </dl>
            </div>
            <div className={styles.classControls} aria-label="Inspect every class">
              {sorted.map((row) => (
                <button
                  type="button"
                  key={row.class_id}
                  data-active={activeClass.class_id === row.class_id}
                  aria-label={`${titleCase(row.class_name)}: FP32 ${formatPercent(row.reference_accuracy)}, INT8 ${formatPercent(row.candidate_accuracy)}, delta ${formatDelta(row.delta_pp)}. Open detailed counts.`}
                  onClick={() => setSelected(row)}
                  onFocus={() => setPreviewed(row)}
                  onMouseEnter={() => setPreviewed(row)}
                >
                  <span>{titleCase(row.class_name)}</span>
                  <small>{formatDelta(row.delta_pp, 1)}</small>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <dialog className="class-dialog" ref={dialogRef} aria-labelledby="class-details-title" onClose={() => setSelected(null)}>
        {selected ? (
          <div>
            <div className="class-dialog__top"><span>Class {String(selected.class_id).padStart(2, "0")}</span><button type="button" onClick={closeDialog} aria-label="Close class details"><X size={18} /></button></div>
            <h3 id="class-details-title">{titleCase(selected.class_name)}</h3>
            <p>The candidate was {speakDelta(selected.delta_pp)} on the same {selected.sample_count.toLocaleString()} labeled examples.</p>
            <dl>
              <div><dt>FP32</dt><dd>{formatPercent(selected.reference_accuracy)}<small>{selected.reference_correct} correct</small></dd></div>
              <div><dt>INT8</dt><dd>{formatPercent(selected.candidate_accuracy)}<small>{selected.candidate_correct} correct</small></dd></div>
            </dl>
            <div className="class-dialog__delta"><span>Observed delta</span><strong>{formatDelta(selected.delta_pp)}</strong></div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
