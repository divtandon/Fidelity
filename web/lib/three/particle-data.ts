export type CompressionParticleData = {
  source: Float32Array;
  target: Float32Array;
  phase: Float32Array;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCompressionParticleData(count: number, seed = 42): CompressionParticleData {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("Particle count must be a positive integer.");
  }

  const random = seededRandom(seed);
  const source = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const gridSize = Math.ceil(Math.cbrt(count));
  const gridSpacing = 1.55 / Math.max(1, gridSize - 1);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const azimuth = random() * Math.PI * 2;
    const vertical = random() * 2 - 1;
    const radial = Math.pow(random(), 0.48);
    const horizontalRadius = Math.sqrt(1 - vertical * vertical);

    source[offset] = -2.65 + Math.cos(azimuth) * horizontalRadius * radial * 1.9;
    source[offset + 1] = vertical * radial * 1.72;
    source[offset + 2] = Math.sin(azimuth) * horizontalRadius * radial * 1.65;

    const xIndex = index % gridSize;
    const yIndex = Math.floor(index / gridSize) % gridSize;
    const zIndex = Math.floor(index / (gridSize * gridSize));
    const center = (gridSize - 1) / 2;
    const jitter = (random() - 0.5) * 0.026;

    target[offset] = 3.2 + (xIndex - center) * gridSpacing + jitter;
    target[offset + 1] = (yIndex - center) * gridSpacing + jitter;
    target[offset + 2] = (zIndex - center) * gridSpacing + jitter;
    phase[index] = random();
  }

  return { source, target, phase };
}
