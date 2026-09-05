# Contributing to Fidelity

Thanks for helping make model-validation evidence more trustworthy and easier
to understand.

## Before you start

Open a focused issue or discussion for changes that alter the report schema,
statistical method, policy thresholds, or user-facing release language. Those
changes affect the meaning of evidence, not merely implementation details.

Please keep each change small and coherent. Do not mix generated model files,
datasets, private evaluation outputs, or secrets into ordinary source commits.

## Local checks

For Python changes:

```bash
python -m pip install -r tests/python/requirements.txt -r api/requirements.txt
python -m pytest tests/python
```

For web changes:

```bash
cd web
npm install
npm run lint
npx tsc --noEmit
npm run build
```

Run the checks relevant to your change and include any deliberate omissions in
your pull request description. PyTorch is optional in the base test setup;
when changing PTQ or inference behavior, also test with a supported local
PyTorch installation.

## Evidence and product rules

- Preserve the `provenance` contract. A demo may help people inspect the UI,
  but it must remain visibly and machine-readably non-computed.
- Do not make equivalence, safety, calibration, fairness, privacy, or release
  claims from a non-significant result alone.
- Add or update tests whenever changing metric arithmetic, schema validation,
  serialization, policy behavior, or API availability behavior.
- Keep web fallbacks accessible: keyboard users, reduced-motion users, and
  environments without WebGL should still be able to understand the product.
- Avoid adding paid services or API keys for design or core operation. The
  current project is intentionally usable with local, open tooling.

## Commit and review guidance

Use imperative, scoped commits when practical (for example,
`feat(validation): add paired evidence guardrail`). Describe user-facing
changes, validation performed, and any decision tradeoffs. Reviewers should be
able to trace a release verdict from report fields to derived evidence without
trusting a client-rendered number.

## Code of conduct

Be respectful, specific, and constructive. Treat questions about statistical
validity as product-quality questions: surfacing uncertainty is a feature.

