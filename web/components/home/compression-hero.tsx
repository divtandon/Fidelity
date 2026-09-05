import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen } from "lucide-react";

const metrics = [
  { label: "FP32", value: "94.82%", tone: "blue" },
  { label: "INT8", value: "94.47%", tone: "orange" },
  { label: "Delta", value: "−0.35 pp", tone: "neutral" },
  { label: "p-value", value: "0.184", tone: "neutral" },
];

export function CompressionHero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__visual" aria-hidden="true">
        <Image src="/quantization-poster.png" alt="" fill priority quality={92} sizes="100vw" />
        <div className="hero__wash" />
      </div>
      <div className="hero-annotation hero-annotation--reference" aria-hidden="true"><i /><span>FP32</span><small>Reference model<br />high precision</small></div>
      <div className="hero-annotation hero-annotation--aperture" aria-hidden="true"><span>Post-training<br />quantization</span><i /></div>
      <div className="hero-annotation hero-annotation--candidate" aria-hidden="true"><i /><span>INT8</span><small>Candidate model<br />smaller representation</small></div>

      <div className="page-shell hero__content">
        <div className="hero__copy">
          <p className="eyebrow">FP32 <span aria-hidden="true">→</span> INT8 · Model validation</p>
          <h1 id="hero-title">Prove the model<br />after the <em>transformation.</em></h1>
          <p className="hero__lead">
            Fidelity compares a compressed model with its full-precision reference—across accuracy,
            class behavior, prediction drift, and statistical significance.
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" href="/runs/demo">Explore a validation <ArrowRight size={17} /></Link>
            <Link className="button button--quiet" href="/methods"><BookOpen size={16} /> Read the method</Link>
          </div>
        </div>

        <div className="proof-cluster">
          <span className="demo-label"><i /> Illustrative UI fixture</span>
          <dl className="proof-strip">
            {metrics.map((metric) => (
              <div className={`proof-strip__metric proof-strip__metric--${metric.tone}`} key={metric.label}>
                <dt>{metric.label}</dt><dd>{metric.value}</dd><span aria-hidden="true"><i /></span>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <a className="scroll-cue" href="#why-fidelity"><span>Scroll to inspect</span><i><ArrowDown size={13} /></i></a>
    </section>
  );
}
