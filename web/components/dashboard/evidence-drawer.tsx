import { ChevronDown, CircleAlert } from "lucide-react";

import { formatPValue } from "@/lib/format";
import type { ValidationReport } from "@/lib/report-schema";

export function EvidenceDrawer({ report }: { report: ValidationReport }) {
  const significance = report.significance;
  const conclusion = !significance.valid
    ? "Statistical conclusion unavailable"
    : significance.interpretation === "no_observed_pairwise_differences"
      ? "No paired accuracy differences observed"
      : significance.interpretation === "statistically_detectable_candidate_decrease"
        ? "Statistically detectable accuracy decrease"
        : significance.interpretation === "statistically_detectable_candidate_increase"
          ? "Statistically detectable accuracy increase"
          : significance.interpretation === "statistically_detectable_pairwise_difference"
            ? "Statistically detectable paired difference"
            : "No statistically detectable accuracy change";
  return (
    <details className="evidence-drawer">
      <summary>
        <div><span>Technical evidence</span><strong>Wilcoxon signed-rank · p = {formatPValue(significance.p_value)}</strong></div>
        <span>Open evidence <ChevronDown size={17} /></span>
      </summary>
      <div className="evidence-drawer__body">
        <dl>
          <div><dt>Test</dt><dd>Wilcoxon signed-rank</dd></div>
          <div><dt>Observed p-value</dt><dd>{significance.p_value.toFixed(6)}</dd></div>
          <div><dt>Decision level</dt><dd>α = {significance.alpha}</dd></div>
          <div><dt>Discordant pairs</dt><dd>{significance.n_nonzero.toLocaleString()}</dd></div>
          <div><dt>Method</dt><dd>{significance.method.replaceAll("_", " ")}</dd></div>
          <div><dt>Conclusion</dt><dd>{conclusion}</dd></div>
        </dl>
        <div className="evidence-drawer__warning"><CircleAlert size={19} /><p><strong>Important:</strong> p ≥ α does not establish equivalence. It means this test did not detect a difference under this design and these observations.</p></div>
      </div>
    </details>
  );
}
