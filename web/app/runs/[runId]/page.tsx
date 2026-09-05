import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity, ArrowDown, Check, CircleAlert, Database, FileJson2, Fingerprint, ShieldCheck } from "lucide-react";

import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { PerClassChart } from "@/components/dashboard/per-class-chart";
import { demoReport } from "@/lib/demo-report";
import { formatDelta, formatPValue, formatPercent } from "@/lib/format";

type RunPageProps = { params: Promise<{ runId: string }> };

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { runId } = await params;
  return { title: runId === "demo" ? "Demo validation" : "Validation run" };
}

export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  if (runId !== "demo") notFound();
  const report = demoReport;
  const largestClass = [...report.per_class].sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))[0];

  return (
    <main id="main-content" className="report-page">
      <div className="demo-banner" role="note">
        <div className="page-shell"><CircleAlert size={16} /><p><strong>Demo data — interface preview only.</strong> These values were not produced by Fidelity’s model pipeline. Do not use them to judge model quality.</p></div>
      </div>

      <div className="page-shell report-shell">
        <header className="run-header">
          <div><p className="report-kicker">Validation report</p><h1>{report.run_id}</h1></div>
          <dl>
            <div><dt>Model</dt><dd>{report.model}</dd></div>
            <div><dt>Dataset</dt><dd>{report.dataset}</dd></div>
            <div><dt>Samples</dt><dd>{report.sample_count.toLocaleString()}</dd></div>
            <div><dt>Provenance</dt><dd><span className="demo-dot" /> Illustrative fixture</dd></div>
          </dl>
          <ExportReportButton report={report} />
        </header>

        <section className="verdict-card" aria-labelledby="verdict-title">
          <div className="verdict-card__icon"><ShieldCheck size={31} strokeWidth={1.6} /></div>
          <div className="verdict-card__copy">
            <p className="report-kicker">Demo outcome · policy status: {report.verdict.status}</p>
            <h2 id="verdict-title">No significant accuracy change detected.</h2>
            <p>For this illustrative run, the paired test did not detect a difference at α = {report.significance.alpha}. This is not proof of equivalence.</p>
            <a href="#technical-evidence">What does this mean? <ArrowDown size={14} /></a>
          </div>
          <div className="verdict-card__seal" aria-label="Illustrative policy status ready">
            <Check size={18} /><span>Ready</span><small>demo policy</small>
          </div>
        </section>

        <section className="comparison-panel report-panel" aria-labelledby="comparison-title">
          <div className="report-panel__heading">
            <div><p className="report-kicker">Overall comparison</p><h2 id="comparison-title">How large was the accuracy change?</h2><p>Candidate minus reference, measured on the same illustrative examples.</p></div>
            <span className="comparison-panel__delta">{formatDelta(report.accuracy_delta_pp)}</span>
          </div>
          <div className="accuracy-comparison">
            <article className="accuracy-card accuracy-card--fp32">
              <div><span>Reference</span><strong>{report.reference.precision}</strong></div>
              <p>{formatPercent(report.reference.top1_accuracy)}</p>
              <div className="accuracy-card__bar"><i style={{ width: `${report.reference.top1_accuracy * 100}%` }} /></div>
              <small>{report.reference.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
            </article>
            <div className="comparison-aperture" aria-hidden="true"><i /><span>−0.35</span><i /></div>
            <article className="accuracy-card accuracy-card--int8">
              <div><span>Candidate</span><strong>{report.candidate.precision}</strong></div>
              <p>{formatPercent(report.candidate.top1_accuracy)}</p>
              <div className="accuracy-card__bar"><i style={{ width: `${report.candidate.top1_accuracy * 100}%` }} /></div>
              <small>{report.candidate.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
            </article>
          </div>
          <p className="comparison-explainer"><Fingerprint size={15} /> Percentage points compare two percentages directly. A change from 94.82% to 94.47% is down 0.35 percentage points.</p>
        </section>

        <PerClassChart rows={report.per_class} />

        <section className="secondary-evidence-grid">
          <article className="report-panel drift-panel">
            <div className="report-panel__heading"><div><p className="report-kicker">Prediction drift</p><h2>Did the output distributions move?</h2><p>Mean KL(reference ∥ candidate), across all illustrative examples.</p></div></div>
            <div className="drift-orbit" aria-hidden="true"><i /><i /><i /><span>{report.confidence_drift.value.toFixed(3)}</span><small>nats</small></div>
            <div className="drift-scale"><span>Closer</span><i><b style={{ left: "12%" }} /></i><span>Farther</span></div>
            <p className="drift-note">Lower means closer, but Fidelity does not assume a universal safe threshold. This fixture remains below its demo review threshold of {report.verdict.policy.review_confidence_kl.toFixed(3)} nats.</p>
          </article>

          <article className="report-panel signal-panel">
            <div className="report-panel__heading"><div><p className="report-kicker">Largest class shift</p><h2>{largestClass.class_name.charAt(0).toUpperCase() + largestClass.class_name.slice(1)}</h2><p>The largest absolute per-class movement in this fixture.</p></div></div>
            <div className="signal-panel__value"><strong>{formatDelta(largestClass.delta_pp)}</strong><span>percentage points</span></div>
            <dl><div><dt>FP32</dt><dd>{formatPercent(largestClass.reference_accuracy)}</dd></div><div><dt>INT8</dt><dd>{formatPercent(largestClass.candidate_accuracy)}</dd></div></dl>
            <p><Activity size={15} /> Direct labels accompany color throughout the report.</p>
          </article>
        </section>

        <section id="technical-evidence" className="technical-section">
          <div className="technical-section__heading"><p className="report-kicker">Statistical evidence</p><h2>Inspect the conclusion,<br />not just the color.</h2><p>The report keeps method, decision level, pair counts, and caveat within the same review path.</p></div>
          <EvidenceDrawer report={report} />
        </section>

        <section className="artifact-section report-panel">
          <div className="report-panel__heading"><div><p className="report-kicker">Artifact record</p><h2>What can be inspected or exported?</h2><p>The demo uses the same typed shape as a computed report, with provenance that cannot be mistaken for model output.</p></div><FileJson2 size={28} strokeWidth={1.4} /></div>
          <div className="artifact-grid">
            <div><Database size={17} /><span>Schema</span><strong>{report.schema_version}</strong></div>
            <div><Fingerprint size={17} /><span>Run id</span><strong>{report.run_id}</strong></div>
            <div><FileJson2 size={17} /><span>Provenance</span><strong>demo · computed false</strong></div>
            <div><Activity size={17} /><span>p-value</span><strong>{formatPValue(report.significance.p_value)}</strong></div>
          </div>
          <ExportReportButton report={report} />
        </section>
      </div>
    </main>
  );
}
