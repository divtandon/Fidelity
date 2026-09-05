import type { ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  FileJson2,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

import styles from "./pipeline-board.module.css";

type PipelineStepProps = {
  number: string;
  label: string;
  title: string;
  description: string;
  output: string;
  icon: LucideIcon;
  tone: "blue" | "violet" | "orange" | "ink";
  visual: ReactNode;
  last?: boolean;
};

function PipelineStep({
  number,
  label,
  title,
  description,
  output,
  icon: Icon,
  tone,
  visual,
  last = false,
}: PipelineStepProps) {
  return (
    <li className={`${styles.step} ${styles[tone]}`}>
      <article aria-labelledby={`pipeline-step-${number}`}>
        <div className={styles.stepTop}>
          <span className={styles.stepNumber}>{number}</span>
          <span className={styles.stepIcon} aria-hidden="true"><Icon size={17} strokeWidth={1.7} /></span>
        </div>
        <p className={styles.stepLabel}>{label}</p>
        <h3 id={`pipeline-step-${number}`}>{title}</h3>
        <p className={styles.stepDescription}>{description}</p>
        <div className={styles.stageVisual} aria-hidden="true">{visual}</div>
        <p className={styles.output}><span>Output</span><strong>{output}</strong></p>
      </article>
      {last ? null : <span className={styles.connector} aria-hidden="true"><ArrowRight size={14} /></span>}
    </li>
  );
}

function CheckpointVisual() {
  return (
    <div className={styles.checkpointVisual}>
      <span>FP32</span>
      <div><strong>ResNet-18</strong><code>checkpoint.pt</code></div>
      <i />
    </div>
  );
}

function CalibrationVisual() {
  return (
    <div className={styles.calibrationVisual}>
      <div className={styles.imageTiles}>
        {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
      </div>
      <p><strong>2,048</strong><span>representative images</span></p>
    </div>
  );
}

function ArtifactVisual() {
  return (
    <div className={styles.artifactVisual}>
      <div className={styles.voxels}>{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
      <p><strong>INT8</strong><code>int8-fx-static.torchscript.pt</code></p>
    </div>
  );
}

function ReportVisual() {
  return (
    <div className={styles.reportVisual}>
      <div><span>FP32</span><strong>92.39%</strong></div>
      <div><span>INT8</span><strong>92.38%</strong></div>
      <p><span>paired p</span><strong>1.000</strong></p>
    </div>
  );
}

export function PipelineBoard() {
  return (
    <section className={styles.board} aria-labelledby="pipeline-board-title">
      <header className={styles.boardHeader}>
        <div>
          <p>Validation path</p>
          <h2 id="pipeline-board-title">One traceable run, end to end.</h2>
        </div>
        <span className={styles.mode}><i aria-hidden="true" /> Static INT8 PTQ</span>
      </header>

      <ol className={styles.flow}>
        <PipelineStep
          number="01"
          label="Reference input"
          title="FP32 checkpoint"
          description="Freeze the trained weights and establish the reference model."
          output="Reference logits"
          icon={Database}
          tone="blue"
          visual={<CheckpointVisual />}
        />
        <PipelineStep
          number="02"
          label="Observe ranges"
          title="CIFAR-10 calibration"
          description="Use representative training examples to measure activation ranges."
          output="Scale + zero-point"
          icon={ScanSearch}
          tone="violet"
          visual={<CalibrationVisual />}
        />
        <PipelineStep
          number="03"
          label="Convert"
          title="INT8 artifact"
          description="Quantize and export a reloadable candidate for CPU inference."
          output="Reloaded INT8 model"
          icon={Boxes}
          tone="orange"
          visual={<ArtifactVisual />}
        />
        <PipelineStep
          number="04"
          label="Compare the same pairs"
          title="Evidence report"
          description="Evaluate both models together and publish checked statistical evidence."
          output="validation-report.json"
          icon={FileJson2}
          tone="ink"
          visual={<ReportVisual />}
          last
        />
      </ol>

      <footer className={styles.boardFooter}>
        <span><CheckCircle2 size={15} aria-hidden="true" /> Same 10,000 held-out examples</span>
        <span><CheckCircle2 size={15} aria-hidden="true" /> Counts, class drift, confidence drift, and paired test</span>
      </footer>
    </section>
  );
}
