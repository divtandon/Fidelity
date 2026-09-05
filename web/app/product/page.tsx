import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Braces, Database, FileCheck2, Gauge, ScanSearch } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Product",
  description: "Follow Fidelity from an FP32 reference checkpoint to an inspectable model-validation report.",
};

const stages = [
  {
    number: "01",
    icon: Database,
    eyebrow: "Reference",
    title: "Load the reference",
    copy: "Establish the FP32 baseline on a recorded model, dataset, and evaluation set. The reference is measured—not assumed.",
    output: "FP32 predictions + probabilities",
  },
  {
    number: "02",
    icon: Boxes,
    eyebrow: "Transform",
    title: "Quantize the candidate",
    copy: "Calibrate representative examples and create a genuine INT8 artifact with PyTorch post-training quantization.",
    output: "Converted INT8 model",
  },
  {
    number: "03",
    icon: ScanSearch,
    eyebrow: "Compare",
    title: "Evaluate paired behavior",
    copy: "Run the same examples through both models. Compare overall correctness, every class, and the full prediction distributions.",
    output: "Paired statistical evidence",
  },
  {
    number: "04",
    icon: FileCheck2,
    eyebrow: "Decide",
    title: "Publish the evidence",
    copy: "Serialize measurements, the configured policy, and its conclusion into a strict, versioned report that can be audited later.",
    output: "Validated report.json",
  },
];

export default function ProductPage() {
  return (
    <main id="main-content" className="subpage-main">
      <section className="subpage-hero product-hero">
        <div className="product-hero__glow product-hero__glow--blue" aria-hidden="true" />
        <div className="product-hero__glow product-hero__glow--orange" aria-hidden="true" />
        <div className="page-shell subpage-hero__grid">
          <Reveal className="subpage-hero__copy">
            <p className="eyebrow"><Gauge size={14} /> Product · one reproducible run</p>
            <h1>From checkpoint<br />to <em>evidence.</em></h1>
            <p>
              Fidelity quantizes a reference model, evaluates both versions on the same data, and turns
              the result into an inspectable validation report.
            </p>
            <div className="hero__actions">
              <Link className="button button--primary" href="/runs/demo">Open the demo report <ArrowRight size={17} /></Link>
              <a className="button button--quiet" href="#workflow">Follow the workflow</a>
            </div>
          </Reveal>

          <div className="product-instrument" aria-hidden="true">
            <div className="product-instrument__source"><span>FP32</span><i /><i /><i /></div>
            <div className="product-instrument__beam"><i /><i /><i /><i /><i /></div>
            <div className="product-instrument__aperture"><i /><i /><i /></div>
            <div className="product-instrument__target">
              {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
            </div>
            <span className="product-instrument__label product-instrument__label--a">reference weights</span>
            <span className="product-instrument__label product-instrument__label--b">calibration</span>
            <span className="product-instrument__label product-instrument__label--c">quantized artifact</span>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="page-shell workflow-layout">
          <aside className="workflow-aside">
            <p className="eyebrow"><Braces size={14} /> The pipeline</p>
            <h2>Four stages.<br />One chain of custody.</h2>
            <p>Each step preserves the context needed to understand what was measured and why the policy reached its verdict.</p>
          </aside>

          <div className="workflow-steps">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <Reveal className="workflow-step" delay={index * 0.05} key={stage.number}>
                  <div className="workflow-step__top">
                    <span>{stage.number}</span><Icon size={22} strokeWidth={1.6} />
                  </div>
                  <p className="workflow-step__eyebrow">{stage.eyebrow}</p>
                  <h3>{stage.title}</h3>
                  <p className="workflow-step__copy">{stage.copy}</p>
                  <div className="workflow-step__output"><span>Output</span><strong>{stage.output}</strong></div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="scope-section">
        <div className="page-shell scope-card">
          <div className="scope-card__title">
            <p className="eyebrow">Reference implementation</p>
            <h2>Intentionally narrow.<br />End-to-end real.</h2>
          </div>
          <dl className="scope-facts">
            <div><dt>Architecture</dt><dd>ResNet-18</dd></div>
            <div><dt>Dataset</dt><dd>CIFAR-10</dd></div>
            <div><dt>Transformation</dt><dd>Static INT8 PTQ</dd></div>
            <div><dt>Engine</dt><dd>PyTorch FX</dd></div>
          </dl>
          <p className="scope-card__note">
            The core validation functions accept observed classifier outputs. The included quantization
            adapter is the supported reference path—not a claim of universal model compatibility.
          </p>
        </div>
      </section>

      <section className="report-anatomy">
        <div className="page-shell">
          <div className="section-heading-row">
            <div><p className="eyebrow"><FileCheck2 size={14} /> The report</p><h2>Evidence that travels with the model.</h2></div>
            <p>A strict boundary separates computation from presentation. The UI renders the backend verdict; it never invents one from chart colors.</p>
          </div>
          <div className="anatomy-grid">
            <article className="anatomy-card anatomy-card--wide">
              <span>01 · Measurements</span><h3>Observed, paired, internally checked.</h3>
              <p>Counts reconcile with aggregate and class accuracies. Probability rows match the evaluated sample count.</p>
              <div className="mini-schema"><code>accuracy_delta_pp</code><code>per_class[]</code><code>confidence_drift</code></div>
            </article>
            <article className="anatomy-card anatomy-card--blue">
              <span>02 · Decision</span><h3>Backend-owned policy.</h3><p>Thresholds and reasons are serialized beside the status.</p>
            </article>
            <article className="anatomy-card anatomy-card--orange">
              <span>03 · Reproducibility</span><h3>Versioned contract.</h3><p>Strict loading rejects stale shape, bad arithmetic, and non-finite values.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="next-step-section">
        <div className="page-shell next-step-card">
          <span className="next-step-card__number">01 / 02</span>
          <div><p className="eyebrow eyebrow--light">Next: inspect the evidence</p><h2>The workflow ends where the review begins.</h2></div>
          <Link className="button button--paper" href="/runs/demo">Explore a validation <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  );
}
