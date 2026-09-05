import { connection } from "next/server";

import { validationReportSchema, type ValidationReport } from "@/lib/report-schema";

const REPORT_TIMEOUT_MS = 4_000;

export type LatestReportResult =
  | { state: "available"; report: ValidationReport }
  | { state: "unavailable" };

function reportUrl(baseUrl: string): URL | null {
  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}/api/reports/latest`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Retrieves evidence only from the optional local/service API. A response is
 * useful to the product only after it satisfies the shared contract and says
 * it was computed; this function deliberately never substitutes demo data.
 */
export async function getLatestComputedReport(): Promise<LatestReportResult> {
  // Keep the base URL server-only and resolve it at request time, so one build
  // can be deployed against distinct report services.
  await connection();

  const configuredBaseUrl = process.env.FIDELITY_API_BASE_URL?.trim();
  if (!configuredBaseUrl) return { state: "unavailable" };

  const url = reportUrl(configuredBaseUrl);
  if (!url) return { state: "unavailable" };

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    });
    if (!response.ok) return { state: "unavailable" };

    const payload: unknown = await response.json();
    const result = validationReportSchema.safeParse(payload);
    if (!result.success || result.data.provenance.kind !== "computed") {
      return { state: "unavailable" };
    }

    return { state: "available", report: result.data };
  } catch {
    // Network, timeout, and malformed JSON are expected delivery failures.
    // Do not expose service details or turn them into plausible-looking data.
    return { state: "unavailable" };
  }
}
