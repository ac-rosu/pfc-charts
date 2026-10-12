# PFC examples

Copy-pasteable `pfc` charts covering every construct. Each is a complete chart body;
wrap in a ` ```pfc ` fence when emitting.

## Contents

1. Linear sequence (levels, implicit vs explicit transitions)
2. Encapsulation and the initial step
3. Simultaneous sequence (parallel / AND)
4. Sequence selection (selective / OR)
5. Nested branches
6. Allocation ellipse
7. Synchronization and material transfer
8. Looping chart (single cycle)
9. Concurrent independent lanes
10. Notes and process titles
11. Conditional jump / retry loop (goto)
12. All-features example
13. Drill-down links between charts

---

## 1. Linear sequence

```
pfc Simple Batch
uniform-width
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat" :operation
step "Hold" :operation
trans "time elapsed"
step "Cool" :operation
```

`Heat`→`Hold` has no `trans` between them: that's an **implicit** transition (advance
when `Heat` finishes). The `trans` lines are **explicit** conditions.

## 2. Encapsulation and the initial step

```
pfc Levels
uniform-width
step "Master Recipe" :procedure + initial
step "Prepare" :unitprocedure +
step "Charge" :operation
step "Add Reagent" :phase
```

`:procedure` = 4 corner marks, `:unitprocedure` = 3, `:operation` = 2, `:phase` = 1.
`+` marks an element that contains a lower-level PFC. `initial` draws a double border.

## 3. Simultaneous sequence (parallel / AND)

```
pfc Charge and React
uniform-width
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
step "Discharge" :phase
```

All branches run together; the join waits for all of them.

## 4. Sequence selection (selective / OR)

```
pfc Quality Gate
uniform-width
step "Inspect" :operation
selective
  branch
    trans "quality OK"
    step "Package" :operation
  branch
    trans "off-spec"
    step "Rework" :unitprocedure
end
```

Exactly one branch is taken, chosen by its leading transition.

## 5. Nested branches

```
pfc Nested
uniform-width
step "Start" :phase
parallel
  branch
    selective
      branch
        trans "grade A"
        step "React Fast" :phase
      branch
        trans "grade B"
        step "React Slow" :phase
    end
  branch
    step "Monitor" :operation
end
step "Done" :phase
```

## 6. Allocation ellipse

```
pfc Allocation
uniform-width
alloc "Tank A, B or C"
step "Preparation" :unitprocedure +
trans "prep done"
alloc "Reactor 1 or 2"
step "Reaction" :unitprocedure +
step "Discharge" :phase
```

## 7. Synchronization and material transfer

`sync`/`transfer` attach to the step (or `alloc`) above them and pair by id.

```
pfc Transfer and Sync
uniform-width
step "Batch Start" :phase
parallel
  branch
    step "Preparation" :unitprocedure +
    step "Sample" :operation
    sync S1
    trans "sample OK"
    step "Transfer to Reactor" :operation
    transfer T1 out
  branch
    alloc "Reactor 1 or 2"
    sync S1
    step "Receive from Prep" :operation
    transfer T1 in
    step "React" :unitprocedure +
end
step "Discharge" :phase
```

`S1` draws a plain dashed line (rendezvous); `T1` draws a dashed arrow from `out` to `in`.
Note that `sync S1` on the second branch attaches to the **allocation** ellipse.

## 8. Looping chart (single cycle)

```
pfc Welding Cell
uniform-width
parallel
  branch
    step "Manual Load" :operation
    step "Auto Load" :operation
    step "Welding" :operation
    step "Auto Unload" :operation
  branch
    step "Auto Load Outfeed" :operation
end
loop
```

`loop` removes the begin/end triangles and links the end back to the start. Here both
branches start and finish together each cycle.

## 9. Concurrent independent lanes

Use this when each activity has its **own** cycle and they only meet at a rendezvous —
e.g. a main cycle that repeats while another operation runs alongside and must not
overlap itself.

```
pfc Machine Cycle
uniform-width
concurrent
  process "Main Cycle"
    step "Operation 1" :operation
    step "Operation 2" :operation
    step "Operation 3" :operation
    step "Operation 4" :operation
    sync R
  process "Outfeed"
    step "Wait for cycle" :operation
    sync R
    step "Operation 5" :operation
end
```

The `R` sync is the rendezvous: the main lane, after Operation 4, meets the outfeed lane
at its wait point. If Operation 5 hasn't finished (the lane hasn't returned to _Wait_),
the main lane holds at `R`. Each lane loops independently.

Concurrent scales to any number of lanes — each loops back in its own right-hand gutter,
so lanes never overlap. A three-lane cell with a chain of rendezvous points:

```
pfc Three-Lane Cell
uniform-width
concurrent
  process "Infeed"
    step "Load" :operation
    sync A
  process "Weld"
    step "Receive" :operation
    sync A
    step "Weld" :operation
    sync B
  process "Outfeed"
    step "Wait" :operation
    sync B
    step "Unload" :operation
end
```

Each id (`A`, `B`) pairs exactly two tabs across adjacent lanes; the dashed connectors
cross the intervening loop channels.

## 10. Notes and process titles

```
pfc Annotated
uniform-width
step "Charge" :operation
note "Operator confirms the charge weight before proceeding"
trans "confirmed"
step "React" :unitprocedure +
note "Encapsulates the reaction operations at a lower level"
```

`process "label"` (in a `concurrent` block) shows a title above a lane; `note "text"`
attaches a boxed annotation to the step/alloc above it.

## 11. Conditional jump / retry loop (goto)

Give the target step an id (the bare word before its label) and jump back to it under a
transition. Here Heat repeats until the temperature is reached:

```
pfc Heat with Retry
uniform-width
step "Charge" :operation
step HEAT "Heat" :operation
step "Check Temperature" :operation
selective
  branch
    trans "temp >= 80C"
    step "Proceed" :operation
  branch
    trans "temp < 80C"
    goto HEAT
end
step "Discharge" :phase
```

The `temp < 80C` branch returns to `HEAT`; the `temp >= 80C` branch continues. By default
`goto` draws a compact **"↺ label" chip** (no wire) — this plain form is the preferred
default. Only add `line` — `goto HEAT line` — to draw the routed back-link wire when it's
explicitly wanted for a tight in-lane retry.

## 12. All-features example

```
pfc Full Example
uniform-width
// batch process: preparation transfers material to reaction
step "Start" :procedure + initial
trans "operator start"
parallel
  branch
    alloc "Tank A, B or C"
    step "Preparation" :unitprocedure +
    step "Charge" :operation
    step "Sample" :operation
    sync S1
    trans "sample OK"
    step "Transfer to Reactor" :operation
    transfer T1 out
  branch
    alloc "Reactor 1 or 2"
    sync S1
    trans "input = OK to start"
    step "Reaction" :unitprocedure +
    step "Receive from Prep" :operation
    transfer T1 in
    selective
      branch
        trans "grade A"
        step "React Fast" :phase
      branch
        trans "grade B"
        step "React Slow" :phase
    end
    step "Transfer to Storage" :operation
end
trans "batch complete"
selective
  branch
    trans "pass"
    step "Release" :operation
  branch
    trans "fail"
    step "Quarantine" :phase
end
step "Done" :phase
```

Covers: title, comment, begin/end terminals, initial step, all four levels, `+`
encapsulation, allocation, explicit and implicit transitions, simultaneous sequence with
a nested sequence selection, a top-level sequence selection, synchronization,
material transfer, and `uniform-width`.

## 13. Drill-down links between charts

A unit procedure whose operations open their own charts. `reaction.md`:

```
pfc Reaction
step "Charge" :operation
link "charge.md"
step "React" :operation
link "react.md#phases"
step "Cool" :operation
link "#cool-operation"
step "Discharge" :operation
```

`charge.md` then holds the Charge operation's phases:

```
pfc Charge
step "Open Inlet Valve" :phase
step "Dose Water" :phase
trans "level >= 500L"
step "Close Inlet Valve" :phase
```

Each `link` adds the `+` to its step. `React` jumps to the `## Phases` heading in
`react.md`; `Cool` jumps to a `## Cool operation` heading in the same note. `Discharge`
has no lower-level chart, so it has no `link` and no `+`. Phases are never linked.
