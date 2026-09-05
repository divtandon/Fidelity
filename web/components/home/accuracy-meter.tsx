import styles from "./accuracy-meter.module.css";

type AccuracyMeterProps = {
  correctCount: number;
  fillPercent: number;
  precision: string;
  sampleCount: number;
  tone: "blue" | "orange";
  value: string;
};

export function AccuracyMeter({
  correctCount,
  fillPercent,
  precision,
  sampleCount,
  tone,
  value,
}: AccuracyMeterProps) {
  const meterValue = Number(Math.min(100, Math.max(0, fillPercent)).toFixed(2));
  const countText = `${correctCount.toLocaleString()} / ${sampleCount.toLocaleString()} correct`;

  return (
    <div
      className={`proof-strip__metric proof-strip__metric--${tone} ${styles.accuracyMetric} ${styles[tone]}`}
    >
      <dt>{precision}</dt>
      <dd className={styles.meterReading}>
        <span
          aria-label={`${precision} top-1 accuracy`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={meterValue}
          aria-valuetext={`${value}; ${correctCount.toLocaleString()} correct out of ${sampleCount.toLocaleString()} held-out examples`}
          className={styles.accuracyMeter}
          role="meter"
          tabIndex={0}
        >
          <span aria-hidden="true" className={styles.value}>{value}</span>
          <span aria-hidden="true" className={styles.meterBar}>
            <i style={{ width: `${meterValue}%` }} />
          </span>
          <small aria-hidden="true" className={styles.disclosure} data-meter-disclosure>
            {countText}
          </small>
        </span>
      </dd>
    </div>
  );
}
