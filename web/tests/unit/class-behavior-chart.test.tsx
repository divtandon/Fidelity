import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ClassBehaviorChart } from "@/components/methods/class-behavior-chart";
import type { ClassAccuracy } from "@/lib/report-schema";

const rows: ClassAccuracy[] = [
  { class_id: 0, class_name: "airplane", sample_count: 1000, reference_correct: 933, candidate_correct: 933, reference_accuracy: 0.933, candidate_accuracy: 0.933, delta_pp: 0 },
  { class_id: 3, class_name: "cat", sample_count: 1000, reference_correct: 820, candidate_correct: 829, reference_accuracy: 0.82, candidate_accuracy: 0.829, delta_pp: 0.9 },
  { class_id: 5, class_name: "dog", sample_count: 1000, reference_correct: 887, candidate_correct: 884, reference_accuracy: 0.887, candidate_accuracy: 0.884, delta_pp: -0.3 },
];

afterEach(cleanup);

describe("Methods class behavior chart", () => {
  it("shows verified values for every focusable class row", () => {
    render(
      <ClassBehaviorChart
        candidatePrecision="INT8"
        referencePrecision="FP32"
        rows={rows}
        runLabel="CIFAR-10 test split · 3,000 paired examples"
      />,
    );

    expect(screen.getByText(/CIFAR-10 test split/)).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Cat: FP32 82.00%, INT8 82.90%, change \+0.90 pp/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Dog: FP32 88.70%, INT8 88.40%/i })).toBeVisible();
  });

  it("updates the in-panel reading on hover and keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <ClassBehaviorChart
        candidatePrecision="INT8"
        referencePrecision="FP32"
        rows={rows}
        runLabel="Verified run"
      />,
    );

    const reading = screen.getByTestId("class-behavior-reading");
    expect(within(reading).getByRole("heading", { name: "Cat" })).toBeVisible();
    expect(reading).toHaveTextContent("82.00%");
    expect(reading).toHaveTextContent("82.90%");
    expect(reading).toHaveTextContent("820 of 1,000 correct");
    expect(reading).toHaveTextContent("829 of 1,000 correct");
    expect(reading).toHaveTextContent("+0.90 pp");

    const dog = screen.getByRole("button", { name: /Dog:/i });
    await user.hover(dog);
    expect(within(reading).getByRole("heading", { name: "Dog" })).toBeVisible();
    expect(reading).toHaveTextContent("88.70%");
    expect(reading).toHaveTextContent("88.40%");
    expect(reading).toHaveTextContent("884 of 1,000 correct");

    const cat = screen.getByRole("button", { name: /Cat:/i });
    cat.focus();
    await user.keyboard("{ArrowDown}");
    expect(dog).toHaveFocus();
    expect(within(reading).getByRole("heading", { name: "Dog" })).toBeVisible();
  });
});
