# PFC Charts — VS Code extension

Renders ISA-88 **Procedure Function Charts** from ```` ```pfc ```` fenced code blocks in
the built-in **Markdown preview**, using the shared engine in
[`../core`](../core) (imported as `@pfc/core`).

````markdown
```pfc
pfc Simple Batch
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat" :operation
```
````

Open any Markdown file and run **Markdown: Open Preview** (`Ctrl/Cmd+Shift+V`); `pfc`
blocks render as themed inline SVG that follows the active VS Code color theme.

## How it works

- The extension contributes a Markdown-It plugin (`markdown.markdownItPlugins`). Its
  `extendMarkdownIt` hook adds a fence rule for `pfc` that calls
  `renderChartToString(parsePfc(source))` from `@pfc/core` and emits inline SVG.
- Theming is contributed via `markdown.previewStyles`
  ([media/pfc-preview.css](media/pfc-preview.css)), which maps the chart classes onto
  `--vscode-*` theme variables.
- No runtime dependencies: `@pfc/core` is bundled into `dist/extension.js`.

## Build & package

From the **repository root**:

```bash
npm run build            # builds all targets, incl. this one -> output/vscode/
# or just this target:
node build.mjs vscode
```

The build produces a self-contained extension in `output/vscode/`
(`package.json`, `dist/extension.js`, `media/`). Package it with
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce):

```bash
cd output/vscode
npx @vscode/vsce package --no-dependencies
```

Or press <kbd>F5</kbd> with `output/vscode` opened as the extension folder to launch an
Extension Development Host.

## Releasing a new version

1. Bump `version` in [package.json](package.json) by hand and add an entry to
   [CHANGELOG.md](CHANGELOG.md).
2. `npm run build:vscode` from the repo root.
3. Package from `output/vscode/`:
   ```bash
   cd output/vscode
   npx @vscode/vsce package --no-dependencies   # -> pfc-charts-<v>.vsix
   ```
4. Upload the `.vsix` at <https://marketplace.visualstudio.com/manage> (publisher `acro`).

See [Releasing a new version](../../README.md#vs-code) in the root README for the
command-line alternative and the December 2026 PAT retirement.

## DSL reference

The chart language is identical across all targets — see
[../obsidian/DOCUMENTATION.md](../obsidian/DOCUMENTATION.md) and the authoring skill in
[../../pfc-skills](../../pfc-skills).
