import featuredReportPayload from "@/lib/verified-runs/cifar10-resnet18-int8-seed2026/report.json";
import { FEATURED_RUN_ID } from "@/lib/featured-run";
import { parseValidationReport, type ValidationReport } from "@/lib/report-schema";

const RUN_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseVerifiedReportForSlug(slug: string, payload: unknown): ValidationReport {
  if (!RUN_SLUG_PATTERN.test(slug)) {
    throw new Error(`Bundled report registry key is not a URL-safe run slug: ${slug}`);
  }

  const report = parseValidationReport(payload);
  if (report.provenance.kind !== "computed" || !report.provenance.computed) {
    throw new Error(`Bundled report ${slug} is not computed evidence.`);
  }
  if (report.run_id !== slug) {
    throw new Error(`Bundled report ${slug} declares run id ${report.run_id}.`);
  }

  return report;
}

const bundledReportPayloads: Readonly<Record<string, unknown>> = {
  [FEATURED_RUN_ID]: featuredReportPayload,
};

const bundledReports = new Map<string, ValidationReport>(
  Object.entries(bundledReportPayloads).map(([slug, payload]) => [
    slug,
    parseVerifiedReportForSlug(slug, payload),
  ]),
);

export function getVerifiedReport(runId: string): ValidationReport | undefined {
  return bundledReports.get(runId);
}
