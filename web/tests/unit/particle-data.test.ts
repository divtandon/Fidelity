import { describe, expect, it } from "vitest";

import { createCompressionParticleData } from "@/lib/three/particle-data";

describe("compression particle data", () => {
  it("generates repeatable source, target, and phase buffers", () => {
    const first = createCompressionParticleData(27, 1042);
    const second = createCompressionParticleData(27, 1042);

    expect(first.source).toHaveLength(81);
    expect(first.target).toHaveLength(81);
    expect(first.phase).toHaveLength(27);
    expect([...first.source]).toEqual([...second.source]);
    expect([...first.target]).toEqual([...second.target]);
    expect([...first.phase]).toEqual([...second.phase]);
  });

  it("changes the scene deterministically when its seed changes", () => {
    const first = createCompressionParticleData(8, 1);
    const second = createCompressionParticleData(8, 2);

    expect([...first.source]).not.toEqual([...second.source]);
    expect([...first.phase].every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid particle count of %s", (count) => {
    expect(() => createCompressionParticleData(count)).toThrow(RangeError);
  });
});
