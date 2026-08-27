// Turns a parsed chart into a themed SVG DOM element.

import { PfcChart, Level } from "./parser";
import { layoutChart, Layout } from "./layout";

const SVGNS = "http://www.w3.org/2000/svg";

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
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

  // connectors first (so nodes sit on top)
  for (const ln of L.lines) {
    svg.appendChild(svgEl("line", { x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2, class: "pfc-line" }));
  }

  // divergence / convergence bars
  for (const b of L.bars) {
    svg.appendChild(svgEl("line", { x1: b.x1, y1: b.y, x2: b.x2, y2: b.y, class: "pfc-bar" }));
    if (b.double)
      svg.appendChild(svgEl("line", { x1: b.x1, y1: b.y + b.gap, x2: b.x2, y2: b.y + b.gap, class: "pfc-bar" }));
  }

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

  // loop-back path + arrowhead re-entering the first element
  if (L.loopPath) {
    svg.appendChild(
      svgEl("polyline", { points: L.loopPath.map((p) => p.join(",")).join(" "), class: "pfc-loop" })
    );
  }
  if (L.loopArrow) {
    const { cx, y } = L.loopArrow;
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

  return svg;
}
