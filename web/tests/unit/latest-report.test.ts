import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

import { demoReport } from "@/lib/demo-report";
import { getLatestComputedReport } from "@/lib/latest-report";

function computedFixture() {
  const report = structuredClone(demoReport);
  report.provenance = { kind: "computed", computed: true };
  report.run_id = "RUN-COMPUTED-01";
  return report;
}

describe("latest computed report delivery", () => {
  beforeEach(() => {
    process.env.FIDELITY_API_BASE_URL = "http://127.0.0.1:8000";
  });

  afterEach(() => {
    delete process.env.FIDELITY_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("accepts a contract-valid computed response with no request cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(computedFixture()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getLatestComputedReport()).resolves.toMatchObject({
      state: "available",
      report: { run_id: "RUN-COMPUTED-01", provenance: { kind: "computed", computed: true } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:8000/api/reports/latest");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("does not present a fixture labeled as demo as computed evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(demoReport), { status: 200 })));

    await expect(getLatestComputedReport()).resolves.toEqual({ state: "unavailable" });
  });

  it("fails closed for missing configuration, bad responses, and contract violations", async () => {
    delete process.env.FIDELITY_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getLatestComputedReport()).resolves.toEqual({ state: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.FIDELITY_API_BASE_URL = "http://127.0.0.1:8000";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("service unavailable", { status: 503 })));
    await expect(getLatestComputedReport()).resolves.toEqual({ state: "unavailable" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ run_id: "not-a-report" }), { status: 200 })));
    await expect(getLatestComputedReport()).resolves.toEqual({ state: "unavailable" });
  });
});
