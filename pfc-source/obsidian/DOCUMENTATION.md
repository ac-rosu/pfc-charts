# PFC Charts — Full Documentation

Render **ISA-88 (S88) Procedure Function Charts** from plain text inside Obsidian, the
way Mermaid renders flowcharts. Write a fenced ` ```pfc ` code block and the plugin draws
a themed SVG diagram in both reading mode and live preview.

- [Installation](#installation)
- [Quick start](#quick-start)
- [Concepts (ISA-88)](#concepts-isa-88)
- [Syntax reference](#syntax-reference)
  - [Chart directives](#chart-directives)
  - [Steps and levels](#steps-and-levels)
  - [Transitions](#transitions)
  - [Allocation](#allocation)
  - [Branch blocks: parallel & selective](#branch-blocks-parallel--selective)
  - [Synchronization & material transfer](#synchronization--material-transfer)
  - [Notes](#notes)
  - [Loop](#loop)
  - [Concurrent processes](#concurrent-processes)
  - [Comments](#comments)
- [Choosing the right construct](#choosing-the-right-construct)
- [Validation & error messages](#validation--error-messages)
- [Styling & theming](#styling--theming)
- [Building from source](#building-from-source)
- [Architecture](#architecture)
- [Known limitations](#known-limitations)
- [Symbol coverage (ISA-88 Figure 7)](#symbol-coverage-isa-88-figure-7)

---

## Installation

Build the plugin with `npm run build:obsidian` (from the repo root), then copy the three
generated files from `output/obsidian/` into your vault:

```
<your vault>/.obsidian/plugins/pfc-charts/
  ├─ main.js
  ├─ manifest.json
  └─ styles.css
```

Then open **Settings → Community plugins**, make sure Restricted Mode is off, click
**Reload**, and enable **PFC Charts (ISA-88)**.

> After copying new files over an existing install, do a full **Reload app**
> (`Ctrl/Cmd+R`) rather than only toggling the plugin — Obsidian can otherwise keep the
> old `main.js` cached.

Works on desktop and mobile (`isDesktopOnly: false`).

---

## Quick start

````
```pfc
pfc Charge and React
step "Add Water" :phase
trans "level >= 500L"
step "Heat Reactor" :operation
parallel
  branch
    step "Dose Acid" :phase
    trans "acid dosed"
    step "Hold" :phase
  branch
    step "Agitate" :phase
end
trans "reaction complete"
step "Discharge" :phase
```
````

Every diagram element maps to one line of text. Indentation is optional — the structure
comes from keywords, not whitespace.

---

## Concepts (ISA-88)

A PFC depicts procedural control. The building blocks:

| Concept | Element | Meaning |
|--------|---------|---------|
| Procedural element | `step` | A phase, operation, unit procedure, or procedure. |
| Explicit transition | `trans` | A named condition that must hold to advance. |
| Implicit transition | *(omit `trans`)* | Advance when the preceding element completes. |
| Simultaneous sequence | `parallel` | AND-split: all branches run; the join waits for all. |
| Sequence selection | `selective` | OR-split: exactly one branch is taken. |
| Allocation | `alloc` | Equipment allocation (which tank/reactor). |
| Synchronization | `sync` | Rendezvous between branches; both sides wait. |
| Material transfer | `transfer` | Directed material handoff between branches. |
| Cycle | `loop` | A single chart that repeats forever. |
| Concurrent processes | `concurrent`/`process` | Independent looping lanes joined by sync/transfer. |

Begin and end are drawn as a down-triangle (▽) at the top and an up-triangle (△) at the
bottom of a normal chart; both are non-executed placeholders.

---

## Syntax reference

One statement per line. Quote any label that contains spaces.

### Chart directives

| Directive | Effect |
|-----------|--------|
| `pfc <title>` | Optional chart title (usually the first line). |
| `no-terminals` | Hide the begin/end triangles. Aliases: `terminals off`. |
| `loop` | Make the whole chart a cycle (removes terminals). Aliases: `loop back`, `cycle`. |

### Steps and levels

```
step [ID] "Label" [:level] [initial] [+]
```

- **Label** is required. **ID** is optional and cosmetic (flow is defined by order).
- **Level** — drawn as diagonal marks across the corners of a square box:

  | Tag | Level | Corner marks |
  |-----|-------|--------------|
  | `:phase` (default) | Phase | 1 — top-left |
  | `:operation` / `:op` | Operation | 2 — top-left, top-right |
  | `:unitprocedure` / `:up` / `:unit` | Unit Procedure | 3 — adds bottom-right |
  | `:procedure` / `:proc` | Procedure | 4 — all corners |

- **`initial`** — draw a double border (initial-step marker). Off by default.
- **`+`** (or `contains` / `encapsulates`) — the element contains a lower-level PFC;
  draws a `+` in the top-right corner. Independent of the level.

Modifiers may appear before or after the quoted label:

```
step "Charge" :operation +
step + initial "Master Recipe" :procedure
```

### Transitions

```
trans "condition"        # explicit; alias: transition
```

- **Explicit** transitions render as two short parallel lines with the condition beside
  them.
- **Implicit** transitions: write nothing between two consecutive steps — the plain link
  means "advance when the previous element completes."
- `trans ""` draws the two lines with no text (an unconditional/immediate transition).

> Note: some ISA-88 references draw an explicit transition as a single perpendicular
> line. This plugin draws two short parallel lines to keep the tick legible; it is kept
> distinct from the double bar of a simultaneous sequence by how the links attach (a
> transition tick crosses a single link, whereas a simultaneous-sequence bar has the
> incoming link on one line and the branches on the other).

### Allocation

```
alloc "Reactor 1 or 2"   # alias: allocation
```

Draws an equipment-allocation ellipse on the link. Can appear anywhere a step can,
including inside a branch, and can carry `sync`/`transfer`/`note`.

### Branch blocks: parallel & selective

```
parallel                 # simultaneous sequence — DOUBLE bars (AND)
  branch
    ...
  branch
    ...
end

selective                # sequence selection — SINGLE bars (OR)
  branch
    trans "route A"
    step "A" :phase
  branch
    trans "route B"
    step "B" :phase
end
```

- At least **two** `branch` blocks; **no empty** branches.
- Nesting is allowed to any depth.
- The two lines of a simultaneous-sequence bar are drawn separately: the incoming link
  meets the top line, the branches leave from the bottom line (and vice-versa at the
  join) — visually distinct from a two-line transition tick.

### Synchronization & material transfer

Both attach to the **step or allocation on the preceding line**, and pair by id:

```
sync <id>                # synchronization tab (rendezvous)
transfer <id> out        # material-transfer source
transfer <id> in         # material-transfer destination
```

- `sync` with the same id on two branches draws a plain dashed line between the tabs.
- `transfer` draws a dashed **arrow** from the `out` tab to the `in` tab.
- The tab sits on the element's edge facing the partner; the connector routes with
  right-angle corners. Pair exactly two markers per id.

```
step "Sample" :operation
sync S1
...
step "Transfer to Reactor" :operation
transfer T1 out
```

### Notes

```
note "text"
```

A boxed annotation attached to the step or allocation above it, drawn to the side with a
dashed leader line. Text wraps automatically. Works in any chart type.

### Conditional jump (goto)

```
step HEAT "Heat" :operation      # the bare word HEAT is this step's id
...
trans "not up to temp"
goto HEAT                        # return to the HEAT step (alias: return)
```

`goto <id>` marks a jump to an earlier step. By default it renders as a compact
**"↺ label" chip** naming the target step — no wire is drawn, which keeps busy charts
readable (the standard flowchart/SFC connector convention). Add `line`
(`goto <id> line`) to instead draw the routed back-link into the **top** of the target
step. The target is a step's **id** — the bare word written before its quoted label.
Placed under a `trans` — usually as one branch of a `selective` — it gives a conditional
retry. An unknown target is a parse error.

The drawn (`line`) form routes on the right by default; if the chart also has a
whole-chart `loop` (which uses the right), the drawn gotos automatically move to the
**left**. Where connectors cross, horizontal lines hop over vertical ones so a crossing
reads as "over, not connected."

### Loop

```
loop
```

Turns the chart into a cycle: the begin/end triangles are dropped and a return link runs
from the end back to the start. Best for a single repeating sequence. In a `loop`, all
branches of a `parallel` start and finish together each cycle.

### Concurrent processes

```
concurrent
  process "Main Cycle"
    step "Operation 1" :operation
    step "Operation 2" :operation
    sync R
  process "Outfeed"
    step "Wait for cycle" :operation
    sync R
    step "Operation 5" :operation
end
```

- `concurrent` must be the **whole chart** and cannot be nested.
- At least **two** `process` lanes; none empty.
- Each `process` is its own **independent** loop — no begin/end, no convergence bar.
- An optional quoted label after `process` is shown as a title above the lane.
- Connect lanes with `sync` / `transfer` exactly as inside `parallel`.

Use this when each activity has its own cycle and they only meet at a rendezvous — e.g. a
main cycle that repeats while a separate operation runs alongside and must not overlap
itself (the sync is the "wait").

### Comments

- A line whose first non-space character is `#` is a comment.
- `//` starts a comment (to end of line) anywhere except inside a quoted string.

---

## Choosing the right construct

- **One path, gated by conditions** → linear steps + `trans`.
- **Alternative paths, one is chosen** → `selective`.
- **Several activities at once, all must finish** → `parallel`.
- **A single repeating sequence** → `loop`.
- **Independent activities that each cycle on their own and meet at a rendezvous** →
  `concurrent` + `sync`. (If the branches instead start and finish together every cycle,
  use `parallel` + `loop`.)
- **Two branches hand off material** → `transfer … out` / `… in`.
- **Two branches must wait for each other** → `sync`.
- **Retry / loop back to an earlier step on a condition** → give the target step an id
  (`step HEAT "Heat"`) and `goto HEAT` under a `trans` (typically one branch of a
  `selective`).

---

## Validation & error messages

The plugin shows a red error box (with a line number when known) instead of a diagram
when the source is invalid. Common messages:

| Message | Cause |
|---------|-------|
| `unknown statement: "…"` | A line doesn't start with a known keyword. |
| `step needs a label` | A `step` with no label. |
| `'parallel' needs at least two 'branch' blocks` | Fewer than two branches. |
| `'parallel' has an empty branch` | A `branch` with no elements. |
| `missing 'end' to close '…'` | A `parallel`/`selective`/`concurrent` block wasn't closed. |
| `'sync' must come right after a step or allocation` | Marker not attached to an element. |
| `transfer needs a direction: 'in' or 'out'` | `transfer` without `in`/`out`. |
| `marker '<id>' must be used exactly twice (found N)` | A `sync`/`transfer` id not paired exactly twice. |
| `transfer '<id>' needs exactly one 'out' and one 'in'` | A transfer pair with missing or duplicate directions. |
| `duplicate 'pfc' title line` | More than one `pfc <title>` line. |
| `unexpected '<line>' in 'concurrent' (expected 'process' or 'end')` | A stray line where a `process` or `end` was expected. |
| `'concurrent' must be at the top level` | `concurrent` nested inside a branch. |
| `'concurrent' must be the only thing in the chart` | Other elements alongside `concurrent`. |

---

## Styling & theming

All colors come from Obsidian theme variables, so charts follow light/dark themes
automatically. Override any of these classes in `styles.css`:

| Class | Element |
|-------|---------|
| `.pfc-step-rect` | Step box outline/fill |
| `.pfc-corner` | Level corner diagonals |
| `.pfc-plus` | Encapsulation `+` mark |
| `.pfc-step-initial` | Initial-step double border |
| `.pfc-line` | Directed links (connectors) |
| `.pfc-bar` | Sequence bars (single/double) |
| `.pfc-trans-tick` | Transition ticks |
| `.pfc-cond` | Transition condition text |
| `.pfc-terminal` | Begin/end triangles |
| `.pfc-loop` / `.pfc-loop-arrow` | Loop-back link and arrowhead |
| `.pfc-alloc` / `.pfc-alloc-label` | Allocation ellipse and label |
| `.pfc-sync` / `.pfc-sync-label` | Sync/transfer tab and its id |
| `.pfc-sync-line` / `.pfc-sync-arrow` | Sync/transfer connector and arrow |
| `.pfc-note` / `.pfc-note-text` / `.pfc-note-link` | Note box, text, and leader |
| `.pfc-proc-title` | Concurrent lane title |
| `.pfc-title` | Chart title |

Geometry constants (box sizes, gaps, chamfer/mark length, note width, loop channel) live
at the top of `src/layout.ts` and in the corner/plus constants in `src/render.ts`.

---

## Building from source

Requires Node 18+. All commands run from the **repository root**.

```bash
npm install
npm run build:obsidian   # type-checks (tsc) then bundles -> output/obsidian/
npm run dev              # watch-rebuild the Obsidian target
npm test                 # bundles and runs the parser/layout unit tests (node --test)
npm run lint             # eslint
npm run format           # prettier --write
```

The build writes `main.js`, `manifest.json`, and `styles.css` into `output/obsidian/`.

Source layout (shared core + Obsidian adapter):

- `pfc-source/core/src/parser.ts` — text DSL → chart model
- `pfc-source/core/src/layout.ts` — deterministic top-to-bottom layout (no external layout library)
- `pfc-source/core/src/render.ts` — chart model → themed SVG
- `pfc-source/core/src/index.ts` — the `@pfc/core` public surface
- `pfc-source/obsidian/src/main.ts` — Obsidian `registerMarkdownCodeBlockProcessor("pfc", …)`

---

## Architecture

Three stages, mirroring how Mermaid works:

1. **Parse** — `parsePfc(source)` turns the DSL into a tree of typed nodes
   (steps, transitions, allocations, branch blocks, concurrent processes).
2. **Layout** — `layoutChart(chart)` walks the tree and assigns absolute coordinates,
   producing flat lists of primitives (boxes, lines, bars, ellipses, tabs, notes, loop
   paths). Text is measured with a canvas so boxes size to their labels.
3. **Render** — `renderChart(chart)` builds an SVG DOM element from the layout,
   using CSS classes so all theming comes from `styles.css`.

Only `main.ts` depends on Obsidian; the parser, layout, and renderer live in the shared
`@pfc/core` package with no host dependencies, which makes porting the core to another
host (e.g. a VS Code webview or a Fumadocs component) mostly a packaging exercise.

---

## Known limitations

- **Concurrent lanes** scale to any number of lanes: each lane loops back through its own
  channel in the gutter immediately to its right, and its drawn `goto`s route in that same
  gutter, so the routing stays local and never overlaps a neighbouring lane. Sync/transfer
  connectors between adjacent lanes cross that gutter and hop over the loop channel.
- **Sync/transfer connectors** route as horizontal → vertical → horizontal. Two
  connectors crossing the same gap run their vertical segments near each other.
- **Notes** render on the right of an element. In a concurrent left lane that places them
  in the inter-lane gap; the dashed sync line draws on top (visible) but may overlap the
  note box.
- **Loop-back** returns to the start of the chart/lane. To return to a *specific* earlier
  step on a condition, use `goto <step-id>` instead.
- Each `process` in a `concurrent` block always loops (no run-once lane yet).

---

## Symbol coverage (ISA-88 Figure 7)

All symbols in the S88.02 PFC symbol key (Figure 7) are supported:

- Begin / End placeholders (triangles)
- Step levels via corner diagonals (phase, operation, unit procedure, procedure)
- `+` "contains a lower-level PFC"
- Directed link (implicit transition) and explicit transition (two lines + condition)
- Sequence selection (single bars) and simultaneous sequence (double bars)
- Allocation (ellipse)
- Synchronization point + line, and material-transfer arrow
