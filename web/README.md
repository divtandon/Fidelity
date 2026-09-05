# Fidelity web

This directory contains Fidelity's public product experience and validation
dashboard. It presents FP32-to-INT8 evidence produced by the Python pipeline;
it does not calculate metrics or create a release verdict in the browser.

For the complete model pipeline and service setup, see the
[repository guide](../README.md).

## Stack

- Next.js 16 App Router, React 19, and TypeScript 6
- Three.js with React Three Fiber and Drei for the compression scene
- Motion for scroll-linked transitions and interface reveals
- Recharts for per-class evidence, paired with a semantic data table
- Zod for strict report validation at the frontend boundary
- Tailwind CSS 4 tooling plus a project-specific token and component layer
- Vitest, Testing Library, Playwright, and axe-core for automated checks

All visuals and runtime dependencies are local to the project. The frontend
requires no paid API and no secret key.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Interactive FP32-to-INT8 product narrative |
| `/product` | Validation workflow, scope, and report anatomy |
| `/methods` | Paired evaluation, drift, significance, and policy explanation |
| `/docs` | Report contract, integrity rules, and integration instructions |
| `/runs/demo` | Explicitly labeled illustrative dashboard fixture |
| `/runs/cifar10-resnet18-int8-seed2026` | Bundled pipeline-produced portfolio run |
| `/runs/latest` | Latest API-backed computed report, or an unavailable state |

The demo, latest endpoint, and explicitly registered verified runs are valid.
Unknown IDs render the scoped not-found experience.

## Local development

Use Node.js 20.9 or newer; CI uses Node.js 22.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The full site, bundled verified run, and
`/runs/demo` work without the Python service.

For a production-style local run:

```bash
npm run build
npm run start
```

## Optional computed-report service

`/runs/latest` reads a report from Fidelity's optional FastAPI service. Copy
[`.env.example`](.env.example) to `.env.local`, or create the file with:

```dotenv
FIDELITY_API_BASE_URL=http://127.0.0.1:8000
```

This variable is server-only. Do not rename it with a `NEXT_PUBLIC_` prefix.
The URL must be reachable from the Next.js server process, not necessarily from
the visitor's browser.

From the repository root, start the API after a successful pipeline run has
published `artifacts/latest-report.json`:

```powershell
python -m uvicorn api.app:app --reload --port 8000
```

The frontend requests `GET /api/reports/latest` without caching, applies a
four-second timeout, parses the response with the strict shared report shape,
and accepts only `computed: true` provenance. Restart the development server
after changing `.env.local`.

Leaving `FIDELITY_API_BASE_URL` unset is supported. In that state, or when the
service returns a missing, invalid, demo, or unreachable report,
`/runs/latest` displays an explicit unavailable message.

## Evidence boundary

The two dashboard paths are intentionally separate:

- `/runs/demo` loads a local fixture with
  `provenance: { kind: "demo", computed: false }`. The page banner and JSON
  export both identify it as illustrative data.
- `/runs/latest` can render only a contract-valid service response with
  `provenance: { kind: "computed", computed: true }`. It never substitutes the
  demo when computed evidence is unavailable.
- `/runs/cifar10-resnet18-int8-seed2026` loads the exact checked-in report from
  an explicit registry. Its report and metadata SHA-256 values are preserved
  and documented beside the evidence files.

The frontend schema also reconciles aggregate accuracy with canonical counts,
checks per-class totals, validates sample counts, and rejects unknown fields.
The Python serializer remains the authoritative source for report construction
and policy evaluation.

## Motion and accessibility

The home-page visualization starts with the local
[quantization poster](public/quantization-poster.png). The live WebGL scene is
loaded client-side only when the browser supports WebGL, the scene is near the
viewport, and the user has not requested reduced motion. Otherwise the poster
remains visible, so the narrative does not depend on GPU support or animation.

The 3D visualization is decorative and hidden from assistive technology. Core
content uses semantic landmarks and headings; navigation supports the keyboard;
chart evidence has a table alternative; color is accompanied by labels. Browser
tests exercise reduced-motion content, keyboard navigation, axe checks, report
disclosure, export, and fail-closed report states.

## Checks

```bash
# Static quality gates
npm run lint
npm run typecheck

# Unit and contract tests
npm run test
npm run test:coverage

# Production compilation
npm run build

# Browser journeys (install engines once per machine)
npx playwright install chromium firefox webkit
npm run test:e2e
```

Use `npm run test:watch` while developing unit-tested behavior. Playwright
starts the local Next.js development server automatically unless a compatible
server is already running outside CI.

## Directory map

```text
app/          App Router pages, metadata, loading/not-found states, global CSS
components/   Layout, product, dashboard, motion, and Three.js components
lib/          Report contract/fetching, demo fixture, formatting, scene data
public/       Local poster and static assets
tests/unit/   Vitest contract and utility tests
tests/e2e/    Playwright browser and accessibility journeys
```
