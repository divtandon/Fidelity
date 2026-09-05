import Link from "next/link";
import { ArrowRight, Braces, ChartNoAxesCombined, ScanSearch } from "lucide-react";

import { CompressionHero, type FeaturedRunSummary } from "@/components/home/compression-hero";
import { FEATURED_RUN_HREF, FEATURED_RUN_ID } from "@/lib/featured-run";
import { formatDelta, formatPValue, formatPercent } from "@/lib/format";
import { getVerifiedReport } from "@/lib/verified-reports";

const evidenceLayers = [
  {
    index: "01",
    title: "Overall accuracy",
    copy: "Start with the broad signal: how many predictions stayed correct after compression?",
    meta: "Top-1 · paired examples",
  },
  {
    index: "02",
    title: "Per-class behavior",
    copy: "Surface the categories that moved most, even when the aggregate barely changes.",
    meta: "Class deltas · ranked",
  },
  {
    index: "03",
    title: "Prediction drift",
    copy: "Measure how the complete output distributions changed—not only the winning labels.",
    meta: "KL divergence · mean",
  },
  {
    index: "04",
    title: "Paired significance",
    copy: "Publish the test, decision level, assumptions, and limit of the conclusion together.",
    meta: "Wilcoxon · transparent",
  },
];

const chapters = [
  {
    number: "I",
    title: "Compare the same examples",
    copy: "Every sample is evaluated by both the reference model and compressed candidate, preserving the paired evidence.",
  },
  {
    number: "II",
    title: "Find hidden drift",
    copy: "Inspect aggregate accuracy, class-level changes, and prediction distributions in one report.",
  },
  {
    number: "III",
    title: "State only what the evidence supports",
    copy: "Keep the policy, statistical assumptions, and limitations next to the verdict—not in fine print.",
  },
];

export default function Home() {
  const report = getVerifiedReport(FEATURED_RUN_ID);
  if (!report) throw new Error(`Featured run ${FEATURED_RUN_ID} is not registered.`);

  const featuredRun = {
    href: FEATURED_RUN_HREF,
    label: `Verified CIFAR-10 run · ${report.sample_count.toLocaleString()} paired examples`,
    reference: {
      precision: report.reference.precision,
      value: formatPercent(report.reference.top1_accuracy),
      fillPercent: report.reference.top1_accuracy * 100,
    },
    candidate: {
      precision: report.candidate.precision,
      value: formatPercent(report.candidate.top1_accuracy),
      fillPercent: report.candidate.top1_accuracy * 100,
    },
    delta: formatDelta(report.accuracy_delta_pp),
    pValue: formatPValue(report.significance.p_value),
  } satisfies FeaturedRunSummary;

  return (
    <main id="main-content">
      <CompressionHero featuredRun={featuredRun} />

      <section className="signal-rail" aria-label="Fidelity validation workflow">
        <div className="page-shell signal-rail__inner">
          <span>Reference</span><i aria-hidden="true" />
          <span>Quantize</span><i aria-hidden="true" />
          <span>Compare</span><i aria-hidden="true" />
          <span>Decide</span>
        </div>
      </section>

      <section className="editorial-section" id="why-fidelity">
        <div className="page-shell">
          <div className="editorial-intro">
            <div>
              <p className="eyebrow"><ScanSearch size={14} /> Why Fidelity</p>
              <h2>Aggregate accuracy can hide a model changing its mind.</h2>
            </div>
            <p className="editorial-intro__copy">
              A compressed model can look stable overall while individual classes slip or prediction
              confidence shifts. Fidelity keeps the paired evidence visible.
            </p>
          </div>

          <div className="chapter-grid">
            {chapters.map((chapter) => (
              <article className="chapter-card" key={chapter.number}>
                <span className="chapter-card__number">{chapter.number}</span>
                <div><h3>{chapter.title}</h3><p>{chapter.copy}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="evidence-section">
        <div className="evidence-section__orb evidence-section__orb--blue" aria-hidden="true" />
        <div className="evidence-section__orb evidence-section__orb--orange" aria-hidden="true" />
        <div className="page-shell evidence-layout">
          <div className="evidence-heading">
            <p className="eyebrow eyebrow--light"><ChartNoAxesCombined size={14} /> The evidence stack</p>
            <h2>One run.<br />Four layers of evidence.</h2>
            <p>
              The dashboard starts with the decision, then lets reviewers move from plain language to
              the exact measurements behind it.
            </p>
            <Link className="text-link text-link--light" href={FEATURED_RUN_HREF}>
              Inspect the verified report <ArrowRight size={16} />
            </Link>
          </div>

          <ol className="evidence-list">
            {evidenceLayers.map((layer) => (
              <li key={layer.index}>
                <span className="evidence-list__index">{layer.index}</span>
                <div><h3>{layer.title}</h3><p>{layer.copy}</p></div>
                <span className="evidence-list__meta">{layer.meta}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="principle-section">
        <div className="page-shell principle-layout">
          <p className="eyebrow"><Braces size={14} /> Built around a typed contract</p>
          <blockquote>“A smaller model should carry its <em>proof</em> with it.”</blockquote>
          <div className="principle-copy">
            <p>
              Python computes the evidence. A versioned JSON report records it. The interface validates
              that contract before rendering a single conclusion.
            </p>
            <Link className="text-link" href="/docs">
              Inspect the architecture <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="closing-section">
        <div className="page-shell closing-card">
          <div><p className="eyebrow eyebrow--light">Open the instrument</p><h2>See what changed.<br />Decide with evidence.</h2></div>
          <div className="closing-card__actions">
            <Link className="button button--paper" href={FEATURED_RUN_HREF}>View verified report <ArrowRight size={17} /></Link>
            <Link className="button button--ghost-light" href="/methods">Read the method</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
