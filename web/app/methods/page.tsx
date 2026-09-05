import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Asterisk, Box, Braces, CircleAlert, Scale, Sigma } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Methods",
  description: "The statistical method, policy, assumptions, and limitations behind Fidelity model validation.",
};

const methodNav = [
  ["01", "Quantization", "#quantization"],
  ["02", "Paired evaluation", "#paired-evaluation"],
  ["03", "Class behavior", "#class-behavior"],
  ["04", "Distribution drift", "#distribution-drift"],
  ["05", "Significance", "#significance"],
  ["06", "Verdict policy", "#verdict-policy"],
] as const;

const thresholds = [
  ["Overall accuracy drop", "0.50 pp", "2.00 pp"],
  ["Mean KL drift", "0.020 nats", "0.100 nats"],
  ["Worst eligible class drop", "2.00 pp", "10.00 pp"],
];

export default function MethodsPage() {
  return (
    <main id="main-content" className="subpage-main methods-page">
      <section className="subpage-hero methods-hero">
        <div className="page-shell methods-hero__layout">
          <Reveal className="subpage-hero__copy">
            <p className="eyebrow"><Sigma size={14} /> Methods · assumptions included</p>
            <h1>The method,<br />without the <em>marketing.</em></h1>
            <p>
              Fidelity compares one reference model and one compressed candidate on the same examples,
              retains paired outcomes, and publishes the limits of the conclusion.
            </p>
          </Reveal>

          <Reveal className="methods-thesis" delay={0.12}>
            <span><Asterisk size={14} /> Statistical principle 01</span>
            <blockquote>
              A result can tell you what the test <em>detected.</em> It cannot tell you more than the
              design measured.
            </blockquote>
            <div className="methods-thesis__axis" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </Reveal>
        </div>
      </section>

      <section className="method-body">
        <div className="page-shell method-layout">
          <aside className="method-index">
            <p>On this page</p>
            <nav aria-label="Method sections">
              {methodNav.map(([number, label, href]) => (
                <a href={href} key={href}><span>{number}</span>{label}</a>
              ))}
            </nav>
          </aside>

          <div className="method-chapters">
            <article className="method-chapter" id="quantization">
              <div className="method-chapter__number"><span>01</span><Box size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Post-training quantization</p>
                <h2>Change the representation, not the training objective.</h2>
                <p className="method-lead">
                  The reference adapter prepares a trained CPU model with PyTorch FX observers, runs real
                  representative calibration batches, and converts the observed graph to static INT8.
                </p>
                <div className="method-note"><strong>What is recorded</strong><span>Quantized backend, calibration batch count, and the installed PyTorch version.</span></div>
              </div>
            </article>

            <article className="method-chapter" id="paired-evaluation">
              <div className="method-chapter__number"><span>02</span><Scale size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Paired evaluation</p>
                <h2>The same evidence enters both sides.</h2>
                <p className="method-lead">
                  Both models see the same labeled sample in the same evaluation set. Pairing preserves which
                  examples changed outcome instead of reducing each model to an unrelated total.
                </p>
                <div className="paired-diagram" role="img" aria-label="One labeled sample is evaluated by both the FP32 reference and INT8 candidate, producing paired outcomes">
                  <div><small>Input</small><strong>xᵢ, yᵢ</strong></div><i aria-hidden="true" />
                  <div className="paired-diagram__split"><span>FP32</span><span>INT8</span></div><i aria-hidden="true" />
                  <div><small>Pair</small><strong>rᵢ, cᵢ</strong></div>
                </div>
              </div>
            </article>

            <article className="method-chapter" id="class-behavior">
              <div className="method-chapter__number"><span>03</span><Braces size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Per-class accuracy</p>
                <h2>One stable average can contain ten different stories.</h2>
                <p className="method-lead">
                  Correct predictions are counted inside each observed ground-truth class. Candidate minus
                  reference accuracy is reported in percentage points, then the largest absolute shifts are surfaced.
                </p>
                <div className="class-bars" aria-hidden="true">
                  {[82, 69, 91, 76, 64].map((value, index) => (
                    <div key={value}><span>Class {index + 1}</span><i style={{ "--reference": `${value}%`, "--candidate": `${value + [2, -5, 1, -8, 4][index]}%` } as React.CSSProperties} /></div>
                  ))}
                </div>
              </div>
            </article>

            <article className="method-chapter" id="distribution-drift">
              <div className="method-chapter__number"><span>04</span><Sigma size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Prediction-distribution drift</p>
                <h2>Winning labels do not show the whole output.</h2>
                <p className="method-lead">
                  Mean KL divergence measures how the candidate’s complete class-probability distribution
                  moves away from the reference distribution. Fidelity reports the direction, smoothing epsilon,
                  unit, and sample count.
                </p>
                <figure className="formula-card">
                  <div>D<sub>KL</sub>(P ∥ Q) = <span>Σ</span> Pᵢ log(Pᵢ / Qᵢ)</div>
                  <figcaption>P = reference · Q = candidate · natural-log unit = nats</figcaption>
                </figure>
                <p className="method-caveat">This is prediction-distribution drift. It is not called calibration error because the current implementation does not compute ECE or a reliability curve.</p>
              </div>
            </article>

            <article className="method-chapter method-chapter--focus" id="significance">
              <div className="method-chapter__number"><span>05</span><Asterisk size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Wilcoxon signed-rank</p>
                <h2>No detected difference is not proof of equivalence.</h2>
                <p className="method-lead">
                  The reference implementation tests paired per-example correctness differences. Zero differences
                  are excluded; exact random-sign enumeration is used where feasible, with the method and pair counts
                  recorded beside the p-value.
                </p>
                <div className="not-equal-callout">
                  <div><span>p ≥ α</span><strong>Test did not detect a difference</strong></div>
                  <b aria-hidden="true">≠</b>
                  <div><span>Equivalence</span><strong>Would require a margin and an equivalence design</strong></div>
                </div>
                <div className="method-warning"><CircleAlert size={20} /><p>Per-example correctness is discrete and heavily tied. Treat this result as one evidence layer; production studies should evaluate whether McNemar or an equivalence test better matches the deployment question.</p></div>
              </div>
            </article>

            <article className="method-chapter" id="verdict-policy">
              <div className="method-chapter__number"><span>06</span><Scale size={22} strokeWidth={1.5} /></div>
              <div className="method-chapter__content">
                <p className="eyebrow">Verdict policy</p>
                <h2>The threshold belongs to the policy, not the paint.</h2>
                <p className="method-lead">
                  Python derives <code>ready</code>, <code>review</code>, or <code>blocked</code>. The frontend
                  consumes that status directly and renders every triggered reason.
                </p>
                <div className="threshold-table-wrap">
                  <table className="threshold-table">
                    <caption>Default fidelity_default policy, version 1.0.0</caption>
                    <thead><tr><th scope="col">Evidence</th><th scope="col">Review</th><th scope="col">Block</th></tr></thead>
                    <tbody>{thresholds.map(([metric, review, block]) => <tr key={metric}><th scope="row">{metric}</th><td>{review}</td><td>{block}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="method-caveat">These defaults are auditable demonstration guardrails, not universal safety thresholds. A deployment owner must set policy for the model, dataset, risk, and operating environment.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="limitations-section">
        <div className="page-shell limitations-layout">
          <div><p className="eyebrow"><CircleAlert size={14} /> Known limitations</p><h2>Honesty is part of the instrument.</h2></div>
          <div className="limitations-list">
            <details open><summary>Scope of model support <span>01</span></summary><p>The included PTQ adapter targets CPU classifiers that can be traced by PyTorch FX. It does not claim to support every architecture or hardware backend.</p></details>
            <details><summary>Test interpretation <span>02</span></summary><p>Statistical power depends on sample size and the observed paired differences. A non-significant p-value is not an equivalence certificate.</p></details>
            <details><summary>Distribution drift <span>03</span></summary><p>KL divergence is directional and sensitive to near-zero probabilities. Fidelity records the direction and smoothing epsilon so the value can be interpreted correctly.</p></details>
            <details><summary>Production decision <span>04</span></summary><p>A Fidelity verdict applies one configured policy to one observed run. It cannot replace domain-specific safety review, monitoring, or hardware validation.</p></details>
          </div>
        </div>
      </section>

      <section className="next-step-section">
        <div className="page-shell next-step-card next-step-card--methods">
          <span className="next-step-card__number">02 / 02</span>
          <div><p className="eyebrow eyebrow--light">Next: reproduce it</p><h2>Inspect the contract, code, and limitations.</h2></div>
          <Link className="button button--paper" href="/docs">Read the docs <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  );
}
