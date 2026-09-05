"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CodeBlockProps = {
  code: string;
  label: string;
};

export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <div className="code-block__top">
        <span>{label}</span>
        <button type="button" onClick={copyCode} aria-label={`${copied ? "Copied" : "Copy"} ${label}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}
