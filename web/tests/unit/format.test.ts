import { describe, expect, it } from "vitest";

import { formatDelta, formatPValue, formatPercent, speakDelta } from "@/lib/format";

describe("report formatting", () => {
  it("formats percentages and percentage-point deltas distinctly", () => {
    expect(formatPercent(0.9482)).toBe("94.82%");
    expect(formatDelta(-0.35)).toBe("−0.35 pp");
    expect(formatDelta(0)).toBe("0.00 pp");
    expect(formatDelta(1.2, 1)).toBe("+1.2 pp");
  });

  it("uses language that makes the delta direction audible", () => {
    expect(speakDelta(-0.35)).toBe("down 0.35 percentage points");
    expect(speakDelta(0)).toBe("unchanged");
    expect(speakDelta(1.25)).toBe("up 1.25 percentage points");
  });

  it("does not imply false p-value precision below one thousandth", () => {
    expect(formatPValue(0.183973)).toBe("0.184");
    expect(formatPValue(0.0009)).toBe("< 0.001");
  });
});
