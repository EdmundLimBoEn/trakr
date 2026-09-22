# Trakr web presentation

Live: **https://trakr-presentation.edmundlim.workers.dev**

A concise technical deck: **6 technical slides (~3½ minutes), a 3-minute demo, and 1 Q&A appendix**. Replaces the previous 18-slide pitch. Slides, source references and timed speaker notes share one source in `src/slides.ts`. The build generates the hosted `notes.json` and a readable `speaker-notes.md`.

1. System overview and native stack
2. Architecture diagram: mobile rules boundary versus privileged Worker path
3. Checkout flowchart with explicit offline / denial / success branches
4. Data relationship diagram and claim / issue lifecycles
5. Write-volume chart with an interactive items / issues calculator
6. Engineering tradeoffs and remaining validation
7. Native-app demo with three-minute timer
8. Access-control matrix for Q&A

## Run and deploy

```bash
cd presentation
bun install --frozen-lockfile
bun run typecheck
bun run build
npx wrangler dev --port 8798
# Deploy the presentation Worker only:
npx wrangler deploy
```

This is a standalone Cloudflare Workers static-assets site named `trakr-presentation`. It does not share the ops dashboard Worker or access Firebase. Only `dist/` is uploaded. No runtime framework, external font requests, analytics or credentials are used.

## Present

- Arrow keys, Space, or Page Up / Page Down: navigate.
- Home / End: first / last slide.
- F: fullscreen. O: slide overview. N: current speaker notes.
- On touch screens, swipe horizontally or use the footer arrows.
- Slide 3 has a replayable success-path trace through the checkout flowchart.
- Slide 5 lets you change item and issue counts; issues cannot exceed items. Slider arrow keys adjust values without navigating slides.
- Diagrams and the access matrix scroll horizontally on narrow screens to keep labels readable.
- Slide 7 has a start / pause / reset demo timer. The timer continues when the browser is in the background and reconciles against wall-clock time.
- URLs use `#1` through `#8` to link directly to slides.
- Native dialogs trap focus and support Escape. Motion respects `prefers-reduced-motion`. Animations finish instead of looping indefinitely.
- Browser printing exposes all slides. Present the web version for animations.

Speaker notes appear in an on-page dialog, so keep them closed while screen sharing unless you intend to show them. The existing PPTX and PDF under `docs/presentation` are the earlier static version; the web deck supersedes their design.

## Design and content

Typography and spacing take inspiration from https://t3.codes: DM Sans, JetBrains Mono, neutral near-black surfaces, restrained borders and medium-weight display type. Original Trakr layouts, equipment illustration and workflow diagrams. Self-hosted font files retain their SIL Open Font License notices under `public/fonts/`.

Motion supports the technical explanation: brief entrances, a replayable checkout path and animated write-volume bars. The chart models the iOS gateway's constructed document writes: `1 + n + k` for checkout and `1 + c` for return. It is not measured latency, billing, throughput or proof that every size is admissible under rules. Rules/read checks and unrelated operations are excluded.

The presentation preserves the distinction between implemented behaviour, repository test coverage and outstanding hardware / school / concurrency validation. It does not claim a new application test pass. The reference arrows in the data-model slide are document IDs, not relational foreign keys; issue-state arrows illustrate the UI workflow rather than forward-only rule enforcement.

## Browser verification

With the presentation loaded in gstack browse, run:

```bash
bun /home/edmundlim/.codex/skills/gstack/browse/src/cli.ts eval presentation/tests/browser-check.js
```

Run from the repository root. This checks keyboard navigation, slide visibility, overview, notes, flowchart replay/cancellation, formula values, slider constraints, timer behaviour and navigation boundaries. Source CLI is used because the cached compiled browse binary on this Linux host is a macOS binary. If Chromium's user namespace sandbox is unavailable, start browse with `GSTACK_CHROMIUM_NO_SANDBOX=1`.
