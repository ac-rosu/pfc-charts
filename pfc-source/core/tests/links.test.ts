import { test } from "node:test";
import assert from "node:assert/strict";
import { headingSlug, isExternalLink, resolveRelativePath, safeDecode, splitLink } from "../src/links.ts";
import { parsePfc } from "../src/parser.ts";
import { renderChartToString } from "../src/renderString.ts";
import { docsHref, pageHref } from "../../fumadocs/src/links.ts";
import { remarkPfc } from "../../fumadocs/src/remark.ts";

test("link helpers", () => {
  assert.equal(isExternalLink("https://example.com"), true);
  assert.equal(isExternalLink("mailto:a@b.c"), true);
  assert.equal(isExternalLink("charge.md"), false);
  assert.equal(isExternalLink("#phases"), false);
  assert.deepEqual(splitLink("react.md#Phases"), { path: "react.md", heading: "Phases" });
  assert.deepEqual(splitLink("#cool-operation"), { path: "", heading: "cool-operation" });
  assert.deepEqual(splitLink("charge"), { path: "charge", heading: "" });
  assert.equal(safeDecode("Cool%20Down.md"), "Cool Down.md");
  assert.equal(safeDecode("100%"), "100%", "malformed input is left alone");
  assert.equal(headingSlug("Cool operation"), "cool-operation");
  assert.equal(headingSlug(" Phases "), "phases");
  assert.equal(headingSlug("Heat to 80°C (fast)"), "heat-to-80c-fast");
});

test("relative paths resolve against the linking note's folder", () => {
  assert.equal(resolveRelativePath("units/reaction.md", "./charge.md"), "units/charge.md");
  assert.equal(resolveRelativePath("units/reaction.md", "../ops/charge.md"), "ops/charge.md");
  assert.equal(resolveRelativePath("reaction.md", "./charge.md"), "charge.md");
  assert.equal(resolveRelativePath("units/reaction.md", "charge.md"), "charge.md", "plain names unchanged");
});

test("docs-site hrefs: file links become page routes with heading slugs", () => {
  assert.equal(docsHref("charge.md"), "charge");
  assert.equal(docsHref("charge.mdx#Phases"), "charge#phases");
  assert.equal(docsHref("react.md#phases"), "react#phases");
  assert.equal(docsHref("#Cool operation"), "#cool-operation");
  assert.equal(docsHref("Cool%20Down.md"), "Cool%20Down", "already encoded stays encoded once");
  assert.equal(docsHref("Cool Down.md"), "Cool%20Down");
  assert.equal(docsHref("../ops/index.md"), "../ops/");
  assert.equal(docsHref("index.md"), "./");
  assert.equal(docsHref("/docs/units/charge"), "/docs/units/charge");
  assert.equal(docsHref("https://example.com/x.md"), "https://example.com/x.md", "external untouched");
});

test("linkHref maps the anchor's href", () => {
  const svg = renderChartToString(parsePfc(`step "Charge" :op\nlink "charge.md#Phases"`), {
    links: true,
    linkHref: docsHref,
  });
  assert.match(svg, /<a href="charge#phases" class="pfc-link"/);
});

test("page-relative hrefs: any folder depth, index pages, groups, trailing slashes", () => {
  const page = "content/docs/pfc-links/reaction.mdx";
  const cases: Array<[string, string, string]> = [
    // target, without trailing slash, with trailing slash
    ["charge.md", "charge", "../charge/"],
    ["./charge.mdx#Phases", "charge#phases", "../charge/#phases"],
    ["#cool-operation", "#cool-operation", "#cool-operation"],
    ["../units/react.md", "../units/react", "../../units/react/"],
    ["../../docs/equipment/reactor/charge.md", "../equipment/reactor/charge", "../../equipment/reactor/charge/"],
    ["index.md", "./", "../"],
    ["../index.md", "../", "../../"],
    ["Cool%20Down.md", "Cool%20Down", "../Cool%20Down/"],
    ["Cool Down.md", "Cool%20Down", "../Cool%20Down/"],
    ["/docs/x/y", "/docs/x/y", "/docs/x/y"],
    ["https://example.com", "https://example.com", "https://example.com"],
  ];
  for (const [target, plain, slashed] of cases) {
    assert.equal(pageHref(target, page), plain, `${target} (no trailing slash)`);
    assert.equal(pageHref(target, page, true), slashed, `${target} (trailing slash)`);
  }
  // an index page's URL is its folder
  assert.equal(pageHref("charge.md", "content/docs/pfc-links/index.mdx"), "pfc-links/charge");
  assert.equal(pageHref("charge.md", "content/docs/pfc-links/index.mdx", true), "charge/");
  // "(group)" folders don't appear in URLs
  assert.equal(pageHref("charge.md", "content/docs/(guides)/pfc-links/reaction.mdx"), "charge");
  assert.equal(pageHref("../../(ops)/equipment/charge.md", "content/docs/(guides)/pfc-links/reaction.mdx", true), "../../equipment/charge/");
});

test("remark plugin passes the page file and trailingSlash to each chart", () => {
  const tree = () => ({ type: "root", children: [{ type: "code", lang: "pfc", value: "step \"a\"" }] });
  const attrs = (t: { children: Array<{ attributes?: Array<{ name: string; value: unknown }> }> }) =>
    Object.fromEntries((t.children[0].attributes ?? []).map((a) => [a.name, a.value]));
  const file = { path: "/proj/content/docs/pfc-links/reaction.mdx", cwd: "/proj" };

  const t1 = tree();
  (remarkPfc({ trailingSlash: true }) as (t: unknown, f: unknown) => void)(t1, file);
  assert.deepEqual(attrs(t1), { source: 'step "a"', page: "content/docs/pfc-links/reaction.mdx", trailingSlash: null });

  // `remarkPlugins: [remarkPfc()]`: unified first calls the returned function without
  // a tree, and must get a transformer back
  const attached = (remarkPfc() as () => (t: unknown, f: unknown) => void)();
  const t2 = tree();
  attached(t2, file);
  assert.deepEqual(attrs(t2), { source: 'step "a"', page: "content/docs/pfc-links/reaction.mdx" });
});
