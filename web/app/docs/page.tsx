import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Braces, CheckCircle2, CircleAlert, Code2, FileJson2, GitBranch, Layers3 } from "lucide-react";

import { CodeBlock } from "@/components/docs/code-block";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Run Fidelity locally, inspect its architecture, and understand the versioned report boundary.",
};

const webStart = `cd web
npm install
npm run dev`;

const testCommands = `python -m pytest tests/python -q
cd web
npm run lint
npx tsc --noEmit
npm run build`;

const reportExample = `{
  "schema_version": "1.0.0",
  "run_id": "<caller-supplied id>",
  "reference": { "precision": "FP32", "top1_accuracy": 0.0 },
  "candidate": { "precision": "INT8", "top1_accuracy": 0.0 },
  "accuracy_delta_pp": 0.0,
  "significance": { "test": "wilcoxon_signed_rank" },
  "confidence_drift": { "metric": "kl_divergence" },
  "per_class": [],
  "verdict": { "status": "ready | review | blocked" }
}`;

const architecture = [
  { name: "Model inputs", detail: "Trained checkpoint + calibration and evaluation data", icon: Layers3 },
  { name: "Quantization", detail: "Real PyTorch FX prepare, calibrate, and convert", icon: GitBranch },
  { name: "Validation", detail: "Pure-Python paired metrics and policy", icon: Braces },
  { name: "Report JSON", detail: "Strict versioned contract with consistency checks", icon: FileJson2 },
  { name: "Web interface", detail: "Zod boundary, accessible evidence, no verdict logic", icon: Code2 },
];

export default function DocsPage() {
  return (
    <main id="main-content" className="subpage-main docs-page">
      <section className="subpage-hero docs-hero">
        <div className="docs-grid" aria-hidden="true" />
        <div className="page-shell docs-hero__layout">
          <Reveal className="subpage-hero__copy">
            <p className="eyebrow"><Code2 size={14} /> Docs · open source by default</p>
            <h1>Reproduce the result.<br />Inspect the <em>contract.</em></h1>
            <p>
              The measurement path and presentation layer are deliberately separate. Every boundary is
              small enough to read, test, and replace.
            </p>
          </Reveal>
          <Reveal className="docs-trust-boundary" delay={0.1}>
            <span>Trust boundary</span>
            <div><strong>Python</strong><p>computes evidence</p></div>
            <i aria-hidden="true"><ArrowRight size={18} /></i>
            <div><strong>TypeScript</strong><p>validates + renders</p></div>
            <small>The browser never derives a production verdict from display thresholds.</small>
          </Reveal>
        </div>
      </section>

      <section className="docs-content">
        <div className="page-shell docs-layout">
          <aside className="docs-sidebar">
            <p>Documentation</p>
            <nav aria-label="Documentation sections">
              <a href="#start">Start</a><a href="#architecture">Architecture</a>
              <a href="#report-contract">Report contract</a><a href="#integrity">Integrity checks</a>
              <a href="#reproducibility">Reproducibility</a><a href="#limitations">Limitations</a>
            </nav>
            <a className="docs-sidebar__source" href="https://github.com/divtandon/Fidelity" target="_blank" rel="noreferrer">View source <ArrowRight size={13} /></a>
          </aside>

          <div className="docs-articles">
            <section className="docs-section" id="start">
              <p className="docs-kicker">01 · Start</p>
              <h2>Run the interface locally.</h2>
              <p className="docs-lead">No account, API key, paid dataset, or hosted service is required for the website. The repository uses npm’s lockfile for a repeatable frontend install.</p>
              <CodeBlock code={webStart} label="PowerShell or terminal" />
              <div className="docs-callout docs-callout--info"><CircleAlert size={18} /><p>The current repository includes the computation engine and a clearly labeled interface fixture. Real accuracy values appear only after you provide a trained model and evaluation data.</p></div>
            </section>

            <section className="docs-section" id="architecture">
              <p className="docs-kicker">02 · Architecture</p>
              <h2>One directional evidence path.</h2>
              <p className="docs-lead">Raw model outputs move forward through calculation, serialization, validation, and display. UI state never flows backward into the evidence.</p>
              <ol className="architecture-flow">
                {architecture.map((item, index) => {
                  const Icon = item.icon;
                  return <li key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={20} strokeWidth={1.5} /><div><strong>{item.name}</strong><p>{item.detail}</p></div>{index < architecture.length - 1 ? <i aria-hidden="true"><ArrowRight size={14} /></i> : null}</li>;
                })}
              </ol>
              <div className="architecture-notes">
                <article><span>validation/</span><h3>Dependency-free core</h3><p>Metrics, paired testing, policy, and strict serialization use the Python standard library.</p></article>
                <article><span>quantize/</span><h3>Optional model runtime</h3><p>PyTorch is imported only when real quantization or evaluation is requested.</p></article>
                <article><span>web/</span><h3>Independent renderer</h3><p>Next.js serves the narrative, procedural WebGL scene, and accessible report views.</p></article>
              </div>
            </section>

            <section className="docs-section" id="report-contract">
              <p className="docs-kicker">03 · Report contract</p>
              <h2>The report is the handshake.</h2>
              <p className="docs-lead">The frontend does not scrape logs or import Python internals. It receives a versioned object whose measurements, statistical result, and backend verdict travel together.</p>
              <CodeBlock code={reportExample} label="Shape overview — placeholders, not results" />
              <div className="field-grid">
                <article><code>reference / candidate</code><p>Precision label, top-1 accuracy, and exact correct count.</p></article>
                <article><code>significance</code><p>Test name, method, pair counts, statistic, p-value, alpha, and interpretation.</p></article>
                <article><code>confidence_drift</code><p>KL direction, mean value, nats, epsilon, and evaluated sample count.</p></article>
                <article><code>verdict</code><p>Backend-owned status, every triggered reason, and the complete policy version.</p></article>
              </div>
            </section>

            <section className="docs-section" id="integrity">
              <p className="docs-kicker">04 · Integrity checks</p>
              <h2>Shape validation is only the beginning.</h2>
              <p className="docs-lead">The Python loader checks relationships across the object so a hand-edited value cannot silently detach a conclusion from its underlying counts.</p>
              <ul className="integrity-list">
                {[
                  "Aggregate accuracies must reconcile with integer correct counts and sample count.",
                  "Class rows must be unique, ordered, internally consistent, and sum to aggregate totals.",
                  "The significance interpretation must agree with validity, p-value, alpha, and delta direction.",
                  "The verdict is recomputed from canonical evidence and the serialized policy.",
                  "Duplicate JSON keys, unsupported fields, NaN, and Infinity are rejected.",
                  "Writes use a temporary sibling followed by an atomic replace.",
                ].map((item) => <li key={item}><CheckCircle2 size={17} /><span>{item}</span></li>)}
              </ul>
            </section>

            <section className="docs-section" id="reproducibility">
              <p className="docs-kicker">05 · Reproducibility</p>
              <h2>Checks that run without a GPU.</h2>
              <p className="docs-lead">The statistical test suite is fast and dependency-light. Frontend quality gates cover lint, strict TypeScript, unit behavior, browser routes, accessibility, and production compilation.</p>
              <CodeBlock code={testCommands} label="Quality gates" />
              <div className="repro-stats">
                <div><strong>0</strong><span>API keys</span></div><div><strong>0</strong><span>paid services</span></div><div><strong>1</strong><span>typed boundary</span></div>
              </div>
            </section>

            <section className="docs-section" id="limitations">
              <p className="docs-kicker">06 · Limitations</p>
              <h2>Know what this build does not claim.</h2>
              <div className="docs-limit-grid">
                <article><span>Model scope</span><p>The reference PTQ adapter is for compatible CPU classifiers; broader frameworks and accelerators need dedicated adapters.</p></article>
                <article><span>Demo fixture</span><p>Values in the public demo are illustrative UI data and cannot be used to judge any real model.</p></article>
                <article><span>Statistical scope</span><p>No-significance is not equivalence, and no single generic policy can certify a production model.</p></article>
                <article><span>Hardware scope</span><p>Latency and memory benefits must be measured on the actual deployment target; Fidelity does not infer them.</p></article>
              </div>
              <Link className="button button--primary" href="/runs/demo">Inspect the demo boundary <ArrowRight size={17} /></Link>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
