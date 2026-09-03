---
name: isa88-pfc-charts
description: Write ISA-88 (S88) Procedure Function Chart (PFC) diagrams as `pfc` code blocks for the PFC Charts Obsidian plugin. Use this whenever the user wants to draw, write, or edit a batch/recipe control chart, a procedure function chart, an SFC-style sequence, or asks about ISA-88 / S88 procedural control (procedures, unit procedures, operations, phases), simultaneous or selective sequences, equipment allocation, synchronization, material transfer, or a cyclic machine sequence — even if they don't say "PFC" explicitly. Also use it whenever a fenced ```pfc code block appears or should be produced.
---

# ISA-88 PFC Charts

This skill produces **Procedure Function Charts** (ISA-88 / IEC 61512, "S88") as text,
rendered by the *PFC Charts* Obsidian plugin. You write a fenced code block tagged
`pfc`; the plugin draws the diagram. Your job is to emit **correct `pfc` DSL** — you do
not render anything yourself.

Always wrap output in a `pfc` fence:

    ```pfc
    pfc My Chart
    step "Do a thing" :operation
    ```

## Mental model (ISA-88)

A PFC describes procedural control. Pick constructs by meaning:

- **step** — a procedural element. Its *level* (phase → operation → unit procedure →
  procedure) says how high in the ISA-88 hierarchy it sits. Consecutive steps with no
  transition between them are linked by an **implicit transition** (proceed when the
  step completes).
- **explicit transition** (`trans`) — a named condition that must be true to advance.
- **simultaneous sequence** (`parallel`) — AND-split: all branches run at once, and the
  join waits for every branch to finish. Drawn with double bars.
- **sequence selection** (`selective`) — OR-split: exactly one branch is taken based on
  its transition. Drawn with single bars.
- **allocation** (`alloc`) — equipment allocation (which tank/reactor), drawn as an
  ellipse on the link.
- **synchronization** (`sync`) — a rendezvous between two branches; both wait for each
  other. Use it for "wait until the other side is ready".
- **material transfer** (`transfer`) — a directed handoff of material from one branch to
  another (dashed arrow).
- **loop** — a single chart that cycles forever.
- **concurrent / process** — two or more *independent* looping lanes running at the same
  time, joined by sync/transfer. Use this for a machine whose main cycle repeats while a
  separate activity runs alongside and must not overlap itself.
- **goto** — a conditional jump back to an earlier step (retry / rework loop). Give the
  target step an id and `goto` that id under a transition.

If unsure between `parallel`+`loop` and `concurrent`: use `concurrent` when each activity
has its **own independent cycle** and they only meet at a rendezvous (e.g. "the main
cycle repeats, and operation N runs alongside; if the previous N isn't done, wait").
Use `parallel`+`loop` when the branches start and finish **together** each cycle.

## Syntax reference

One statement per line. Indentation is optional (structure comes from keywords).
Comments: a line starting with `#`, or `//` anywhere (rest of line ignored).

### Chart

- `pfc <title>` — optional title, first line. Omit for no title.
- `no-terminals` — hide the begin/end triangles (directive, anywhere).
- `loop` — make the whole chart a cycle; the end links back to the start. Removes the
  begin/end triangles. (Aliases: `loop back`, `cycle`.)

By default a normal chart shows a **begin** triangle (▽) at the top and an **end**
triangle (△) at the bottom. `loop` and `concurrent` replace these with the cycle links.

### Steps

```
step [ID] "Label" [:level] [initial] [+]
```

- `"Label"` is required (quote it if it contains spaces). `ID` is optional and only used
  as a name; flow is defined by order, not IDs.
- **Level** (drawn as diagonal marks across the box corners; the box stays square):
  - `:phase` (default) — 1 mark (top-left)
  - `:operation` / `:op` — 2 marks (top-left, top-right)
  - `:unitprocedure` / `:up` / `:unit` — 3 marks (adds bottom-right)
  - `:procedure` / `:proc` — 4 marks (all corners)
- `initial` — draw a double border (marks the initial step; optional, off by default).
- `+` (or `contains` / `encapsulates`) — the element **contains a lower-level PFC**;
  draws a "+" in the top-right corner. Independent of the level.

Modifiers may appear before or after the quoted label:
`step "Charge" :operation +` or `step + "Charge" :operation` both work.

### Transitions

- `trans "condition"` (alias `transition`) — an **explicit** transition: two short
  parallel lines with the condition beside them.
- **Implicit** transition: write nothing between two steps — the plain link means
  "advance when the preceding element completes."
- A `trans` with an empty condition (`trans ""`) draws the two lines with no text.

### Allocation

- `alloc "Label"` (alias `allocation`) — an equipment-allocation ellipse on the link,
  e.g. `alloc "Reactor 1 or 2"`.

### Branch blocks (parallel / selective)

```
parallel            # simultaneous sequence, double bars (AND)
  branch
    ...elements...
  branch
    ...elements...
end

selective           # sequence selection, single bars (OR)
  branch
    trans "route A"
    step "A" :phase
  branch
    trans "route B"
    step "B" :phase
end
```

Rules: at least **two** `branch` blocks; **no empty** branches. Branch blocks may be
nested arbitrarily. In a `selective`, each branch normally starts with the `trans` that
selects it.

### Synchronization & material transfer

These attach to the **step or allocation on the line above them**, and pair up by id
across branches (or across concurrent processes):

- `sync <id>` — a synchronization tab. The same `<id>` on another branch draws a dashed
  line between the two tabs (rendezvous; both sides wait).
- `transfer <id> out` and `transfer <id> in` — a material-transfer tab; draws a dashed
  **arrow** from the `out` side to the `in` side.

```
step "Sample" :operation
sync S1
...
step "Transfer to Reactor" :operation
transfer T1 out
```

Pair exactly two markers per id.

### Notes

- `note "text"` — a boxed annotation attached to the step or allocation above it, drawn
  to the side with a leader line. Text wraps automatically.

### Conditional jump (goto / retry loop)

Give a step an **id** (the bare word before its quoted label) and jump back to it:

```
step HEAT "Heat" :operation
...
step "Check" :operation
selective
  branch
    trans "temp reached"
    step "Proceed" :operation
  branch
    trans "not yet"
    goto HEAT
end
```

- `goto <id>` (alias `return`) marks a jump to the step with that id. By default it draws
  a compact **"↺ label" chip** naming the target (no wire — keeps charts uncluttered).
  **Prefer plain `goto <id>` (without `line`) as the default choice.** Only add `line`
  (`goto <id> line`) to draw the routed back-link wire when the user explicitly wants it.
- Put it under a `trans` — usually as one branch of a `selective` — so the jump is
  conditional and the other branch continues. An unknown target is an error.

### Concurrent processes (independent looping lanes)

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

- `concurrent` must be the **whole chart** (nothing else outside it) and cannot be
  nested. At least **two** `process` lanes, none empty; there is **no upper limit** —
  add as many lanes as you need.
- Each `process` is its own independent loop (no begin/end, no convergence). An optional
  quoted label after `process` is shown above the lane. Every lane loops back through its
  own channel in the gutter to its right, so the routing stays local no matter how many
  lanes there are.
- Connect lanes with `sync` / `transfer` exactly as inside `parallel`.

## Rules & common mistakes

- `parallel`, `selective`, and `concurrent` need **≥2** children and no empty ones —
  otherwise the plugin shows a parse error.
- `sync`, `transfer`, and `note` must come **directly after** a `step` or `alloc`.
- `goto <id>` targets a step's **id** (the bare word before its label, e.g.
  `step HEAT "Heat"`); the id must exist. Use it under a `trans` for a conditional retry.
- `transfer` requires a direction: `in` or `out`.
- `loop` and `no-terminals` both remove the begin/end triangles, so they can't be shown
  together with terminals. `concurrent` also has no terminals.
- Pick `selective` (OR) vs `parallel` (AND) by whether one path or all paths run.
- Prefer `concurrent` over `parallel`+`loop` when lanes cycle independently and only meet
  at a rendezvous (see the mental-model note above).
- Keep labels short; long labels widen boxes. Use `note` for detail.

## Workflow

1. Identify the procedural structure: is it a single pass, a cycle, alternative paths,
   simultaneous activities, or independent concurrent cycles?
2. Choose the top-level construct (linear, `parallel`, `selective`, `loop`, or
   `concurrent`).
3. Add steps with appropriate `:level`s and explicit `trans` where a real condition
   gates progress; leave links implicit otherwise.
4. Add `alloc`, `sync`/`transfer`, and `note` where they clarify the recipe.
5. Emit the `pfc` fenced block. Do not try to render or open Obsidian.

For a gallery of complete, copy-pasteable charts covering every construct (linear,
parallel, selective, nested, allocation, sync, transfer, loop, concurrent, notes, and an
all-features example), read `references/examples.md`.
