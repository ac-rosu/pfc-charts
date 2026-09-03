import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePfc } from "../src/parser.ts";
import { layoutChart } from "../src/layout.ts";

// Minimal DOM shim so layout's canvas text measurement falls back deterministically
// (getContext returns null -> textWidth uses its length-based estimate). Set before
// any layoutChart() call; the layout module only touches document lazily.
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ getContext: () => null }),
};

test("linear chart lays out with terminals", () => {
  const L = layoutChart(parsePfc(`pfc T\nstep "a"\ntrans "x"\nstep "b"`));
  assert.ok(L.width > 0 && L.height > 0);
  assert.equal(L.steps.length, 2);
  assert.equal(L.transes.length, 1);
  assert.ok(L.beginTri);
  assert.ok(L.endTri);
});

test("loop chart drops terminals and adds a loop path", () => {
  const L = layoutChart(parsePfc(`loop\nstep "a"\nstep "b"`));
  assert.equal(L.beginTri, null);
  assert.equal(L.endTri, null);
  assert.equal(L.loops.length, 1);
});

test("parallel produces two bars", () => {
  const L = layoutChart(parsePfc(`parallel\nbranch\nstep "a"\nbranch\nstep "b"\nend`));
  // a parallel block draws double bars top and bottom -> 4 bar segments
  assert.ok(L.bars.length >= 2);
});

// R3: a three-lane concurrent chart still lays out (one loop per lane) without throwing
test("R3: three concurrent lanes lay out with three loops", () => {
  const src = `concurrent
process "A"
step "a1"
sync R
process "B"
step "b1"
process "C"
step "c1"
sync R
end`;
  const L = layoutChart(parsePfc(src));
  assert.equal(L.loops.length, 3);
  assert.ok(L.width > 0 && L.height > 0);
});

// R1: a very long unbroken word in a note is hard-broken across lines
test("R1: long unbroken note word wraps to multiple lines", () => {
  const longWord = "x".repeat(80);
  const L = layoutChart(parsePfc(`step "a"\nnote "${longWord}"`));
  assert.equal(L.notes.length, 1);
  assert.ok(L.notes[0].lines.length > 1, "expected the long word to be broken across lines");
});
