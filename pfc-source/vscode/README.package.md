# PFC Charts (ISA-88)

Render **ISA-88 / IEC 61512 Procedure Function Charts** from ` ```pfc ` fenced code
blocks directly in the VS Code **Markdown preview** — themed inline SVG, no external
services, Mermaid-style.

````markdown
```pfc
pfc Simple Batch
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat" :operation
step "Hold" :operation
trans "time elapsed"
step "Cool" :operation
```
````

Open any Markdown file and run **Markdown: Open Preview** (`Ctrl+Shift+V`, or
`Ctrl+K V` for side-by-side). Every ` ```pfc ` block renders as a chart that follows
your active color theme.

## Features

- **Full PFC language** — steps with ISA-88 levels (phase → operation → unit procedure →
  procedure), explicit and implicit transitions, and encapsulation.
- **Structured sequences** — simultaneous (`parallel`, AND) and selective (`selective`,
  OR) branch blocks, arbitrarily nested.
- **Coordination** — equipment `alloc`ation, `sync` (rendezvous) and `transfer`
  (material handoff) connectors between branches or lanes.
- **Cycles & jumps** — whole-chart `loop`, conditional `goto` retries, and multi-lane
  `concurrent` processes that each loop independently.
- **Notes** — boxed annotations attached to any step.
- **Theme-aware** — colors map onto VS Code theme variables (light / dark /
  high-contrast).

## Syntax at a glance

| Construct | Example |
| --- | --- |
| Step + level | `step "Charge" :operation` |
| Explicit transition | `trans "level >= 500L"` |
| Simultaneous (AND) | `parallel` … `branch` … `end` |
| Selective (OR) | `selective` … `branch` … `end` |
| Allocation | `alloc "Reactor 1 or 2"` |
| Synchronization | `sync S1` (paired across branches) |
| Material transfer | `transfer T1 out` / `transfer T1 in` |
| Note | `note "operator confirms"` |
| Loop / retry | `loop` · `goto STEP_ID` |
| Concurrent lanes | `concurrent` … `process "Lane"` … `end` |
| Same-width boxes | `uniform-width` (anywhere in the chart) |

`sync`, `transfer`, and `note` attach to the step directly above them.

## Example — concurrent lanes

````markdown
```pfc
pfc Machine Cycle
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
````

## Notes

- Works entirely offline; no telemetry, no network calls.
- Charts render as inline SVG in the preview and export/print with the document.

## License

MIT
