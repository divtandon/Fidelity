import { describe, expect, it } from "vitest";

import { demoReport } from "@/lib/demo-report";
import { FEATURED_RUN_HREF, FEATURED_RUN_ID } from "@/lib/featured-run";
import { getVerifiedReport, parseVerifiedReportForSlug } from "@/lib/verified-reports";

describe("bundled verified reports", () => {
  it("resolves the featured computed report through its stable route", () => {
    const report = getVerifiedReport(FEATURED_RUN_ID);

    expect(FEATURED_RUN_HREF).toBe(`/runs/${FEATURED_RUN_ID}`);
    expect(report).toMatchObject({
      run_id: FEATURED_RUN_ID,
      provenance: { kind: "computed", computed: true },
      reference: { precision: "FP32", correct_count: 9239 },
      candidate: { precision: "INT8", correct_count: 9238 },
    });
  });

  it("does not resolve unregistered run ids", () => {
    expect(getVerifiedReport("not-in-the-bundle")).toBeUndefined();
  });

  it("rejects demo provenance, mismatched ids, and unsafe registry slugs", () => {
    expect(() => parseVerifiedReportForSlug(FEATURED_RUN_ID, demoReport)).toThrow(
      "is not computed evidence",
    );

    const computed = structuredClone(getVerifiedReport(FEATURED_RUN_ID));
    expect(computed).toBeDefined();
    computed!.run_id = "another-run";
    expect(() => parseVerifiedReportForSlug(FEATURED_RUN_ID, computed)).toThrow(
      "declares run id another-run",
    );

    expect(() => parseVerifiedReportForSlug("../unsafe", computed)).toThrow(
      "is not a URL-safe run slug",
    );
  });
});
