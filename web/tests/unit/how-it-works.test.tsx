import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { EvidenceExplorer, type EvidenceSummary } from "@/app/how-it-works/evidence-explorer";

const summary: EvidenceSummary = {
  referenceAccuracy: "92.39%",
  candidateAccuracy: "92.38%",
  accuracyDelta: "−0.01 pp",
  largestClassName: "Cat",
  largestClassDelta: "+0.90 pp",
  drift: "0.000420",
  pValue: "1.000",
  nonzeroPairs: "39",
  pairCount: "10,000",
  alpha: "0.05",
  verdict: "Ready",
  policyName: "fidelity_default v1.0.0",
};

afterEach(cleanup);

describe("How it works evidence explorer", () => {
  it("switches evidence without losing report context", async () => {
    const user = userEvent.setup();
    render(<EvidenceExplorer summary={summary} />);

    const accuracy = screen.getByRole("tab", { name: "Accuracy" });
    const drift = screen.getByRole("tab", { name: "Prediction drift" });
    expect(accuracy).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("92.39% → 92.38%");

    await user.click(drift);
    expect(drift).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("0.000420 nats");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("not calibration error");
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<EvidenceExplorer summary={summary} />);

    const accuracy = screen.getByRole("tab", { name: "Accuracy" });
    accuracy.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Classes" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Cat · +0.90 pp");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Verdict" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Ready");

    await user.keyboard("{Home}");
    expect(accuracy).toHaveFocus();
  });
});
