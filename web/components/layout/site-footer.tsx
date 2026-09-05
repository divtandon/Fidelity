import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { LogoMark } from "@/components/brand/logo-mark";
import { FEATURED_RUN_HREF } from "@/lib/featured-run";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-shell site-footer__top">
        <div>
          <Link className="wordmark wordmark--footer" href="/" aria-label="Fidelity home">
            <LogoMark className="wordmark__mark" /><span>Fidelity</span>
          </Link>
          <p className="site-footer__tagline">Statistical validation for transformed models.</p>
        </div>
        <div className="site-footer__links">
          <div><span>Explore</span><Link href="/product">Product</Link><Link href="/how-it-works">How it works</Link><Link href={FEATURED_RUN_HREF}>Verified report</Link><Link href="/runs/demo">Demo report</Link><Link href="/methods">Methods</Link></div>
          <div><span>Build</span><Link href="/docs">Documentation</Link><a href="https://github.com/divtandon/Fidelity" target="_blank" rel="noreferrer">Source <ArrowUpRight size={12} /></a></div>
        </div>
      </div>
      <div className="page-shell site-footer__bottom">
        <p>Fidelity reports observed evidence; it does not certify model safety or production readiness.</p>
        <p>Independent open-source project. Not affiliated with Fidelity Investments.</p>
      </div>
    </footer>
  );
}
