import { describe, expect, it } from "vitest";

import {
  COMPRESSION_CYCLE_MS,
  COMPRESSION_PROGRESS_MAX,
  COMPRESSION_PROGRESS_MIN,
  getCompressionStageIndex,
  getContinuousCompressionProgress,
} from "@/lib/three/continuous-progress";

describe("continuous compression progress", () => {
  it("forms a smooth bounded loop", () => {
    const samples = Array.from(
      { length: 1_001 },
      (_, index) => getContinuousCompressionProgress(index * COMPRESSION_CYCLE_MS / 1_000),
    );

    expect(Math.min(...samples)).toBeCloseTo(COMPRESSION_PROGRESS_MIN, 8);
    expect(Math.max(...samples)).toBeCloseTo(COMPRESSION_PROGRESS_MAX, 8);
    expect(samples.every((value) => Number.isFinite(value))).toBe(true);
    expect(samples.every((value) => value >= COMPRESSION_PROGRESS_MIN && value <= COMPRESSION_PROGRESS_MAX)).toBe(true);
    expect(getContinuousCompressionProgress(0)).toBeCloseTo(
      getContinuousCompressionProgress(COMPRESSION_CYCLE_MS),
      8,
    );
  });

  it("has no visible discontinuity at the loop boundary", () => {
    const beforeBoundary = getContinuousCompressionProgress(COMPRESSION_CYCLE_MS - 1);
    const afterBoundary = getContinuousCompressionProgress(COMPRESSION_CYCLE_MS + 1);

    expect(Math.abs(beforeBoundary - afterBoundary)).toBeLessThan(0.000_001);
  });

  it("maps every progress sample to a valid stage", () => {
    for (let index = 0; index <= 1_000; index += 1) {
      const progress = getContinuousCompressionProgress(index * COMPRESSION_CYCLE_MS / 1_000);
      expect(getCompressionStageIndex(progress, 5)).toBeGreaterThanOrEqual(0);
      expect(getCompressionStageIndex(progress, 5)).toBeLessThan(5);
    }
  });

  it("rejects invalid stage counts", () => {
    expect(() => getCompressionStageIndex(0.5, 0)).toThrow(RangeError);
  });
});
