import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope, Newsreader } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Fidelity — Evidence for compressed models", template: "%s · Fidelity" },
  description: "Fidelity compares compressed models with their full-precision references across accuracy, class behavior, prediction drift, and statistical significance.",
  applicationName: "Fidelity",
  category: "developer tools",
  keywords: ["model quantization", "machine learning", "statistical validation", "INT8", "PyTorch"],
  authors: [{ name: "Div Tandon" }],
  creator: "Div Tandon",
  openGraph: {
    type: "website",
    title: "Fidelity — Prove the model after the transformation",
    description: "Statistical validation for compressed and compiled models.",
    images: [{ url: "/quantization-poster.png", width: 1680, height: 941, alt: "FP32 particles compressing into an INT8 lattice" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fidelity — Evidence for compressed models",
    description: "Prove the model after the transformation.",
    images: ["/quantization-poster.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5f1",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
