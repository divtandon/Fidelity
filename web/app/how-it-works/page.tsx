import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  FileCheck2,
  Gauge,
  GitCompareArrows,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { EvidenceExplorer, type EvidenceSummary } from "./evidence-explorer";
import styles from "./how-it-works.module.css";

import { FEATURED_RUN_HREF, FEATURED_RUN_ID } from "@/lib/featured-run";
import { formatDelta, formatPValue, formatPercent } from "@/lib/format";
import { getVerifiedReport } from "@/lib/verified-reports";

export const metadata: Metadata = {
  title: "How it works",
  description: "A plain-language guide to Fidelity's real CIFAR-10 run, quantization pipeline, evidence report, and limitations.",
};

const pipelineSteps = [
  {
    number: "01",
    icon: Database,
    title: "Establish the reference",
    copy: "Train or resume the adapted ResNet-18 and save the FP32 checkpoint with its configuration and lineage.",
    output: "FP32 checkpoint",
  },
  {
    number: "02",
    icon: ScanSearch,
    title: "Observe calibration data",
    copy: "Prepare FX observers and run a seed-selected subset of training images through the model—never the held-out test set.",
    output: "Observed ranges",
  },
  {
    number: "03",
    icon: Boxes,
    title: "Convert and reload INT8",
    copy: "Create a real static INT8 model with the oneDNN backend, export it as TorchScript, and reload that artifact before evaluation.",
    output: "Reloaded INT8 artifact",
  },
  {
    number: "04",
    icon: GitCompareArrows,
    title: "Evaluate the same examples",
    copy: "Run FP32 and INT8 independently over the same ordered test set, collecting exact counts, probabilities, labels, and paired correctness.",
    output: "Paired observations",
  },
  {
    number: "05",
    icon: FileCheck2,
    title: "Validate and publish",
    copy: "Compute the evidence, apply the configured policy in Python, and write a strict report whose arithmetic is checked again before display.",
    output: "Versioned report.json",
  },
] as const;

const boundaries = [
  {
    title: "Not an equivalence test",
    copy: "A non-significant paired result says this test did not detect a difference. Equivalence needs a chosen margin and a study designed for that claim.",
  },
  {
    title: "Not a safety certificate",
    copy: "The report does not establish fairness, robustness, privacy, security, or fitness for a production use case.",
  },
  {
    title: "Not a hardware benchmark",
    copy: "INT8 changes representation, but latency, memory, energy, and artifact-size benefits must be measured on the real deployment target.",
  },
  {
    title: "Not universal model support",
    copy: "The included reference adapter targets this CIFAR-10 classifier and compatible CPU models that PyTorch FX can trace. Other stacks need their own adapters.",
  },
] as const;

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function HowItWorksPage() {
  const report = getVerifiedReport(FEATURED_RUN_ID);
  if (!report) throw new Error(`Featured run ${FEATURED_RUN_ID} is not registered.`);

  const largestClass = [...report.per_class].sort(
    (left, right) => Math.abs(right.delta_pp) - Math.abs(left.delta_pp),
  )[0];
  const summary = {
    referenceAccuracy: formatPercent(report.reference.top1_accuracy),
    candidateAccuracy: formatPercent(report.candidate.top1_accuracy),
    accuracyDelta: formatDelta(report.accuracy_delta_pp),
    largestClassName: titleCase(largestClass.class_name),
    largestClassDelta: formatDelta(largestClass.delta_pp),
    drift: report.confidence_drift.value.toFixed(6),
    pValue: formatPValue(report.significance.p_value),
    nonzeroPairs: report.significance.n_nonzero.toLocaleString(),
    pairCount: report.significance.n_pairs.toLocaleString(),
    alpha: report.significance.alpha.toFixed(2),
    verdict: titleCase(report.verdict.status),
    policyName: `${report.verdict.policy.name} v${report.verdict.policy.version}`,
  } satisfies EvidenceSummary;

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.hero} aria-labelledby="how-title">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.orbBlue} aria-hidden="true" />
        <div className={styles.orbOrange} aria-hidden="true" />
        <div className={`${styles.shell} ${styles.heroLayout}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><Sparkles aria-hidden="true" size={15} /> A plain-language field guide</p>
            <h1 id="how-title">From a model change<br />{" "}to an <em>evidence trail.</em></h1>
            <p className={styles.heroLead}>
              Fidelity asks a practical question: after converting a full-precision model to INT8,
              what stayed the same, what moved, and what does the evidence actually support?
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href={FEATURED_RUN_HREF}>Open the real report <ArrowRight aria-hidden="true" size={17} /></Link>
              <a className={styles.secondaryAction} href="#pipeline">Follow the pipeline <ArrowDown aria-hidden="true" size={16} /></a>
            </div>
          </div>

          <div className={styles.heroInstrument} role="img" aria-label={`FP32 reference at ${summary.referenceAccuracy}, transformed into an INT8 candidate at ${summary.candidateAccuracy}, then compared on the same ${report.sample_count.toLocaleString()} examples`}>
            <div className={styles.modelNode}>
              <span>Reference</span><strong>FP32</strong><small>{summary.referenceAccuracy} top-1</small>
            </div>
            <div className={styles.transformNode} aria-hidden="true"><i /><i /><i /><span>quantize</span></div>
            <div className={`${styles.modelNode} ${styles.modelNodeCandidate}`}>
              <span>Candidate</span><strong>INT8</strong><small>{summary.candidateAccuracy} top-1</small>
            </div>
            <div className={styles.pairBadge}><GitCompareArrows aria-hidden="true" size={17} /><span>Same {report.sample_count.toLocaleString()} held-out examples</span></div>
          </div>
        </div>
      </section>

      <nav className={styles.sectionNav} aria-label="How it works sections">
        <div className={styles.shell}>
          <a href="#real-data"><span>01</span> Real data</a>
          <a href="#pipeline"><span>02</span> Pipeline</a>
          <a href="#read-results"><span>03</span> Read results</a>
          <a href="#limits"><span>04</span> Boundaries</a>
        </div>
      </nav>

      <section className={styles.section} id="real-data">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>01 · Start with the real run</p>
              <h2>What data and models<br />{" "}are we comparing?</h2>
            </div>
            <p>
              This repository includes a computed portfolio run—not invented dashboard values. Its report and
              reproducibility metadata are bundled with the application, and the report is validated before rendering.
            </p>
          </div>

          <div className={styles.dataGrid}>
            <article className={styles.dataCard}>
              <span className={styles.cardIcon}><Database aria-hidden="true" size={22} /></span>
              <p>Dataset</p>
              <h3>CIFAR-10</h3>
              <ul>
                <li>60,000 color images at 32 × 32 pixels</li>
                <li>10 labeled object classes</li>
                <li>50,000 train · 10,000 held-out test</li>
              </ul>
            </article>
            <article className={styles.dataCard}>
              <span className={styles.cardIcon}><Gauge aria-hidden="true" size={22} /></span>
              <p>Reference</p>
              <h3>Adapted ResNet-18</h3>
              <ul>
                <li>Native 32 × 32 input stem</li>
                <li>Trained for 20 epochs with seed 2026</li>
                <li>FP32 checkpoint evaluated on CPU</li>
              </ul>
            </article>
            <article className={`${styles.dataCard} ${styles.dataCardAccent}`}>
              <span className={styles.cardIcon}><Boxes aria-hidden="true" size={22} /></span>
              <p>Candidate</p>
              <h3>Static INT8</h3>
              <ul>
                <li>PyTorch FX post-training quantization</li>
                <li>2,048 training examples for calibration</li>
                <li>oneDNN TorchScript artifact reloaded for evaluation</li>
              </ul>
            </article>
          </div>

          <div className={styles.pairingCallout}>
            <div className={styles.pairingMark}><GitCompareArrows aria-hidden="true" size={24} /></div>
            <div><span>Why “paired” matters</span><h3>Both models answer the same 10,000 questions.</h3></div>
            <p>
              FP32 and INT8 consume the held-out test set in the same recorded order. Fidelity keeps each
              example&apos;s two outcomes together, so it can see which predictions changed—not only compare two totals.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.pipelineSection}`} id="pipeline">
        <div className={styles.shell}>
          <div className={`${styles.sectionHeading} ${styles.sectionHeadingLight}`}>
            <div>
              <p className={styles.kicker}>02 · Follow the evidence path</p>
              <h2>What does the<br />{" "}pipeline do?</h2>
            </div>
            <p>
              Each step produces something the next step can inspect. The final interface never reaches backward
              and invents a verdict from colors or chart positions.
            </p>
          </div>

          <ol className={styles.pipelineList}>
            {pipelineSteps.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.number}>
                  <div className={styles.stepTop}><span>{step.number}</span><Icon aria-hidden="true" size={21} strokeWidth={1.6} /></div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                  <div className={styles.stepOutput}><span>Output</span><strong>{step.output}</strong></div>
                </li>
              );
            })}
          </ol>

          <div className={styles.trustLine}>
            <CheckCircle2 aria-hidden="true" size={20} />
            <p><strong>One-way trust boundary:</strong> Python computes and serializes the evidence; TypeScript validates the contract and presents it.</p>
            <Link href="/docs">Inspect the architecture <ArrowRight aria-hidden="true" size={15} /></Link>
          </div>
        </div>
      </section>

      <section className={styles.section} id="read-results">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>03 · Read one layer at a time</p>
              <h2>What does each result<br />{" "}actually answer?</h2>
            </div>
            <p>
              No single metric tells the whole story. Use the five evidence layers below to move from the broad
              accuracy result to the policy decision—without overstating any one number.
            </p>
          </div>

          <EvidenceExplorer summary={summary} />
          <div className={styles.policyGuide}>
            <div>
              <span>Policy language</span>
              <p>Statuses describe whether this report crossed its serialized guardrails. Every triggered reason travels with the result.</p>
            </div>
            <dl>
              <div><dt><i aria-hidden="true" className={styles.readyDot} /> Ready</dt><dd>No configured guardrail fired.</dd></div>
              <div><dt><i aria-hidden="true" className={styles.reviewDot} /> Review</dt><dd>A review condition needs inspection.</dd></div>
              <div><dt><i aria-hidden="true" className={styles.blockedDot} /> Blocked</dt><dd>A block condition fired.</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.limitsSection}`} id="limits">
        <div className={styles.shell}>
          <div className={styles.limitsHeading}>
            <p className={styles.kicker}><CircleAlert aria-hidden="true" size={15} /> 04 · Read the boundary too</p>
            <h2>What Fidelity<br />{" "}<em>does not claim.</em></h2>
            <p>Good evidence is useful partly because its limits are visible.</p>
          </div>
          <div className={styles.boundaryGrid}>
            {boundaries.map((boundary, index) => (
              <article key={boundary.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{boundary.title}</h3>
                <p>{boundary.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.closingSection}>
        <div className={`${styles.shell} ${styles.closingCard}`}>
          <div><p className={styles.kicker}>Now inspect the evidence</p><h2>See the numbers<br />{" "}in their full context.</h2></div>
          <div className={styles.closingActions}>
            <Link className={styles.lightAction} href={FEATURED_RUN_HREF}>Open verified report <ArrowRight aria-hidden="true" size={17} /></Link>
            <Link className={styles.outlineAction} href="/methods">Read the statistical method</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
