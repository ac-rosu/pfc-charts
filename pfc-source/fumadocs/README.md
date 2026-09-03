# PFC Charts — Fumadocs adapter (planned)

This folder will hold the Fumadocs (Next.js + MDX) integration that renders ```pfc```
code blocks, reusing the shared engine in [`../core`](../core) (imported as `@pfc/core`).

## Intended approach

- **Client component** — a `"use client"` `<PFC source=... />` that runs
  parser + layout + the DOM renderer in the browser (mirrors the Mermaid component), or
- **Build-time remark/rehype plugin** — transform `pfc` fences into pre-rendered inline
  SVG at build time using a string renderer (`renderChartToString`) from `@pfc/core`
  (best for SSG/SEO, no client JS).

Theme by mapping the core CSS onto Fumadocs' tokens (`--color-fd-*`) or `currentColor`.

Enabling work in core: a string-based `renderChartToString()` alongside the current DOM
renderer.

Build output will land in `output/fumadocs/`.
