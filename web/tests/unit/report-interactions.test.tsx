import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { AccuracyComparison } from "@/components/dashboard/accuracy-comparison";
import { PredictionDriftChart } from "@/components/dashboard/prediction-drift-chart";
import { demoReport } from "@/lib/demo-report";

afterEach(cleanup);

describe("interactive report evidence", () => {
  it("exposes exact overall accuracy values on hover, focus, and pin", async () => {
    const user = userEvent.setup();
    render(<AccuracyComparison report={demoReport} />);

    const candidate = screen.getByRole("button", { name: /^INT8 candidate:/i });
    const reference = screen.getByRole("button", { name: /^FP32 reference:/i });
    const readout = screen.getByRole("status");

    await user.hover(candidate);
    expect(readout).toHaveTextContent("INT8 candidate");
    expect(readout).toHaveTextContent("94.47%");
    expect(readout).toHaveTextContent("9,447 of 10,000 paired examples");

    fireEvent.focus(reference);
    expect(readout).toHaveTextContent("FP32 reference");
    expect(readout).toHaveTextContent("9,482 of 10,000 paired examples");

    await user.click(candidate);
    expect(candidate).toHaveAttribute("aria-pressed", "true");
    await user.unhover(candidate);
    expect(readout).toHaveTextContent("INT8 candidate");
  });

  it("explains observed KL and both policy thresholds with keyboard focus", async () => {
    const user = userEvent.setup();
    render(<PredictionDriftChart report={demoReport} />);

    const review = screen.getByRole("button", { name: /^Review threshold:/i });
    const block = screen.getByRole("button", { name: /^Block threshold:/i });
    const readout = screen.getByRole("status");

    fireEvent.focus(review);
    expect(readout).toHaveTextContent("Review threshold");
    expect(readout).toHaveTextContent("0.020 nats");
    expect(readout).toHaveTextContent("0.008 nats below");

    await user.click(block);
    expect(block).toHaveAttribute("aria-pressed", "true");
    expect(readout).toHaveTextContent("0.100 nats");
    expect(readout).toHaveTextContent("0.088 nats below");
  });
});
