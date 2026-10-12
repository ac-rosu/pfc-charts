# Change Log

## 1.2.0

- New `link "target"` statement: put it after a step to make the step box clickable,
  opening the note with its lower-level chart (e.g. an operation's phases) in the
  Markdown preview. Targets are relative paths (`.md` optional) with an optional
  `#heading`. A linked step shows the `+` automatically.
- A phase is the lowest ISA-88 procedural level, so `+` or `link` on a phase (or on a
  step without a level, which is a phase) is now a parse error. Charts that put `+` on
  a phase need a higher level (e.g. `:operation`) or the `+` removed.
- The `+` mark is now centred in its corner triangle instead of overlapping the
  diagonal.

## 1.1.0

- New `uniform-width` chart directive (alias `uniform`): draws every step at the width
  of the widest step, and every allocation at the width of the widest allocation, for
  a uniform look. Off by default.
- `sync` / `transfer` connectors now route around steps, allocations, notes, and
  transition labels, and keep apart from one another instead of overlapping.
- A `note` on a step whose sync/transfer tab is on its right now moves to the left, so
  the connector no longer runs through it.
- Works in Restricted Mode (untrusted workspaces): the extension only renders chart
  text and runs no workspace code.

## 1.0.0

- Initial release.
- Render ISA-88 / IEC 61512 Procedure Function Charts from ` ```pfc ` fenced code
  blocks in the built-in Markdown preview, as themed inline SVG.
- Supports the full PFC DSL: steps and levels, explicit/implicit transitions,
  simultaneous (`parallel`) and selective (`selective`) sequences, allocation,
  synchronization, material transfer, notes, conditional `goto` jumps, whole-chart
  loops, and multi-lane `concurrent` processes.
- Charts follow the active VS Code color theme.
