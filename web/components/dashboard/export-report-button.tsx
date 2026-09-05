"use client";

import { Download } from "lucide-react";

import type { ValidationReport } from "@/lib/report-schema";

export function ExportReportButton({ report }: { report: ValidationReport }) {
  const isDemo = report.provenance.kind === "demo";

  function downloadReport() {
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isDemo ? "fidelity-demo-report.json" : `fidelity-${report.run_id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="button button--quiet report-download" type="button" onClick={downloadReport}>
      <Download size={16} /> Download {isDemo ? "demo" : "computed"} JSON
    </button>
  );
}
