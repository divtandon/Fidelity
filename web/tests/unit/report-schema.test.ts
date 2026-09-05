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

  it("caps reports at the shared ten-million-sample safety boundary", () => {
    const invalid = structuredClone(demoReport);
    invalid.sample_count = 10_000_001;

    expect(() => parseValidationReport(invalid)).toThrow();
  });
});
