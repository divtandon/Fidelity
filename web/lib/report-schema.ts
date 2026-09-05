import { z } from "zod";

const finiteNumber = z.number().finite();
const probability = finiteNumber.min(0).max(1);

const modelMetricsSchema = z.object({
  precision: z.string().min(1),
  top1_accuracy: probability,
  correct_count: z.number().int().nonnegative(),
}).strict();

const provenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("computed"), computed: z.literal(true) }).strict(),
  z.object({ kind: z.literal("demo"), computed: z.literal(false) }).strict(),
]);

const significanceSchema = z.object({
  test: z.literal("wilcoxon_signed_rank"),
  statistic: finiteNumber.nonnegative(),
  p_value: probability,
  n_pairs: z.number().int().positive(),
  n_nonzero: z.number().int().nonnegative(),
  method: z.enum(["exact_permutation", "normal_approximation", "not_applicable"]),
  alternative: z.literal("two-sided"),
  valid: z.boolean(),
  median_difference: finiteNumber,
  note: z.string().nullable(),
  alpha: finiteNumber.gt(0).lt(1),
  is_significant: z.boolean(),
  interpretation: z.enum([
    "no_observed_pairwise_differences",
    "statistically_detectable_candidate_decrease",
    "statistically_detectable_candidate_increase",
    "statistically_detectable_pairwise_difference",
    "no_statistically_detectable_difference",
  ]),
}).strict();

const confidenceDriftSchema = z.object({
  metric: z.literal("kl_divergence"),
  value: finiteNumber.nonnegative(),
  direction: z.literal("reference_to_candidate"),
  unit: z.literal("nats"),
  epsilon: finiteNumber.positive(),
  sample_count: z.number().int().positive().max(10_000_000),
}).strict();

const classAccuracySchema = z.object({
  class_id: z.number().int().nonnegative(),
  class_name: z.string().min(1),
  sample_count: z.number().int().positive().max(10_000_000),
  reference_correct: z.number().int().nonnegative(),
  candidate_correct: z.number().int().nonnegative(),
  reference_accuracy: probability,
  candidate_accuracy: probability,
  delta_pp: finiteNumber,
}).strict();

const policySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  alpha: finiteNumber.gt(0).lt(1),
  review_accuracy_drop_pp: finiteNumber.nonnegative(),
  block_accuracy_drop_pp: finiteNumber.nonnegative(),
  review_confidence_kl: finiteNumber.nonnegative(),
  block_confidence_kl: finiteNumber.nonnegative(),
  review_class_drop_pp: finiteNumber.nonnegative(),
  block_class_drop_pp: finiteNumber.nonnegative(),
  minimum_class_samples: z.number().int().positive(),
}).strict();

export const validationReportSchema = z.object({
  schema_version: z.literal("1.0.0"),
  provenance: provenanceSchema,
  run_id: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
  model: z.string().min(1),
  dataset: z.string().min(1),
  sample_count: z.number().int().positive().max(10_000_000),
  reference: modelMetricsSchema,
  candidate: modelMetricsSchema,
  accuracy_delta_pp: finiteNumber,
  significance: significanceSchema,
  confidence_drift: confidenceDriftSchema,
  per_class: z.array(classAccuracySchema).min(1),
  verdict: z.object({
    status: z.enum(["ready", "review", "blocked"]),
    reasons: z.array(z.string().min(1)),
    policy: policySchema,
  }).strict(),
}).strict().superRefine((report, context) => {
  const ulp = (value: number) => {
    const absolute = Math.abs(value);
    if (absolute === 0 || absolute < 2 ** -1022) return Number.MIN_VALUE;
    return 2 ** (Math.floor(Math.log2(absolute)) - 52);
  };
  const close = (left: number, right: number) => (
    left === right || Math.abs(left - right) <= 4 * Math.max(ulp(left), ulp(right))
  );
  const expectedReference = report.reference.correct_count / report.sample_count;
  const expectedCandidate = report.candidate.correct_count / report.sample_count;
  const expectedDelta = (
    (report.candidate.correct_count - report.reference.correct_count)
    * 100
    / report.sample_count
  );
  const classSamples = report.per_class.reduce((sum, item) => sum + item.sample_count, 0);
  const classReference = report.per_class.reduce((sum, item) => sum + item.reference_correct, 0);
  const classCandidate = report.per_class.reduce((sum, item) => sum + item.candidate_correct, 0);

  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (report.reference.correct_count > report.sample_count) issue(["reference", "correct_count"], "Correct count exceeds sample count.");
  if (report.candidate.correct_count > report.sample_count) issue(["candidate", "correct_count"], "Correct count exceeds sample count.");
  if (!close(report.reference.top1_accuracy, expectedReference)) issue(["reference", "top1_accuracy"], "Accuracy does not match counts.");
  if (!close(report.candidate.top1_accuracy, expectedCandidate)) issue(["candidate", "top1_accuracy"], "Accuracy does not match counts.");
  if (!close(report.accuracy_delta_pp, expectedDelta)) issue(["accuracy_delta_pp"], "Delta does not match canonical counts.");
  if (report.significance.n_pairs !== report.sample_count) issue(["significance", "n_pairs"], "Pair count does not match sample count.");
  if (report.significance.n_nonzero > report.significance.n_pairs) issue(["significance", "n_nonzero"], "Nonzero pair count exceeds pair count.");
  if (report.confidence_drift.sample_count !== report.sample_count) issue(["confidence_drift", "sample_count"], "Drift sample count does not match report.");
  if (classSamples !== report.sample_count || classReference !== report.reference.correct_count || classCandidate !== report.candidate.correct_count) {
    issue(["per_class"], "Class totals do not reconcile with aggregate counts.");
  }

  report.per_class.forEach((item, index) => {
    if (item.reference_correct > item.sample_count) {
      issue(["per_class", index, "reference_correct"], "Correct count exceeds class sample count.");
    }
    if (item.candidate_correct > item.sample_count) {
      issue(["per_class", index, "candidate_correct"], "Correct count exceeds class sample count.");
    }

    const expectedClassReference = item.reference_correct / item.sample_count;
    const expectedClassCandidate = item.candidate_correct / item.sample_count;
    const expectedClassDelta = (
      (item.candidate_correct - item.reference_correct) * 100 / item.sample_count
    );
    if (!close(item.reference_accuracy, expectedClassReference)) {
      issue(["per_class", index, "reference_accuracy"], "Class accuracy does not match counts.");
    }
    if (!close(item.candidate_accuracy, expectedClassCandidate)) {
      issue(["per_class", index, "candidate_accuracy"], "Class accuracy does not match counts.");
    }
    if (!close(item.delta_pp, expectedClassDelta)) {
      issue(["per_class", index, "delta_pp"], "Class delta does not match counts.");
    }
    if (index > 0 && item.class_id <= report.per_class[index - 1].class_id) {
      issue(["per_class", index, "class_id"], "Class ids must be strictly increasing.");
    }
  });

  const expectedValid = report.significance.n_nonzero > 0;
  const expectedMethod = expectedValid ? "exact_permutation" : "not_applicable";
  if (report.significance.valid !== expectedValid || report.significance.method !== expectedMethod) {
    issue(["significance"], "Significance validity, method, and nonzero pair count disagree.");
  }

  const netCorrectness = report.candidate.correct_count - report.reference.correct_count;
  const hasIntegralTransitions = (report.significance.n_nonzero + netCorrectness) % 2 === 0;
  let gains = 0;
  let losses = 0;
  let transitionsAreFeasible = hasIntegralTransitions;
  if (hasIntegralTransitions) {
    gains = (report.significance.n_nonzero + netCorrectness) / 2;
    losses = (report.significance.n_nonzero - netCorrectness) / 2;
    const bothCorrect = report.reference.correct_count - losses;
    const bothIncorrect = report.sample_count - bothCorrect - gains - losses;
    transitionsAreFeasible = Math.min(gains, losses, bothCorrect, bothIncorrect) >= 0;
  }
  if (!transitionsAreFeasible) {
    issue(["significance", "n_nonzero"], "Nonzero pair count is infeasible for the reported correct counts.");
  } else {
    const expectedStatistic = expectedValid
      ? Math.min(gains, losses) * ((report.significance.n_nonzero + 1) / 2)
      : 0;
    if (!close(report.significance.statistic, expectedStatistic)) {
      issue(["significance", "statistic"], "Statistic does not match the reported pair transitions.");
    }

    const orderedDifference = (index: number) => {
      if (index < losses) return -1;
      if (index < report.significance.n_pairs - gains) return 0;
      return 1;
    };
    const middle = Math.floor(report.significance.n_pairs / 2);
    const expectedMedian = report.significance.n_pairs % 2 === 1
      ? orderedDifference(middle)
      : (orderedDifference(middle - 1) + orderedDifference(middle)) / 2;
    if (!close(report.significance.median_difference, expectedMedian)) {
      issue(["significance", "median_difference"], "Median difference does not match the reported pair transitions.");
    }
  }

  const expectedNote = expectedValid
    ? null
    : "All paired differences are zero; the signed-rank statistic is undefined.";
  if (!expectedValid && !close(report.significance.p_value, 1)) {
    issue(["significance", "p_value"], "A report with no observed pairwise differences must have p = 1.");
  }
  if (report.significance.note !== expectedNote) {
    issue(["significance", "note"], "Significance note disagrees with pairwise evidence.");
  }

  const expectedIsSignificant = expectedValid
    && report.significance.p_value < report.significance.alpha;
  if (report.significance.is_significant !== expectedIsSignificant) {
    issue(["significance", "is_significant"], "Significance decision disagrees with p-value and alpha.");
  }
  const expectedInterpretation = !expectedValid
    ? "no_observed_pairwise_differences"
    : expectedIsSignificant && expectedDelta < 0
      ? "statistically_detectable_candidate_decrease"
      : expectedIsSignificant && expectedDelta > 0
        ? "statistically_detectable_candidate_increase"
        : expectedIsSignificant
          ? "statistically_detectable_pairwise_difference"
          : "no_statistically_detectable_difference";
  if (report.significance.interpretation !== expectedInterpretation) {
    issue(["significance", "interpretation"], "Interpretation disagrees with significance evidence.");
  }

  if (!close(report.significance.alpha, report.verdict.policy.alpha)) {
    issue(["verdict", "policy", "alpha"], "Policy alpha does not match significance alpha.");
  }
  const thresholdPairs = [
    ["block_accuracy_drop_pp", report.verdict.policy.block_accuracy_drop_pp, report.verdict.policy.review_accuracy_drop_pp],
    ["block_confidence_kl", report.verdict.policy.block_confidence_kl, report.verdict.policy.review_confidence_kl],
    ["block_class_drop_pp", report.verdict.policy.block_class_drop_pp, report.verdict.policy.review_class_drop_pp],
  ] as const;
  thresholdPairs.forEach(([field, block, review]) => {
    if (block < review) {
      issue(["verdict", "policy", field], "Block threshold must be at least its review threshold.");
    }
  });
});

export type ValidationReport = z.infer<typeof validationReportSchema>;
export type ClassAccuracy = ValidationReport["per_class"][number];

export function parseValidationReport(value: unknown): ValidationReport {
  return validationReportSchema.parse(value);
}
