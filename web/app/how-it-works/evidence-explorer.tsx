"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { BarChart3, Boxes, Orbit, ShieldCheck, Sigma, type LucideIcon } from "lucide-react";

import styles from "./how-it-works.module.css";

export type EvidenceSummary = {
  referenceAccuracy: string;
  candidateAccuracy: string;
  accuracyDelta: string;
  largestClassName: string;
  largestClassDelta: string;
  drift: string;
  pValue: string;
  nonzeroPairs: string;
  pairCount: string;
  alpha: string;
  verdict: string;
  policyName: string;
};

type EvidenceItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  question: string;
  value: string;
  answer: string;
  caveat: string;
};

function evidenceItems(summary: EvidenceSummary): EvidenceItem[] {
  return [
    {
      id: "accuracy",
      label: "Accuracy",
      icon: BarChart3,
      question: "Did overall correctness change?",
      value: `${summary.referenceAccuracy} → ${summary.candidateAccuracy}`,
      answer: `The candidate changed by ${summary.accuracyDelta}. Accuracy is the broadest check, based on exact correct counts over the same test examples.`,
      caveat: "A small overall change can still hide movement inside individual classes.",
    },
    {
      id: "classes",
      label: "Classes",
      icon: Boxes,
      question: "Which categories moved most?",
      value: `${summary.largestClassName} · ${summary.largestClassDelta}`,
      answer: "Fidelity computes reference and candidate accuracy inside every observed ground-truth class, then surfaces the largest absolute movements.",
      caveat: "Class-level results describe this held-out split, not every population the model may encounter.",
    },
    {
      id: "drift",
      label: "Prediction drift",
      icon: Orbit,
      question: "Did the full output distributions move?",
      value: `${summary.drift} nats`,
      answer: "Mean KL(reference ∥ candidate) compares all class probabilities, even when the winning label stays the same. Lower values mean the two outputs were closer on this run.",
      caveat: "KL is directional and is not calibration error; Fidelity records its direction and smoothing epsilon.",
    },
    {
      id: "significance",
      label: "Paired test",
      icon: Sigma,
      question: "Was the paired accuracy change detectable?",
      value: `p = ${summary.pValue}`,
      answer: `The two-sided paired test used ${summary.pairCount} examples and ${summary.nonzeroPairs} non-zero correctness differences. At α = ${summary.alpha}, it did not detect a difference.`,
      caveat: "Not detecting a difference is not proof that the models are equivalent—or that every prediction was identical.",
    },
    {
      id: "verdict",
      label: "Verdict",
      icon: ShieldCheck,
      question: "Did this run cross its configured guardrails?",
      value: summary.verdict,
      answer: `Python applied the serialized ${summary.policyName} policy to the observed accuracy, class, drift, and significance evidence. It returns Ready, Review, or Blocked; the interface renders that backend-owned result.`,
      caveat: "A ready verdict means this policy did not trigger. It is not a safety or deployment certificate.",
    },
  ];
}

export function EvidenceExplorer({ summary }: { summary: EvidenceSummary }) {
  const items = evidenceItems(summary);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId().replaceAll(":", "");

  function selectAndFocus(index: number) {
    const nextIndex = (index + items.length) % items.length;
    setActiveIndex(nextIndex);
    tabs.current[nextIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    selectAndFocus(nextIndex);
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.tabList} role="tablist" aria-label="Report evidence layers">
        {items.map((item, index) => {
          const Icon = item.icon;
          const tabId = `${instanceId}-${item.id}-tab`;
          const panelId = `${instanceId}-${item.id}-panel`;
          return (
            <button
              aria-controls={panelId}
              aria-selected={activeIndex === index}
              className={styles.tab}
              id={tabId}
              key={item.id}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => { tabs.current[index] = node; }}
              role="tab"
              tabIndex={activeIndex === index ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <section
            aria-labelledby={`${instanceId}-${item.id}-tab`}
            className={styles.tabPanel}
            hidden={activeIndex !== index}
            id={`${instanceId}-${item.id}-panel`}
            key={item.id}
            role="tabpanel"
            tabIndex={0}
          >
            <div className={styles.panelQuestion}>
              <span><Icon aria-hidden="true" size={19} strokeWidth={1.6} /></span>
              <p>Question {String(index + 1).padStart(2, "0")}</p>
              <h3>{item.question}</h3>
            </div>
            <div className={styles.panelReading}>
              <strong>{item.value}</strong>
              <p>{item.answer}</p>
              <div className={styles.panelCaveat}><span>Keep in mind</span>{item.caveat}</div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
