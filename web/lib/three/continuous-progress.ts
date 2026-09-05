export const COMPRESSION_CYCLE_MS = 14_000;
export const COMPRESSION_PROGRESS_MIN = 0.18;
export const COMPRESSION_PROGRESS_MAX = 0.82;

export function getContinuousCompressionProgress(elapsedMs: number) {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const phase = (safeElapsed % COMPRESSION_CYCLE_MS) / COMPRESSION_CYCLE_MS;
  const wave = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
  const easedWave = wave * wave * (3 - 2 * wave);

  return COMPRESSION_PROGRESS_MIN
    + (COMPRESSION_PROGRESS_MAX - COMPRESSION_PROGRESS_MIN) * easedWave;
}

export function getCompressionStageIndex(progress: number, stageCount: number) {
  if (!Number.isInteger(stageCount) || stageCount < 1) {
    throw new RangeError("Stage count must be a positive integer.");
  }

  const normalized = Math.min(
    1,
    Math.max(
      0,
      (progress - COMPRESSION_PROGRESS_MIN)
        / (COMPRESSION_PROGRESS_MAX - COMPRESSION_PROGRESS_MIN),
    ),
  );

  return Math.min(stageCount - 1, Math.floor(normalized * stageCount));
}
