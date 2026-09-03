# PFC Charts — VS Code adapter (planned)

This folder will hold the VS Code extension that renders ```pfc``` code blocks, reusing
the shared engine in [`../core`](../core) (imported as `@pfc/core`).

## Intended approach

- **Markdown preview plugin** — contribute `markdown.markdownItPlugins` with an
  `extendMarkdownIt(md)` export that adds a fenced rule for `pfc`, emitting inline SVG via
  a string renderer (`renderChartToString`) from `@pfc/core`. Theme via
  `markdown.previewStyles`.
- **Optional `.pfc` custom editor** — a webview panel that runs the DOM renderer directly
  for live editing of standalone `.pfc` files.

Enabling work in core: a string-based `renderChartToString()` alongside the current DOM
renderer.

Build output will land in `output/vscode/`.
