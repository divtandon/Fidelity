import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowDown, ArrowRight, Check, CircleAlert, Database, FileJson2, Fingerprint, ShieldCheck } from "lucide-react";

import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { PerClassChart } from "@/components/dashboard/per-class-chart";
import { demoReport } from "@/lib/demo-report";
import { formatDelta, formatPValue, formatPercent } from "@/lib/format";
import { getLatestComputedReport } from "@/lib/latest-report";
import type { ValidationReport } from "@/lib/report-schema";

type RunPageProps = { params: Promise<{ runId: string }> };

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function conclusionFor(report: ValidationReport) {
  if (!report.significance.valid) return "Statistical conclusion unavailable.";

  switch (report.significance.interpretation) {
    case "no_observed_pairwise_differences":
      return "No paired accuracy differences observed.";
    case "statistically_detectable_candidate_decrease":
      return "Statistically detectable accuracy decrease.";
    case "statistically_detectable_candidate_increase":
      return "Statistically detectable accuracy increase.";
    case "statistically_detectable_pairwise_difference":
      return "Statistically detectable paired difference.";
    default:
      return "No statistically detectable accuracy change.";
  }
}

function conclusionDetail(report: ValidationReport, isDemo: boolean) {
  const subject = isDemo ? "This illustrative run" : "This computed run";
  if (!report.significance.valid) {
    return `${subject} does not support a statistical conclusion${report.significance.note ? `: ${report.significance.note}` : "."}`;
  }
  if (report.significance.is_significant) {
    return `${subject} produced a detectable paired difference at α = ${report.significance.alpha}. Inspect the evidence before treating this policy status as a deployment decision.`;
  }
  return `${subject} did not detect a paired difference at α = ${report.significance.alpha}. This is not proof of equivalence.`;
}

function UnavailableReport() {
  return (
    <main id="main-content" className="report-page report-unavailable">
      <section className="page-shell report-unavailable__card" aria-labelledby="unavailable-title">
        <span className="report-unavailable__mark"><CircleAlert size={24} /></span>
        <p className="report-kicker">Report delivery</p>
        <h1 id="unavailable-title">Computed evidence is unavailable.</h1>
        <p>Fidelity has not received a valid pipeline-produced report for this environment. It will not substitute illustrative values for a computed validation result.</p>
        <div className="report-unavailable__actions">
          <Link className="button" href="/docs">Set up the report service <ArrowRight size={16} /></Link>
          <Link className="button button--quiet" href="/runs/demo">Open clearly labeled demo</Link>
        </div>
      </section>
    </main>
  );
}

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { runId } = await params;
  if (runId === "demo") return { title: "Demo validation" };
  if (runId === "latest") return { title: "Latest validation" };
  return { title: "Validation run" };
}

export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  if (runId !== "demo" && runId !== "latest") notFound();

  const isDemo = runId === "demo";
  let report: ValidationReport;
  if (isDemo) {
    report = demoReport;
  } else {
    const loaded = await getLatestComputedReport();
    if (loaded.state !== "available") return <UnavailableReport />;
    report = loaded.report;
  }
  const largestClass = [...report.per_class].sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))[0];
  const conclusion = conclusionFor(report);
  const status = titleCase(report.verdict.status);
  const sourceName = isDemo ? "illustrative fixture" : "computed report";
  const provenance = isDemo ? "Illustrative fixture" : "Pipeline-produced evidence";
  const driftInReviewRange = report.confidence_drift.value < report.verdict.policy.review_confidence_kl;

  return (
    <main id="main-content" className="report-page">
      {isDemo ? (
        <div className="demo-banner" role="note">
          <div className="page-shell"><CircleAlert size={16} /><p><strong>Demo data — interface preview only.</strong> These values were not produced by Fidelity’s model pipeline. Do not use them to judge model quality.</p></div>
        </div>
      ) : null}

      <div className="page-shell report-shell">
        <header className="run-header">
          <div><p className="report-kicker">{isDemo ? "Demo validation" : "Computed validation"}</p><h1>{report.run_id}</h1></div>
          <dl>
            <div><dt>Model</dt><dd>{report.model}</dd></div>
            <div><dt>Dataset</dt><dd>{report.dataset}</dd></div>
            <div><dt>Samples</dt><dd>{report.sample_count.toLocaleString()}</dd></div>
            <div><dt>Provenance</dt><dd><span className={isDemo ? "demo-dot" : "computed-dot"} /> {provenance}</dd></div>
          </dl>
          <ExportReportButton report={report} />
        </header>

        <section className={`verdict-card verdict-card--${report.verdict.status}`} aria-labelledby="verdict-title">
          <div className="verdict-card__icon">{report.verdict.status === "ready" ? <ShieldCheck size={31} strokeWidth={1.6} /> : <CircleAlert size={31} strokeWidth={1.6} />}</div>
          <div className="verdict-card__copy">
            <p className="report-kicker">{isDemo ? "Demo outcome" : "Computed outcome"} · policy status: {report.verdict.status}</p>
            <h2 id="verdict-title">{conclusion}</h2>
            <p>{conclusionDetail(report, isDemo)}</p>
            {report.verdict.reasons.length ? (
              <ul className="verdict-card__reasons" aria-label="Policy reasons">
                {report.verdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : null}
            <a href="#technical-evidence">What does this mean? <ArrowDown size={14} /></a>
          </div>
          <div className="verdict-card__seal" aria-label={`${isDemo ? "Illustrative" : "Computed"} policy status ${report.verdict.status}`}>
            {report.verdict.status === "ready" ? <Check size={18} /> : <CircleAlert size={18} />}<span>{status}</span><small>{isDemo ? "demo policy" : "policy result"}</small>
          </div>
        </section>

        <section className="comparison-panel report-panel" aria-labelledby="comparison-title">
          <div className="report-panel__heading">
            <div><p className="report-kicker">Overall comparison</p><h2 id="comparison-title">How large was the accuracy change?</h2><p>Candidate minus reference, measured on the same evaluated examples.</p></div>
            <span className="comparison-panel__delta">{formatDelta(report.accuracy_delta_pp)}</span>
          </div>
          <div className="accuracy-comparison">
            <article className="accuracy-card accuracy-card--fp32">
              <div><span>Reference</span><strong>{report.reference.precision}</strong></div>
              <p>{formatPercent(report.reference.top1_accuracy)}</p>
              <div className="accuracy-card__bar"><i style={{ width: `${report.reference.top1_accuracy * 100}%` }} /></div>
              <small>{report.reference.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
            </article>
            <div className="comparison-aperture" aria-label={`Observed change ${formatDelta(report.accuracy_delta_pp)}`}><i /><span>{formatDelta(report.accuracy_delta_pp)}</span><i /></div>
            <article className="accuracy-card accuracy-card--int8">
              <div><span>Candidate</span><strong>{report.candidate.precision}</strong></div>
              <p>{formatPercent(report.candidate.top1_accuracy)}</p>
              <div className="accuracy-card__bar"><i style={{ width: `${report.candidate.top1_accuracy * 100}%` }} /></div>
              <small>{report.candidate.correct_count.toLocaleString()} / {report.sample_count.toLocaleString()} correct</small>
            </article>
          </div>
          <p className="comparison-explainer"><Fingerprint size={15} /> Percentage points compare two percentages directly. The candidate changed from {formatPercent(report.reference.top1_accuracy)} to {formatPercent(report.candidate.top1_accuracy)} ({formatDelta(report.accuracy_delta_pp)}).</p>
        </section>

        <PerClassChart rows={report.per_class} />

        <section className="secondary-evidence-grid">
          <article className="report-panel drift-panel">
            <div className="report-panel__heading"><div><p className="report-kicker">Prediction drift</p><h2>Did the output distributions move?</h2><p>Mean KL(reference ∥ candidate), across all evaluated examples.</p></div></div>
            <div className="drift-orbit" role="img" aria-label={`Mean confidence divergence ${report.confidence_drift.value.toFixed(3)} nats`}><i /><i /><i /><span>{report.confidence_drift.value.toFixed(3)}</span><small>nats</small></div>
            <div className="drift-scale"><span>Closer</span><i><b style={{ left: `${Math.min(100, Math.max(0, report.confidence_drift.value / Math.max(report.verdict.policy.block_confidence_kl, 0.001) * 100))}%` }} /></i><span>Farther</span></div>
            <p className="drift-note">Lower means closer, but Fidelity does not assume a universal safe threshold. This {sourceName} is {driftInReviewRange ? "within" : "beyond"} its review threshold of {report.verdict.policy.review_confidence_kl.toFixed(3)} nats.</p>
          </article>

          <article className="report-panel signal-panel">
            <div className="report-panel__heading"><div><p className="report-kicker">Largest class shift</p><h2>{titleCase(largestClass.class_name)}</h2><p>The largest absolute per-class movement in this {sourceName}.</p></div></div>
            <div className="signal-panel__value"><strong>{formatDelta(largestClass.delta_pp)}</strong><span>percentage points</span></div>
            <dl><div><dt>{report.reference.precision}</dt><dd>{formatPercent(largestClass.reference_accuracy)}</dd></div><div><dt>{report.candidate.precision}</dt><dd>{formatPercent(largestClass.candidate_accuracy)}</dd></div></dl>
            <p><Activity size={15} /> Direct labels accompany color throughout the report.</p>
          </article>
        </section>

        <section id="technical-evidence" className="technical-section">
          <div className="technical-section__heading"><p className="report-kicker">Statistical evidence</p><h2>Inspect the conclusion,<br />not just the color.</h2><p>The report keeps method, decision level, pair counts, and caveat within the same review path.</p></div>
          <EvidenceDrawer report={report} />
        </section>

        <section className="artifact-section report-panel">
          <div className="report-panel__heading"><div><p className="report-kicker">Artifact record</p><h2>What can be inspected or exported?</h2><p>{isDemo ? "The demo uses the same typed shape as a computed report, with provenance that cannot be mistaken for model output." : "This downloadable artifact passed the report contract before it was presented as computed evidence."}</p></div><FileJson2 size={28} strokeWidth={1.4} /></div>
          <div className="artifact-grid">
            <div><Database size={17} /><span>Schema</span><strong>{report.schema_version}</strong></div>
            <div><Fingerprint size={17} /><span>Run id</span><strong>{report.run_id}</strong></div>
            <div><FileJson2 size={17} /><span>Provenance</span><strong>{report.provenance.kind} · computed {String(report.provenance.computed)}</strong></div>
            <div><Activity size={17} /><span>p-value</span><strong>{formatPValue(report.significance.p_value)}</strong></div>
          </div>
          <ExportReportButton report={report} />
        </section>
      </div>
    </main>
  );
}
