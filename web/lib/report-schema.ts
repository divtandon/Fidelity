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
  const close = (left: number, right: number) => Math.abs(left - right) <= 1e-10;
  const expectedReference = report.reference.correct_count / report.sample_count;
  const expectedCandidate = report.candidate.correct_count / report.sample_count;
  const expectedDelta = (expectedCandidate - expectedReference) * 100;
  const classSamples = report.per_class.reduce((sum, item) => sum + item.sample_count, 0);
  const classReference = report.per_class.reduce((sum, item) => sum + item.reference_correct, 0);
  const classCandidate = report.per_class.reduce((sum, item) => sum + item.candidate_correct, 0);

  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (!close(report.reference.top1_accuracy, expectedReference)) issue(["reference", "top1_accuracy"], "Accuracy does not match counts.");
  if (!close(report.candidate.top1_accuracy, expectedCandidate)) issue(["candidate", "top1_accuracy"], "Accuracy does not match counts.");
  if (!close(report.accuracy_delta_pp, expectedDelta)) issue(["accuracy_delta_pp"], "Delta does not match canonical counts.");
  if (report.significance.n_pairs !== report.sample_count) issue(["significance", "n_pairs"], "Pair count does not match sample count.");
  if (report.confidence_drift.sample_count !== report.sample_count) issue(["confidence_drift", "sample_count"], "Drift sample count does not match report.");
  if (classSamples !== report.sample_count || classReference !== report.reference.correct_count || classCandidate !== report.candidate.correct_count) {
    issue(["per_class"], "Class totals do not reconcile with aggregate counts.");
  }
  const ids = report.per_class.map((item) => item.class_id);
  if (new Set(ids).size !== ids.length) issue(["per_class"], "Class ids must be unique.");
});

export type ValidationReport = z.infer<typeof validationReportSchema>;
export type ClassAccuracy = ValidationReport["per_class"][number];

export function parseValidationReport(value: unknown): ValidationReport {
  return validationReportSchema.parse(value);
}
