# Trakr web presentation

Live: **https://trakr-presentation.edmundlim.workers.dev**

A redesigned browser deck: 9 pitch slides, a 3-minute demo holding slide, and 8 appendix slides. The pitch uses the timed script in `../docs/presentation/speaker-notes.md`; `build.ts` turns it into the hosted presenter notes.

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
- Slide 4 has a replayable illustrative checkout sequence, clearly distinguished from the native app.
- Slide 10 has a start / pause / reset demo timer. The timer continues when the browser is in the background and reconciles against wall-clock time.
- URLs use `#1` through `#18` to link directly to slides.
- Native dialogs trap focus and support Escape. Motion respects `prefers-reduced-motion`. Animations finish instead of looping indefinitely.
- Browser printing exposes all slides. Present the web version for animations.

Speaker notes appear in an on-page dialog, so keep them closed while screen sharing unless you intend to show them. The existing PPTX and PDF under `docs/presentation` are the earlier static version; the web deck supersedes their design.

## Design and content

Typography and spacing take inspiration from https://t3.codes: DM Sans, JetBrains Mono, neutral near-black surfaces, restrained borders and medium-weight display type. Original Trakr layouts, equipment illustration and workflow diagrams. Self-hosted font files retain their SIL Open Font License notices under `public/fonts/`.

The design uses one motion theme: information becoming a record. Tag signals, a brief receipt sequence and data packets explain the workflow. The pilot thresholds and business model remain explicitly proposed. The mock receipt contains illustrative equipment, not real borrower data.

## Browser verification

With the presentation loaded in gstack browse, run:

```bash
bun /home/edmundlim/.codex/skills/gstack/browse/src/cli.ts eval presentation/tests/browser-check.js
```

Run from the repository root. This checks keyboard navigation, slide visibility, overview, notes, animation replay/cancellation, timer behaviour and navigation boundaries. Source CLI is used because the cached compiled browse binary on this Linux host is a macOS binary. If Chromium's user namespace sandbox is unavailable, start browse with `GSTACK_CHROMIUM_NO_SANDBOX=1`.
