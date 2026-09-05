# Validation verdict policy

The Python validation layer—not the web client—assigns every `ready`, `review`,
or `blocked` verdict. The exact policy name, version, alpha, and thresholds are
embedded in each report so an old decision can be audited after defaults change.

The default `fidelity_default` policy, version `1.0.0`, uses these guardrails:

| Evidence | Review at | Block at |
| --- | ---: | ---: |
| Overall candidate accuracy drop | 0.5 percentage points | 2.0 percentage points |
| Mean `KL(reference || candidate)` confidence drift | 0.02 nats | 0.10 nats |
| Worst eligible per-class accuracy drop | 2.0 percentage points | 10.0 percentage points |

A threshold is crossed when the observed value is greater than or equal to it.
The default minimum eligible class size is one sample; real deployments should
raise it to match their evidence requirements. A two-sided paired Wilcoxon
signed-rank result with `p < 0.05` and a negative aggregate delta also triggers
review. A block condition takes precedence over all review conditions, and all
crossed guardrails remain in `verdict.reasons`.

`ready` means no configured guardrail was crossed for this run. It does not mean
the two models were proven statistically equivalent. In particular, a
non-significant Wilcoxon result is reported as “no statistically detectable
difference,” never as evidence of equivalence.
