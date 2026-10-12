import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePfc, ParseError } from "../src/parser.ts";
import type { PfcNode, StepNode } from "../src/parser.ts";

function steps(nodes: PfcNode[]): StepNode[] {
  return nodes.filter((n): n is StepNode => n.kind === "step");
}

test("parses a linear chart with title and default terminals", () => {
  const c = parsePfc(`pfc Simple\nstep "Charge" :operation\ntrans "ready"\nstep "Heat"`);
  assert.equal(c.title, "Simple");
  assert.equal(c.terminals, true);
  assert.equal(c.loop, false);
  assert.equal(c.body.length, 3);
  assert.equal(c.body[0].kind, "step");
  assert.equal(c.body[1].kind, "trans");
});

test("levels and modifiers parse from either side of the label", () => {
  const c = parsePfc(`step + initial "Master" :procedure`);
  const s = steps(c.body)[0];
  assert.equal(s.label, "Master");
  assert.equal(s.level, "procedure");
  assert.equal(s.initial, true);
  assert.equal(s.encapsulates, true);
});

test("level aliases resolve", () => {
  assert.equal(steps(parsePfc(`step "a" :op`).body)[0].level, "operation");
  assert.equal(steps(parsePfc(`step "a" :up`).body)[0].level, "unitprocedure");
  assert.equal(steps(parsePfc(`step "a" :unit`).body)[0].level, "unitprocedure");
  assert.equal(steps(parsePfc(`step "a" :proc`).body)[0].level, "procedure");
  assert.equal(steps(parsePfc(`step "a"`).body)[0].level, "phase");
});

// C1: a ':level'-looking token inside a quoted label must not become the level
test("C1: level token inside label is not extracted", () => {
  const s = steps(parsePfc(`step "Cool :op mode"`).body)[0];
  assert.equal(s.label, "Cool :op mode");
  assert.equal(s.level, "phase");
});

test("C1: level still parses from an unquoted label", () => {
  const s = steps(parsePfc(`step Bare :operation`).body)[0];
  assert.equal(s.level, "operation");
});

test("step id is captured", () => {
  const s = steps(parsePfc(`step HEAT "Heat" :operation`).body)[0];
  assert.equal(s.id, "HEAT");
  assert.equal(s.label, "Heat");
});

// C4: a second title line is a hard error rather than a silent overwrite
test("C4: duplicate pfc title line errors", () => {
  assert.throws(() => parsePfc(`pfc One\nstep "a"\npfc Two`), (e: unknown) => {
    assert.ok(e instanceof ParseError);
    assert.match(e.message, /duplicate 'pfc' title/);
    return true;
  });
});

test("directives: no-terminals and loop", () => {
  assert.equal(parsePfc(`no-terminals\nstep "a"`).terminals, false);
  assert.equal(parsePfc(`terminals off\nstep "a"`).terminals, false);
  assert.equal(parsePfc(`loop\nstep "a"`).loop, true);
  assert.equal(parsePfc(`cycle\nstep "a"`).loop, true);
  assert.equal(parsePfc(`step "a"`).uniformWidth, false);
  assert.equal(parsePfc(`uniform-width\nstep "a"`).uniformWidth, true);
  assert.equal(parsePfc(`uniform\nstep "a"`).uniformWidth, true);
});

test("parallel requires two non-empty branches", () => {
  assert.throws(
    () => parsePfc(`parallel\nbranch\nstep "a"\nend`),
    /at least two 'branch'/
  );
  assert.throws(
    () => parsePfc(`parallel\nbranch\nbranch\nstep "b"\nend`),
    /empty branch/
  );
  const ok = parsePfc(`parallel\nbranch\nstep "a"\nbranch\nstep "b"\nend`);
  assert.equal(ok.body[0].kind, "parallel");
});

test("goto resolves target label and rejects unknown target", () => {
  const c = parsePfc(`step HEAT "Heat"\nstep "Check"\nselective\nbranch\ntrans "ok"\nstep "Go"\nbranch\ntrans "no"\ngoto HEAT\nend`);
  assert.throws(() => parsePfc(`step "a"\ngoto NOPE`), /not a step id/);
  assert.ok(c.body.some((n) => n.kind === "selective"));
});

// C5: a stray line where a 'process' is expected points at the offending line
test("C5: stray line in concurrent gives a precise error", () => {
  assert.throws(
    () => parsePfc(`concurrent\nstep "x"\nprocess "B"\nstep "b"\nend`),
    (e: unknown) => {
      assert.ok(e instanceof ParseError);
      assert.match(e.message, /unexpected 'step "x"' in 'concurrent' \(expected 'process' or 'end'\)/);
      return true;
    }
  );
});

test("concurrent needs two non-empty processes and must be the whole chart", () => {
  assert.throws(() => parsePfc(`concurrent\nprocess "A"\nstep "a"\nend`), /at least two 'process'/);
  assert.throws(() => parsePfc(`step "x"\nconcurrent\nprocess "A"\nstep "a"\nprocess "B"\nstep "b"\nend`), /only thing in the chart/);
});

// C2: a marker id must be used exactly twice
test("C2: unpaired marker errors", () => {
  assert.throws(
    () => parsePfc(`step "a"\nsync S1`),
    /marker 'S1' must be used exactly twice \(found 1\)/
  );
});

test("C2: three markers with same id errors", () => {
  assert.throws(
    () => parsePfc(`parallel\nbranch\nstep "a"\nsync S1\nbranch\nstep "b"\nsync S1\nbranch\nstep "c"\nsync S1\nend`),
    /found 3/
  );
});

test("valid sync pair parses", () => {
  const c = parsePfc(`parallel\nbranch\nstep "a"\nsync S1\nbranch\nstep "b"\nsync S1\nend`);
  assert.equal(c.body[0].kind, "parallel");
});

// C3: a transfer pair must be exactly one out and one in
test("C3: transfer with two 'out' errors", () => {
  assert.throws(
    () => parsePfc(`parallel\nbranch\nstep "a"\ntransfer T1 out\nbranch\nstep "b"\ntransfer T1 out\nend`),
    /transfer 'T1' needs exactly one 'out' and one 'in'/
  );
});

test("C3: valid transfer pair parses", () => {
  const c = parsePfc(`parallel\nbranch\nstep "a"\ntransfer T1 out\nbranch\nstep "b"\ntransfer T1 in\nend`);
  assert.equal(c.body[0].kind, "parallel");
});

test("transfer requires a direction", () => {
  assert.throws(() => parsePfc(`step "a"\ntransfer T1`), /needs a direction/);
});

test("marker must follow a step or allocation", () => {
  assert.throws(() => parsePfc(`sync S1`), /must come right after a step or allocation/);
});

test("note must follow a step or allocation and carries text", () => {
  const c = parsePfc(`step "a"\nnote "hello world"`);
  const s = steps(c.body)[0];
  assert.equal(s.note, "hello world");
  assert.throws(() => parsePfc(`note "orphan"`), /must come right after a step or allocation/);
});

test("comments and blank lines are ignored", () => {
  const c = parsePfc(`# heading\nstep "a" // trailing\n\nstep "b"`);
  assert.equal(steps(c.body).length, 2);
});

test("empty chart errors", () => {
  assert.throws(() => parsePfc(`# only a comment`), /chart is empty/);
});
