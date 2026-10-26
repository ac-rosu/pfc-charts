import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePfc } from "../src/parser.ts";
import { renderChartToString } from "../src/renderString.ts";

test("sets a minimum width of 80% of the natural width", () => {
  const svg = renderChartToString(parsePfc(`parallel\nbranch\nstep "a"\nbranch\nstep "b"\nend`));
  const width = Number(/^<svg [^>]*width="(\d+)"/.exec(svg)![1]);
  const min = Number(/--pfc-min-width: (\d+)px/.exec(svg)![1]);
  assert.equal(min, Math.round(width * 0.8));
});

test("each step is a group tagged with its level", () => {
  const svg = renderChartToString(
    parsePfc(`step "p" :procedure\nstep "u" :up\nstep "o" :op\nstep "f"`)
  );
  for (const lvl of ["procedure", "unitprocedure", "operation", "phase"])
    assert.match(svg, new RegExp(`<g class="pfc-step pfc-lvl-${lvl}"><rect [^>]*class="pfc-step-rect"`));
});

test("use-colors tags the svg with pfc-colored", () => {
  assert.match(renderChartToString(parsePfc(`step "a"`)), /^<svg class="pfc-svg"/);
  assert.match(renderChartToString(parsePfc(`use-colors\nstep "a"`)), /^<svg class="pfc-svg pfc-colored"/);
});

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

test("linked steps get an HTML anchor overlay only when links are enabled", () => {
  const chart = `step "Charge" :operation\nlink "charge.md"\nstep "Cool"`;
  const off = renderChartToString(parsePfc(chart));
  assert.ok(!off.includes("foreignObject"), "no overlay by default");
  const on = renderChartToString(parsePfc(chart), { links: true });
  assert.equal(on.match(/<foreignObject /g)?.length, 1, "one overlay, for the linked step only");
  // an explicit </a>: HTML ignores a self-closing <a/>, which would swallow the rest of the SVG
  assert.match(on, /<foreignObject [^>]*class="pfc-link-area"[^>]*><a href="charge.md" class="pfc-link" title="[^"]*"><\/a><\/foreignObject>/);
});

test("link targets are attribute-escaped", () => {
  const svg = renderChartToString(parsePfc(`step "a" :op\nlink "x.md?a=1&b=\\"2\\""`), { links: true });
  assert.match(svg, /href="x\.md\?a=1&amp;b=/);
});
