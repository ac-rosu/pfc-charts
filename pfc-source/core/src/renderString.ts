// Server-side SVG string renderer.
//
// Reuses the exact DOM renderer (`renderChart`) by swapping in a tiny
// element-recording shim for `document`, then serialising the tree to markup.
// This keeps a single source of truth for the drawing while allowing the core
// to render without a real DOM (e.g. a VS Code markdown-it plugin or a
// Fumadocs remark/rehype build step). Text is measured with the layout's
// length-based fallback (no canvas), so output is deterministic.

import { PfcChart } from "./parser";
import { renderChart, RenderOptions } from "./render";

interface El {
  tag: string;
  attrs: Record<string, string>;
  children: El[];
  text: string | null;
}

interface Node {
  _el: El;
  setAttribute(k: string, v: string): void;
  appendChild(child: Node): Node;
  textContent: string;
}

function makeNode(tag: string): Node {
  const el: El = { tag, attrs: {}, children: [], text: null };
  return {
    _el: el,
    setAttribute(k, v) {
      el.attrs[k] = String(v);
    },
    appendChild(child) {
      el.children.push(child._el);
      return child;
    },
    set textContent(v: string) {
      el.text = v;
    },
    get textContent() {
      return el.text ?? "";
    },
  };
}

function shimDocument() {
  return {
    createElementNS: (_ns: string, tag: string) => makeNode(tag),
    // layout probes for a canvas; returning no 2d context forces its
    // length-based text-width fallback (deterministic).
    createElement: () => ({ getContext: () => null }),
  };
}

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escText(s).replace(/"/g, "&quot;");
}

function serialize(el: El): string {
  const attrs = Object.keys(el.attrs)
    .map((k) => ` ${k}="${escAttr(el.attrs[k])}"`)
    .join("");
  if (el.text != null) return `<${el.tag}${attrs}>${escText(el.text)}</${el.tag}>`;
  if (el.children.length === 0) return `<${el.tag}${attrs}/>`;
  return `<${el.tag}${attrs}>${el.children.map(serialize).join("")}</${el.tag}>`;
}

/** Render a parsed chart to a standalone SVG markup string. */
export function renderChartToString(chart: PfcChart, opts: RenderOptions = {}): string {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = shimDocument();
  try {
    const root = renderChart(chart, opts) as unknown as { _el: El };
    return serialize(root._el);
  } finally {
    g.document = prev;
  }
}
