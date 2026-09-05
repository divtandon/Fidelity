"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";

import { LogoMark } from "@/components/brand/logo-mark";

const navigation = [
  { href: "/product", label: "Product" },
  { href: "/methods", label: "Methods" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="page-shell site-header__inner">
        <Link className="wordmark" href="/" aria-label="Fidelity home">
          <LogoMark className="wordmark__mark" /><span>Fidelity</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
          <a href="https://github.com/divtandon/Fidelity" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a>
        </nav>
        <div className="site-header__actions">
          <Link className="nav-cta" href="/runs/demo">Open demo <span aria-hidden="true">↗</span></Link>
          <button
            className="menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <nav className={`mobile-nav${menuOpen ? " mobile-nav--open" : ""}`} id="mobile-menu" aria-label="Mobile navigation">
        {navigation.map((item) => <Link href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
        <Link href="/runs/demo" onClick={() => setMenuOpen(false)}>Open demo</Link>
        <a href="https://github.com/divtandon/Fidelity" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>GitHub <ArrowUpRight size={14} /></a>
      </nav>
    </header>
  );
}
