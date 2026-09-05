import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";

export default function RunNotFound() {
  return (
    <main id="main-content" className="report-page report-unavailable">
      <section className="page-shell report-unavailable__card" aria-labelledby="run-not-found-title">
        <span className="report-unavailable__mark"><SearchX size={24} /></span>
        <p className="report-kicker">Validation run</p>
        <h1 id="run-not-found-title">That run does not exist.</h1>
        <p>Only the deliberately labeled demo and the most recent computed report are addressable here.</p>
        <div className="report-unavailable__actions">
          <Link className="button" href="/runs/latest">View latest report <ArrowRight size={16} /></Link>
          <Link className="button button--quiet" href="/runs/demo">Open demo</Link>
        </div>
      </section>
    </main>
  );
}
