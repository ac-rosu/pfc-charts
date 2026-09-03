import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePfc } from "../src/parser.ts";
import { renderChartToString } from "../src/renderString.ts";

test("renders a standalone <svg> string with dimensions", () => {
  const svg = renderChartToString(parsePfc(`pfc T\nstep "a"\ntrans "x"\nstep "b"`));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /width="\d+"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /class="pfc-step-rect"/);
});

test("escapes text content (no raw markup injection)", () => {
  const svg = renderChartToString(parsePfc(`pfc T\nstep "a<b>&c"`));
  assert.ok(!svg.includes("<b>"), "raw tag must not appear");
  assert.match(svg, /a&lt;b&gt;&amp;c/);
});

test("renders every construct without throwing", () => {
  const svg = renderChartToString(
    parsePfc(`pfc All
step S1 "s" :operation +
alloc "Tank"
parallel
branch
step "p1"
sync S
branch
step "p2"
sync S
end
selective
branch
trans "x"
step "q1"
branch
trans "y"
goto S1
end`)
  );
  assert.match(svg, /class="pfc-alloc"/);
  assert.match(svg, /class="pfc-sync"/);
  assert.ok(svg.length > 100);
});
