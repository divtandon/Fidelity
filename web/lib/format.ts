export function formatPercent(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDelta(value: number, digits = 2) {
  const magnitude = Math.abs(value).toFixed(digits);
  if (value === 0) return `0.${"0".repeat(digits)} pp`;
  return `${value > 0 ? "+" : "−"}${magnitude} pp`;
}

export function speakDelta(value: number) {
  if (value === 0) return "unchanged";
  return `${value > 0 ? "up" : "down"} ${Math.abs(value).toFixed(2)} percentage points`;
}

export function formatPValue(value: number) {
  if (value < 0.001) return "< 0.001";
  return value.toFixed(3);
}
