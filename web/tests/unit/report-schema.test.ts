import { describe, expect, it } from "vitest";

import { demoReport } from "@/lib/demo-report";
import { parseValidationReport } from "@/lib/report-schema";

describe("validation report boundary", () => {
  it("accepts the explicit illustrative fixture", () => {
    expect(parseValidationReport(demoReport)).toEqual(demoReport);
    expect(demoReport.provenance).toEqual({ kind: "demo", computed: false });
  });

  it("rejects aggregate values that do not reconcile with canonical counts", () => {
    const invalid = structuredClone(demoReport);
    invalid.candidate.top1_accuracy = 0.95;

    expect(() => parseValidationReport(invalid)).toThrow("Accuracy does not match counts.");
  });

  it("rejects aggregate correct counts above the evaluated sample count", () => {
    const invalid = structuredClone(demoReport);
    invalid.reference.correct_count = invalid.sample_count + 1;

    expect(() => parseValidationReport(invalid)).toThrow("Correct count exceeds sample count.");
  });

  it("requires a constrained provenance state", () => {
    const invalid = structuredClone(demoReport) as Record<string, unknown>;
    invalid.provenance = { kind: "demo", computed: true };

    expect(() => parseValidationReport(invalid)).toThrow();
  });

  it("rejects class totals that diverge from the aggregate", () => {
    const invalid = structuredClone(demoReport);
    invalid.per_class[0].candidate_correct -= 1;

    expect(() => parseValidationReport(invalid)).toThrow("Class totals do not reconcile with aggregate counts.");
  });

  it.each([
    ["reference_accuracy", 0.5],
    ["candidate_accuracy", 0.5],
    ["delta_pp", 42],
  ] as const)("rejects a class row with an edited %s", (field, value) => {
    const invalid = structuredClone(demoReport);
    Object.assign(invalid.per_class[0], { [field]: value });

    expect(() => parseValidationReport(invalid)).toThrow(/Class (accuracy|delta) does not match counts\./);
  });

  it("rejects impossible class correct counts", () => {
    const invalid = structuredClone(demoReport);
    invalid.per_class[0].reference_correct = invalid.per_class[0].sample_count + 1;

    expect(() => parseValidationReport(invalid)).toThrow("Correct count exceeds class sample count.");
  });

  it("requires per-class rows to be ordered by class id", () => {
    const invalid = structuredClone(demoReport);
    [invalid.per_class[0], invalid.per_class[1]] = [invalid.per_class[1], invalid.per_class[0]];

    expect(() => parseValidationReport(invalid)).toThrow("Class ids must be strictly increasing.");
  });

  it("rejects a nonzero pair count above the total pair count", () => {
    const invalid = structuredClone(demoReport);
    invalid.significance.n_nonzero = invalid.significance.n_pairs + 1;

    expect(() => parseValidationReport(invalid)).toThrow("Nonzero pair count exceeds pair count.");
  });

  it("rejects a pair count that is infeasible for the aggregate correct counts", () => {
    const invalid = structuredClone(demoReport);
    invalid.significance.n_nonzero -= 1;

    expect(() => parseValidationReport(invalid)).toThrow("Nonzero pair count is infeasible for the reported correct counts.");
  });

  it("requires the binary correctness test method implied by nonzero pairs", () => {
    const invalid = structuredClone(demoReport);
    invalid.significance.method = "normal_approximation";

    expect(() => parseValidationReport(invalid)).toThrow("Significance validity, method, and nonzero pair count disagree.");
  });

  it("rejects edited pairwise statistics and medians", () => {
    const statistic = structuredClone(demoReport);
    statistic.significance.statistic += 1;
    const median = structuredClone(demoReport);
    median.significance.median_difference = 1;

    expect(() => parseValidationReport(statistic)).toThrow("Statistic does not match the reported pair transitions.");
    expect(() => parseValidationReport(median)).toThrow("Median difference does not match the reported pair transitions.");
  });

  it("requires significance decisions and interpretations to match their evidence", () => {
    const decision = structuredClone(demoReport);
    decision.significance.is_significant = true;
    const interpretation = structuredClone(demoReport);
    interpretation.significance.interpretation = "statistically_detectable_candidate_decrease";

    expect(() => parseValidationReport(decision)).toThrow("Significance decision disagrees with p-value and alpha.");
    expect(() => parseValidationReport(interpretation)).toThrow("Interpretation disagrees with significance evidence.");
  });

  it("accepts the canonical no-observed-differences significance state", () => {
    const noDifferences = structuredClone(demoReport);
    noDifferences.candidate = structuredClone(noDifferences.reference);
    noDifferences.candidate.precision = "INT8";
    noDifferences.accuracy_delta_pp = 0;
    noDifferences.per_class.forEach((item) => {
      item.candidate_correct = item.reference_correct;
      item.candidate_accuracy = item.reference_accuracy;
      item.delta_pp = 0;
    });
    Object.assign(noDifferences.significance, {
      statistic: 0,
      p_value: 1,
      n_nonzero: 0,
      method: "not_applicable",
      valid: false,
      median_difference: 0,
      note: "All paired differences are zero; the signed-rank statistic is undefined.",
      is_significant: false,
      interpretation: "no_observed_pairwise_differences",
    });

    expect(parseValidationReport(noDifferences)).toEqual(noDifferences);
  });

  it("requires significance and policy alpha to agree", () => {
    const invalid = structuredClone(demoReport);
    invalid.verdict.policy.alpha = 0.01;

    expect(() => parseValidationReport(invalid)).toThrow("Policy alpha does not match significance alpha.");
  });

  it("rejects a block threshold below its corresponding review threshold", () => {
    const invalid = structuredClone(demoReport);
    invalid.verdict.policy.block_accuracy_drop_pp = 0.1;

    expect(() => parseValidationReport(invalid)).toThrow("Block threshold must be at least its review threshold.");
  });

  it("keeps the verdict and its reasons backend-owned", () => {
    const backendDecision = structuredClone(demoReport);
    backendDecision.verdict.status = "blocked";
    backendDecision.verdict.reasons = ["Backend-owned policy decision."];

    expect(parseValidationReport(backendDecision).verdict).toEqual(backendDecision.verdict);
  });

  it("caps reports at the shared ten-million-sample safety boundary", () => {
    const invalid = structuredClone(demoReport);
    invalid.sample_count = 10_000_001;

    expect(() => parseValidationReport(invalid)).toThrow();
  });
});
