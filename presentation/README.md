# Trakr web presentation

Live: **https://trakr-presentation.edmundlim.workers.dev**

A balanced, short pitch: **6 slides (~3½ minutes) plus a 3-minute demo**. The emphasis is the problem, user journey and value, with one overall data-flow diagram.

1. The idea: know who has it and whether it returned
2. The problem: fragmented borrower, condition and return records
3. The use case: student checkout and teacher return
4. One overall data-flow chart, with a replayable trace
5. Value and practical scope
6. Pilot and proposed business model
7. Live demo with a three-minute timer

Slides, timing, source references and notes share one source in `src/slides.ts`. The build generates `notes.json` and `speaker-notes.md`.

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
- Slide 4 has a replayable trace through the overall data flow.
- Slide 7 has a start / pause / reset demo timer.
- The diagram scrolls horizontally on narrow screens to keep labels readable.
- URLs use `#1` through `#7` to link directly to slides.
- Native dialogs trap focus and support Escape. Motion respects `prefers-reduced-motion`. Animations finish instead of looping indefinitely.
- Browser printing exposes all slides. Present the web version for animations.

Speaker notes appear in an on-page dialog, so keep them closed while screen sharing unless you intend to show them. The existing PPTX and PDF under `docs/presentation` are the earlier static version; the web deck supersedes their design.

## Design and content

Typography and spacing take inspiration from https://t3.codes: DM Sans, JetBrains Mono, neutral near-black surfaces, restrained borders and medium-weight display type. Original Trakr layouts, equipment illustration and workflow diagrams. Self-hosted font files retain their SIL Open Font License notices under `public/fonts/`.

Motion supports the story with subtle entrances and a replayable handover trace. The deeper architecture, data-model, write-volume and access-control slides were removed. The pilot, business model and expected savings remain clearly labeled as proposals or hypotheses.

## Browser verification

With the presentation loaded in gstack browse, run:

```bash
bun /home/edmundlim/.codex/skills/gstack/browse/src/cli.ts eval presentation/tests/browser-check.js
```

Run from the repository root. This checks keyboard navigation, slide visibility, overview, notes, data-flow replay/cancellation, timer behaviour and navigation boundaries. Source CLI is used because the cached compiled browse binary on this Linux host is a macOS binary. If Chromium's user namespace sandbox is unavailable, start browse with `GSTACK_CHROMIUM_NO_SANDBOX=1`.
