// Turns a parsed chart into a themed SVG DOM element.

import { PfcChart, Level } from "./parser";
import { layoutChart, Layout } from "./layout";

const SVGNS = "http://www.w3.org/2000/svg";

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

// ---- line jumpovers ---------------------------------------------------------
// Horizontal connectors hop over vertical ones where they truly cross (the
// intersection is interior to both segments — T-junctions where a link connects
// to a bar are left alone).
interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cls: string;
  hops: number[];
}
const HOP_R = 5;
const XPS = 1.5; // endpoint exclusion

const isH = (s: Seg) => s.y1 === s.y2 && s.x1 !== s.x2;
const isV = (s: Seg) => s.x1 === s.x2 && s.y1 !== s.y2;

function polySegs(points: Array<[number, number]>, cls: string): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    out.push({ x1, y1, x2, y2, cls, hops: [] });
  }
  return out;
}

function computeHops(all: Seg[]): void {
  const hs = all.filter(isH);
  const vs = all.filter(isV);
  for (const h of hs) {
    const y = h.y1;
    const lo = Math.min(h.x1, h.x2);
    const hi = Math.max(h.x1, h.x2);
    for (const v of vs) {
      const vx = v.x1;
      const vlo = Math.min(v.y1, v.y2);
      const vhi = Math.max(v.y1, v.y2);
      if (vx > lo + XPS && vx < hi - XPS && y > vlo + XPS && y < vhi - XPS) h.hops.push(vx);
    }
    h.hops.sort((a, b) => a - b);
  }
}

// draw one segment, inserting little arcs where a horizontal segment hops
function drawSeg(svg: SVGElement, s: Seg): void {
  if (!isH(s) || s.hops.length === 0) {
    svg.appendChild(svgEl("line", { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: s.cls }));
    return;
  }
  const y = s.y1;
  const left = Math.min(s.x1, s.x2);
  const right = Math.max(s.x1, s.x2);
  let d = `M ${left} ${y}`;
  for (const hx of s.hops) {
    if (hx <= left + HOP_R || hx >= right - HOP_R) continue;
    d += ` L ${hx - HOP_R} ${y} A ${HOP_R} ${HOP_R} 0 0 0 ${hx + HOP_R} ${y}`;
  }
  d += ` L ${right} ${y}`;
  svg.appendChild(svgEl("path", { d, class: s.cls, fill: "none" }));
}

type Corner = "tl" | "tr" | "bl" | "br";

// Level is shown by small diagonal lines drawn *across* the corners of an
// otherwise square rectangle (Figure 7). Corners fill in the order
// top-left, top-right, bottom-right, bottom-left:
//   phase = 1 (TL), operation = 2 (TL,TR), unit procedure = 3 (TL,TR,BR),
//   procedure = 4 (all). The "+" encapsulation mark sits in the top-right corner.
const LEVEL_MARKS: Record<Level, number> = {
  phase: 1,
  operation: 2,
  unitprocedure: 3,
  procedure: 4,
};
const LEVEL_ORDER: Corner[] = ["tl", "tr", "br", "bl"];
const MARK = 16; // length of a corner diagonal along each edge

function markLine(corner: Corner, x: number, y: number, w: number, h: number): Record<string, number> {
  const m = MARK;
  switch (corner) {
    case "tl":
      return { x1: x, y1: y + m, x2: x + m, y2: y };
    case "tr":
      return { x1: x + w - m, y1: y, x2: x + w, y2: y + m };
    case "bl":
      return { x1: x, y1: y + h - m, x2: x + m, y2: y + h };
    case "br":
      return { x1: x + w - m, y1: y + h, x2: x + w, y2: y + h - m };
  }
}

export function renderChart(chart: PfcChart): SVGElement {
  const L: Layout = layoutChart(chart);

  const svg = svgEl("svg", {
    class: "pfc-svg",
    width: Math.ceil(L.width),
    height: Math.ceil(L.height),
    viewBox: `0 0 ${Math.ceil(L.width)} ${Math.ceil(L.height)}`,
    xmlns: SVGNS,
  });

  // title
  if (L.title) {
    const t = svgEl("text", {
      x: L.width / 2,
      y: L.titleY,
      class: "pfc-title",
      "text-anchor": "middle",
      "font-size": L.titleFont,
      "font-family": L.fontFamily,
    });
    t.textContent = L.title;
    svg.appendChild(t);
  }

  // note callouts — drawn first so connectors (esp. dashed sync lines) stay on top
  for (const nt of L.notes) {
    svg.appendChild(
      svgEl("line", { x1: nt.link[0], y1: nt.link[1], x2: nt.link[2], y2: nt.link[3], class: "pfc-note-link" })
    );
    svg.appendChild(svgEl("rect", { x: nt.x, y: nt.y, width: nt.w, height: nt.h, rx: 3, class: "pfc-note" }));
    nt.lines.forEach((line, k) => {
      const t = svgEl("text", {
        x: nt.x + 8,
        y: nt.y + 8 + nt.lineH / 2 + k * nt.lineH,
        class: "pfc-note-text",
        "text-anchor": "start",
        "dominant-baseline": "central",
        "font-size": 11,
        "font-family": L.fontFamily,
      });
      t.textContent = line;
      svg.appendChild(t);
    });
  }

  // collect all solid connector segments and compute their crossings once
  const lineSegs: Seg[] = L.lines.map((ln) => ({ ...ln, cls: "pfc-line", hops: [] }));
  const barSegs: Seg[] = [];
  for (const b of L.bars) {
    barSegs.push({ x1: b.x1, y1: b.y, x2: b.x2, y2: b.y, cls: "pfc-bar", hops: [] });
    if (b.double)
      barSegs.push({ x1: b.x1, y1: b.y + b.gap, x2: b.x2, y2: b.y + b.gap, cls: "pfc-bar", hops: [] });
  }
  const loopSegs: Seg[] = L.loops.flatMap((lp) => polySegs(lp.points, "pfc-loop"));
  const gotoSegs: Seg[] = L.gotoLinks.flatMap((g) => polySegs(g.points, "pfc-loop"));
  computeHops([...lineSegs, ...barSegs, ...loopSegs, ...gotoSegs]);

  // connectors first (so nodes sit on top)
  for (const s of lineSegs) drawSeg(svg, s);

  // divergence / convergence bars
  for (const s of barSegs) drawSeg(svg, s);

  // transitions
  for (const tr of L.transes) {
    // explicit transition: two short parallel lines crossing the link
    svg.appendChild(
      svgEl("line", { x1: tr.x - 15, y1: tr.y - 3, x2: tr.x + 15, y2: tr.y - 3, class: "pfc-trans-tick" })
    );
    svg.appendChild(
      svgEl("line", { x1: tr.x - 15, y1: tr.y + 3, x2: tr.x + 15, y2: tr.y + 3, class: "pfc-trans-tick" })
    );
    if (tr.condition) {
      const c = svgEl("text", {
        x: tr.x + 22,
        y: tr.y,
        class: "pfc-cond",
        "text-anchor": "start",
        "dominant-baseline": "central",
        "font-size": L.transFont,
        "font-family": L.fontFamily,
      });
      c.textContent = tr.condition;
      svg.appendChild(c);
    }
  }

  // steps
  for (const s of L.steps) {
    if (s.initial) {
      svg.appendChild(
        svgEl("rect", {
          x: s.x - 4,
          y: s.y - 4,
          width: s.w + 8,
          height: s.h + 8,
          class: "pfc-step-initial",
        })
      );
    }
    svg.appendChild(
      svgEl("rect", { x: s.x, y: s.y, width: s.w, height: s.h, class: "pfc-step-rect" })
    );

    // corner diagonals for the level, plus the top-right corner when encapsulating
    const corners = new Set<Corner>(LEVEL_ORDER.slice(0, LEVEL_MARKS[s.level]));
    if (s.encapsulates) corners.add("tr");
    for (const corner of LEVEL_ORDER) {
      if (corners.has(corner))
        svg.appendChild(svgEl("line", { ...markLine(corner, s.x, s.y, s.w, s.h), class: "pfc-corner" }));
    }

    // "+" nestled in the top-right corner triangle (between diagonal and corner)
    if (s.encapsulates) {
      const px = s.x + s.w - MARK * 0.4;
      const py = s.y + MARK * 0.4;
      const a = 3;
      svg.appendChild(svgEl("line", { x1: px - a, y1: py, x2: px + a, y2: py, class: "pfc-plus" }));
      svg.appendChild(svgEl("line", { x1: px, y1: py - a, x2: px, y2: py + a, class: "pfc-plus" }));
    }

    const label = svgEl("text", {
      x: s.x + s.w / 2,
      y: s.y + s.h / 2,
      class: "pfc-step-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": L.stepFont,
      "font-family": L.fontFamily,
    });
    label.textContent = s.label;
    svg.appendChild(label);
  }

  // begin / end terminals (placeholders): begin points down, end points up
  if (L.beginTri) {
    const { cx, top, w, h } = L.beginTri;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - w / 2},${top} ${cx + w / 2},${top} ${cx},${top + h}`,
        class: "pfc-terminal",
      })
    );
  }
  if (L.endTri) {
    const { cx, top, w, h } = L.endTri;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - w / 2},${top + h} ${cx + w / 2},${top + h} ${cx},${top}`,
        class: "pfc-terminal",
      })
    );
  }

  // loop-back paths + arrowheads (whole-chart loop, or per-process concurrent loops)
  for (const s of loopSegs) drawSeg(svg, s);
  for (const lp of L.loops) {
    const { cx, y } = lp.arrow;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - 5},${y - 9} ${cx + 5},${y - 9} ${cx},${y}`,
        class: "pfc-loop-arrow",
      })
    );
  }

  // allocation ellipses (equipment allocation) sit on the link
  for (const al of L.allocs) {
    svg.appendChild(
      svgEl("ellipse", { cx: al.cx, cy: al.cy, rx: al.w / 2, ry: al.h / 2, class: "pfc-alloc" })
    );
    const lbl = svgEl("text", {
      x: al.cx,
      y: al.cy,
      class: "pfc-alloc-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": L.stepFont,
      "font-family": L.fontFamily,
    });
    lbl.textContent = al.label;
    svg.appendChild(lbl);
  }

  // synchronization / material-transfer connectors (dashed), then the tabs
  for (const sl of L.syncLines) {
    svg.appendChild(
      svgEl("polyline", { points: sl.points.map((p) => p.join(",")).join(" "), class: "pfc-sync-line" })
    );
    if (sl.transfer) {
      const n = sl.points.length;
      const [px, py] = sl.points[n - 2];
      const [ex, ey] = sl.points[n - 1];
      const dx = ex - px;
      const dy = ey - py;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const bx = ex - 9 * ux;
      const by = ey - 9 * uy;
      const nx = -uy;
      const ny = ux;
      svg.appendChild(
        svgEl("polygon", {
          points: `${ex},${ey} ${bx + 4 * nx},${by + 4 * ny} ${bx - 4 * nx},${by - 4 * ny}`,
          class: "pfc-sync-arrow",
        })
      );
    }
  }
  for (const t of L.syncTabs) {
    svg.appendChild(svgEl("rect", { x: t.x, y: t.y, width: t.w, height: t.h, class: "pfc-sync" }));
    const lbl = svgEl("text", {
      x: t.x + t.w / 2,
      y: t.y + t.h / 2,
      class: "pfc-sync-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": 10,
      "font-family": L.fontFamily,
    });
    lbl.textContent = t.label;
    svg.appendChild(lbl);
  }

  // goto back-links (conditional jump to an earlier step)
  for (const s of gotoSegs) drawSeg(svg, s);
  for (const g of L.gotoLinks) {
    svg.appendChild(
      svgEl("polygon", {
        points: `${g.arrow.cx - 5},${g.arrow.y - 9} ${g.arrow.cx + 5},${g.arrow.y - 9} ${g.arrow.cx},${g.arrow.y}`,
        class: "pfc-loop-arrow",
      })
    );
    const lbl = svgEl("text", {
      x: g.labelX,
      y: g.labelY,
      class: "pfc-goto-label",
      "text-anchor": g.labelAnchor,
      "font-size": 11,
      "font-family": L.fontFamily,
    });
    lbl.textContent = "↑ " + g.label;
    svg.appendChild(lbl);
  }

  // goto jump chips (label-only jump to an earlier step)
  for (const c of L.gotoChips) {
    svg.appendChild(
      svgEl("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: c.h / 2, class: "pfc-goto-chip" })
    );
    const t = svgEl("text", {
      x: c.x + c.w / 2,
      y: c.y + c.h / 2,
      class: "pfc-goto-chip-text",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": 12,
      "font-family": L.fontFamily,
    });
    t.textContent = c.text;
    svg.appendChild(t);
  }

  // process lane titles (concurrent)
  for (const pt of L.processTitles) {
    const t = svgEl("text", {
      x: pt.cx,
      y: pt.y,
      class: "pfc-proc-title",
      "text-anchor": "middle",
      "font-size": 13,
      "font-family": L.fontFamily,
    });
    t.textContent = pt.label;
    svg.appendChild(t);
  }

  return svg;
}
