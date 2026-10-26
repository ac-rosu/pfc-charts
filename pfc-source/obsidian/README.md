# PFC Charts (ISA-88) — Obsidian plugin

Render **Procedure Function Charts** (ISA-88 / IEC 61512) from plain text inside
Obsidian, the way Mermaid renders flowcharts. Write a fenced ` ```pfc ` block and
it draws a themed SVG in both reading mode and live preview.

````
```pfc
pfc Charge and React
step S1 "Add Water" :phase
trans "level >= 500L"
step "Heat Reactor" :operation
trans "temp >= 80C"

parallel
  branch
    step "Dose Acid" :phase
    trans "acid dosed"
    step "Hold" :phase
  branch
    step "Agitate" :phase
end

trans "reaction complete"

selective
  branch
    trans "quality == good"
    step "Package" :procedure
  branch
    trans "quality == bad"
    step "Rework" :unitprocedure
end

step "Discharge" :phase
```
````

Large charts scroll instead of shrinking past readability. Hover a chart for zoom
controls, or hold `Ctrl`/`Cmd` and scroll to zoom.

## Install

Build with `npm run build:obsidian` (from the repo root), then copy the three generated
files from `output/obsidian/` into your vault:

```
<your vault>/.obsidian/plugins/pfc-charts/
  ├─ main.js
  ├─ manifest.json
  └─ styles.css
```

Then: **Settings → Community plugins → Reload**, and enable **PFC Charts (ISA-88)**.
(If Restricted Mode is on, turn it off first.)

## Syntax

Indentation is optional — structure comes from keywords. `//` and `#` start comments.

| Statement | Meaning |
|-----------|---------|
| `pfc <title>` | Optional chart title (first line). |
| `step [ID] "Label" [:level] [initial] [+]` | A procedural step. `ID`, `initial`, and `+` optional. `+` (or `contains`/`encapsulates`) marks a step that contains a lower-level PFC (operations and higher; not phases). |
| `trans "condition"` | An **explicit** transition, drawn as two lines with the condition beside it. Alias: `transition`. |
| `parallel` … `branch` … `end` | Simultaneous (AND) branches — drawn with **double** bars spanning the branches. |
| `selective` … `branch` … `end` | Alternative (OR) branches — drawn with **single** bars. |
| `alloc "<label>"` | Equipment **allocation** — drawn as an ellipse on the link (e.g. `alloc "Reactor 1 or 2"`). Alias: `allocation`. |
| `sync <id>` | Attaches a synchronization tab to the **step or allocation above it**. The same `<id>` on another branch draws a dashed line between the two tabs (the branches wait for each other). |
| `transfer <id> out` / `transfer <id> in` | Attaches a material-transfer tab to the step or allocation above it — a dashed **arrow** runs from the `out` tab to the matching `in` tab. |
| `no-terminals` | Directive: hide the begin/end triangles for this chart. |
| `loop` | Directive: make the chart a cycle — the end links back to the start. |
| `uniform-width` | Directive: draw every step at the width of the widest step (allocations likewise), for a uniform look. |
| `use-colors` | Directive: color each step by the equipment its level runs on — procedures purple, unit procedures and operations blue, phases green. |
| `concurrent` … `process ["label"]` … `end` | Two or more **independent looping lanes**, each its own cycle (no begin/end, no convergence). Each `process` may take an optional label shown above the lane. Use `sync`/`transfer` to connect them. Must be the whole chart. |
| `note "<text>"` | A boxed annotation attached to the **step or allocation above it**, drawn to the side with a leader line. Text wraps automatically. |
| `link "<target>"` | Makes the **step above it** clickable, opening the note with its lower-level chart (e.g. `link "Charge Operation"` or `link "charge.md#phases"`). Adds the `+` automatically. Operations and higher only. Mod-click opens a new tab; Mod-hover previews the note; a missing note is created on click. |
| `goto <id>` | Jump to an earlier step (its **id** — the bare word before the label, e.g. `step HEAT "Heat"`). Draws a compact **"↺ label" chip** naming the target (no wire). Add `line` (`goto <id> line`) to draw the routed back-link instead. Alias: `return`. Put it under a `trans` (usually one branch of a `selective`) for a conditional retry. |

### Transitions: implicit vs explicit

Per ISA-88.02 there are two kinds of transition:

- **Implicit** — you write nothing between two steps. The link goes straight to
  the next step and fires when the preceding element finishes on its own (e.g. an
  equipment phase reaching its complete state, or a parameter goal being met). An
  implicit transition carries no logic.
- **Explicit** — a `trans "condition"` line. Drawn as two short parallel lines
  across the link with the condition shown next to it.

So `step … ` / `step …` with no `trans` between them is an implicit transition;
add a `trans` only when you want to show a specific condition.

### Begin / end symbols

A PFC has exactly one begin symbol (down triangle) and one end symbol (up
triangle); they're non-executed placeholders, and all branches converge to a
single path before the end. These are drawn by default — add a `no-terminals`
line to hide them.

**Levels** set the ISA-88 procedural level, shown (per Figure 7) as diagonal
lines drawn across the corners of a square rectangle. Corners fill in the order
top-left → top-right → bottom-right → bottom-left:

| Tag | Level | Corner diagonals |
|-----|-------|------------------|
| `:phase` | Phase (default) | 1 — TL |
| `:operation` / `:op` | Operation | 2 — TL, TR |
| `:unitprocedure` / `:up` | Unit Procedure | 3 — TL, TR, BR |
| `:procedure` / `:proc` | Procedure | 4 — all corners |

Add `+` (or `contains` / `encapsulates`) to a step to place the "+" mark in the
top-right corner, meaning the element **contains a lower-level PFC** rather than
referencing an equipment procedural element — e.g. `step "Charge" :operation +`.
A phase is the lowest procedural level and can't contain one, so `+` on a phase (or on
a step with no level, which is a phase) is a parse error.

Add the `initial` keyword to a step (e.g. `step "Add Water" :phase initial`) to
draw it with a double outline. This is off by default — the begin triangle
already marks where execution starts.

Both `parallel` and `selective` require at least two `branch` blocks and may be
nested arbitrarily.

## Styling

All colors come from Obsidian theme variables (`--interactive-accent`,
`--text-normal`, `--background-primary`, …), so charts follow light/dark themes
automatically. Override anything in `styles.css` — e.g. change `.pfc-step-rect`
stroke to recolor steps. `use-colors` takes its hues from `--color-purple`,
`--color-blue` and `--color-green`.

## Building from source

Requires Node 18+. Run from the **repository root**.

```bash
npm install
npm run build:obsidian   # type-checks then bundles -> output/obsidian/
npm run dev              # watch-rebuild the Obsidian target
npm test                 # runs the parser/layout unit tests
```

Source layout (shared core + Obsidian adapter):

- `pfc-source/core/src/parser.ts` — text DSL → chart model
- `pfc-source/core/src/layout.ts` — deterministic top-to-bottom layout (no external deps)
- `pfc-source/core/src/render.ts` — model → themed SVG
- `pfc-source/obsidian/src/main.ts` — Obsidian code-block processor

The `@pfc/core` package has no Obsidian or DOM-framework dependencies beyond a canvas for
text measurement, which makes the planned VS Code and Fumadocs adapters straightforward.

## Releasing a new version

1. Bump `version` in `manifest.json` (and `minAppVersion` if it changed).
2. Add a `"<version>": "<minAppVersion>"` entry to `versions.json`.
3. `npm run build:obsidian` from the repo root, then publish the three files from
   `output/obsidian/` (`main.js`, `manifest.json`, `styles.css`) — e.g. as a GitHub
   release tagged with the exact version, or by copying them into
   `<vault>/.obsidian/plugins/pfc-charts/`.

## License

MIT
