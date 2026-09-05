"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownUp, Table2, X } from "lucide-react";

import { formatDelta, formatPercent, speakDelta } from "@/lib/format";
import type { ClassAccuracy } from "@/lib/report-schema";

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PerClassChart({ rows }: { rows: ClassAccuracy[] }) {
  const [showTable, setShowTable] = useState(false);
  const [selected, setSelected] = useState<ClassAccuracy | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sorted = useMemo(() => [...rows].sort((left, right) => Math.abs(right.delta_pp) - Math.abs(left.delta_pp)), [rows]);
  const chartData = sorted.map((row) => ({
    name: titleCase(row.class_name),
    FP32: Number((row.reference_accuracy * 100).toFixed(2)),
    INT8: Number((row.candidate_accuracy * 100).toFixed(2)),
  }));
  const minimumAccuracy = Math.min(
    ...chartData.flatMap((row) => [row.FP32, row.INT8]),
  );
  const accuracyDomainStart = Math.max(
    0,
    Math.floor((minimumAccuracy - 5) / 5) * 5,
  );
  const largest = sorted[0];

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

      <p className="chart-summary" aria-live="polite">
        Largest observed class change: <strong>{titleCase(largest.class_name)}</strong>, {speakDelta(largest.delta_pp)}.
      </p>

      {showTable ? (
        <div className="report-table-wrap">
          <table className="report-table">
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
          <div className="chart-scroll" role="img" aria-label="Grouped bar chart comparing FP32 and INT8 top-1 accuracy for ten classes">
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={390}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 12, right: 20, bottom: 12, left: 14 }} barGap={3}>
                  <CartesianGrid stroke="#e2e3e9" horizontal={false} />
                  <XAxis type="number" domain={[accuracyDomainStart, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#696e80", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fill: "#282d49", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`]} contentStyle={{ borderRadius: 14, borderColor: "#d9dae2", fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <Bar dataKey="FP32" fill="#315cf5" radius={[0, 4, 4, 0]} maxBarSize={8} />
                  <Bar dataKey="INT8" fill="#f4562e" radius={[0, 4, 4, 0]} maxBarSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="class-inspect-row">
            <span><ArrowDownUp size={13} /> Inspect a class</span>
            <div>{sorted.slice(0, 5).map((row) => <button type="button" key={row.class_id} onClick={() => setSelected(row)}>{titleCase(row.class_name)} <small>{formatDelta(row.delta_pp, 1)}</small></button>)}</div>
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
