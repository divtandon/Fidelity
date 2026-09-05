import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AccuracyMeter } from "@/components/home/accuracy-meter";

afterEach(cleanup);

describe("Home accuracy meter", () => {
  it("exposes the exact percentage and paired correct count", () => {
    render(
      <dl>
        <AccuracyMeter
          correctCount={9239}
          fillPercent={92.39}
          precision="FP32"
          sampleCount={10_000}
          tone="blue"
          value="92.39%"
        />
      </dl>,
    );

    const meter = screen.getByRole("meter", { name: "FP32 top-1 accuracy" });
    expect(meter).toHaveAttribute("tabindex", "0");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", "92.39");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "92.39%; 9,239 correct out of 10,000 held-out examples",
    );
    expect(meter.querySelector("[data-meter-disclosure]")).toHaveTextContent(
      "9,239 / 10,000 correct",
    );
  });
});
