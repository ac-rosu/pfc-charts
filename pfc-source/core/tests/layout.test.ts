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

test("steps size to their own label by default", () => {
  const L = layoutChart(parsePfc(`step "Charge the reactor vessel"\nstep "Hold"`));
  assert.ok(L.steps[0].w > L.steps[1].w);
});

test("uniform-width sizes every step and every alloc to the widest of its kind", () => {
  const src = `uniform-width
step "Charge the reactor vessel"
alloc "Reactor 1 or 2"
parallel
branch
step "Hold"
alloc "R"
branch
step "Agitate"
end`;
  const L = layoutChart(parsePfc(src));
  const widest = Math.max(...L.steps.map((s) => s.w));
  for (const s of L.steps) assert.equal(s.w, widest);
  assert.equal(L.allocs[0].w, L.allocs[1].w);
  // a step centered on its spine stays centered after widening
  for (const s of L.steps) assert.ok(s.x >= 0);
});

// sync/transfer connectors must not run through boxes or alongside each other, even
// when uniform-width squeezes the corridor between branches
test("sync connectors route around boxes and apart from each other", () => {
  const src = `uniform-width
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
end`;
  const L = layoutChart(parsePfc(src));
  assert.equal(L.syncLines.length, 2);
  const segs = L.syncLines.map((sl) =>
    sl.points.slice(1).map((p, i) => [sl.points[i][0], sl.points[i][1], p[0], p[1]])
  );
  // no segment enters a step box
  for (const line of segs)
    for (const [x1, y1, x2, y2] of line)
      for (const s of L.steps) {
        const hitX = Math.max(Math.min(x1, x2), s.x) < Math.min(Math.max(x1, x2), s.x + s.w);
        const hitY = Math.max(Math.min(y1, y2), s.y) < Math.min(Math.max(y1, y2), s.y + s.h);
        const along = x1 === x2 ? x1 > s.x && x1 < s.x + s.w : y1 > s.y && y1 < s.y + s.h;
        assert.ok(!(along && hitX && hitY), `connector runs through step "${s.label}"`);
      }
  // the two vertical legs keep their distance
  const [va, vb] = segs.map((line) => line[1]);
  assert.ok(Math.abs(va[0] - vb[0]) >= 12, "vertical legs run side by side");
});

// a note shares the right side with a sync tab only by colliding with its connector,
// so it moves to the free left side; notes elsewhere stay on the right
test("note moves left when a sync tab is on its element's right", () => {
  const src = `parallel
branch
step "Sample"
sync S1
note "Lab confirms the sample"
branch
step "Receive"
sync S1
note "Waits for the lab"
end
step "Done"
note "Plain note"`;
  const L = layoutChart(parsePfc(src));
  const step = (label: string) => L.steps.find((s) => s.label === label)!;
  const [left, right, plain] = L.notes;
  const sample = step("Sample");
  assert.ok(left.x + left.w <= sample.x, "Sample's note is left of Sample");
  assert.equal(left.link[0], sample.x, "leader leaves Sample's left edge");
  // Receive's tab faces left, toward Sample, so its note keeps the right side
  assert.ok(right.x >= step("Receive").x + step("Receive").w);
  assert.ok(plain.x >= step("Done").x + step("Done").w);
  // the flipped note stays inside the chart
  assert.ok(left.x >= 0);
  // and no connector runs through a note
  for (const sl of L.syncLines)
    for (const [x, y] of sl.points)
      for (const n of L.notes) assert.ok(!(x > n.x && x < n.x + n.w && y > n.y && y < n.y + n.h));
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

// R3: many lanes each loop back locally (to their right) without overlapping neighbours
test("R3: many concurrent lanes route locally without overlap", () => {
  const lanes = 6;
  let src = "concurrent\n";
  for (let i = 0; i < lanes; i++) src += `process "P${i}"\nstep "s${i}"\n`;
  src += "end";
  const L = layoutChart(parsePfc(src));
  assert.equal(L.loops.length, lanes);
  // loop points: [ [spine,bottom], [spine,botY], [channel,botY], ... ]
  const spines = L.loops.map((lp) => lp.points[0][0]);
  const channels = L.loops.map((lp) => lp.points[2][0]);
  for (let i = 1; i < lanes; i++) assert.ok(spines[i] > spines[i - 1], "lanes ordered left to right");
  for (let i = 0; i < lanes; i++) {
    assert.ok(channels[i] > spines[i], `lane ${i} loops back on its right`);
    if (i + 1 < lanes)
      assert.ok(channels[i] < spines[i + 1], `lane ${i} loop stays left of lane ${i + 1}`);
  }
});

// R3: a drawn goto inside a lane routes in that lane's own gutter, left of the next lane
test("R3: per-lane drawn goto stays within its lane's gutter", () => {
  const src = `concurrent
process "A"
step LA "a1"
trans "retry"
goto LA line
process "B"
step "b1"
end`;
  const L = layoutChart(parsePfc(src));
  assert.equal(L.loops.length, 2);
  assert.equal(L.gotoLinks.length, 1);
  const laneBspine = L.loops[1].points[0][0];
  const gotoChannel = L.gotoLinks[0].points[1][0];
  assert.ok(gotoChannel < laneBspine, "goto channel stays left of the next lane");
});


// R1: a very long unbroken word in a note is hard-broken across lines
test("R1: long unbroken note word wraps to multiple lines", () => {
  const longWord = "x".repeat(80);
  const L = layoutChart(parsePfc(`step "a"\nnote "${longWord}"`));
  assert.equal(L.notes.length, 1);
  assert.ok(L.notes[0].lines.length > 1, "expected the long word to be broken across lines");
});
