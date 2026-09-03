# PFC Charts

ISA-88 / IEC 61512 **Procedure Function Charts** from a small text DSL, rendered to
themed SVG. One framework-agnostic core drives multiple targets.

## Repository layout

```
pfc-source/
  core/        shared engine — parser, layout, SVG renderer (package @pfc/core)
  obsidian/    Obsidian plugin adapter (consumes @pfc/core)
  vscode/      VS Code extension adapter (planned)
  fumadocs/    Fumadocs integration (planned)
pfc-skills/    AI authoring skill (SKILL.md + examples) for writing pfc charts
output/        generated build artifacts (git-ignored, safe to delete)
build.mjs      build orchestrator -> output/<target>
```

`core/`, `obsidian/` (and, later, `vscode/`, `fumadocs/`) are npm workspaces; the
adapters import the shared engine as `@pfc/core`.

## Commands

Run from the repository root:

```bash
npm install
npm run build            # type-check + build every implemented target -> output/
npm run build:obsidian   # build only the Obsidian target
npm run dev              # watch-rebuild the Obsidian target
npm test                 # parser/layout unit tests
npm run lint             # eslint
npm run format           # prettier --write
```

## Targets

- **Obsidian** — built to `output/obsidian/` (`main.js`, `manifest.json`, `styles.css`).
  See [pfc-source/obsidian/README.md](pfc-source/obsidian/README.md) for install/usage
  and [pfc-source/obsidian/DOCUMENTATION.md](pfc-source/obsidian/DOCUMENTATION.md) for the
  full DSL reference.
- **VS Code** — a Markdown-preview extension built to `output/vscode/`. Renders `pfc`
  fenced blocks as inline SVG in the built-in preview. See
  [pfc-source/vscode/README.md](pfc-source/vscode/README.md).
- **Fumadocs** — scaffolded under `pfc-source/fumadocs/` (adapter not implemented yet).
