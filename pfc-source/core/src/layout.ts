// Deterministic top-to-bottom layout for PFC charts.
// Produces absolutely-positioned primitives; no external layout library.

import { PfcChart, PfcNode, Level, StepNode, AllocNode } from "./parser";

// ---- tunable geometry -------------------------------------------------------
const FONT = "sans-serif";
const STEP_FONT = 13;
const TRANS_FONT = 12;
const TITLE_FONT = 15;

const STEP_H = 44;
const STEP_MIN_W = 96;
const STEP_PAD_X = 16;

const TRANS_H = 30;
const TICK_HALF = 15;
const COND_GAP = 8;

const V_GAP = 24; // vertical connector length between elements
const BRANCH_GAP = 44; // horizontal gap between branch columns
const STUB = 16; // stub length around divergence/convergence bars
const BAR_DBL = 4; // spacing between the two lines of a simultaneous-sequence bar

const MARGIN = 24;
const TITLE_H = 34;

const TERM_W = 24; // begin/end triangle width
const TERM_H = 15; // begin/end triangle height
const TERM_GAP = 18; // stub between a terminal and the first/last element

const LOOP_GAP = 26; // horizontal offset of the loop-back channel from content
const LOOP_STUB = 20; // vertical clearance above/below the chart for the loop
const PROCESS_GAP = 46; // gap between concurrent process columns
const GOTO_H = 12; // vertical slot a goto occupies on the link
const GOTO_GAP = 26; // horizontal offset of a goto back-channel from content
const GOTO_STUB = 14; // clearance above the target step for the back-link
const CHIP_H = 26; // jump-label chip height
const CHIP_FONT = 12;
const CHIP_PAD = 12;
const PROC_TITLE_H = 24; // space above a process lane for its label
const PROC_TITLE_FONT = 13;

const NOTE_W = 150; // note callout box width
const NOTE_FONT = 11;
const NOTE_PAD = 8;
const NOTE_LINE_H = 15;
const NOTE_GAP = 22; // gap between element edge and note box
const NOTE_RESERVE = NOTE_W + NOTE_GAP + 6;

const SYNC_W = 26; // tab width (holds the id label)
const SYNC_H = 16; // tab height
const SYNC_RESERVE = 30; // horizontal room reserved beside a step that has markers
const SYNC_PAD = 8; // clearance a sync connector keeps from boxes, labels and solid lines
const SYNC_SPACING = 12; // minimum gap between two sync connectors running side by side
const SYNC_STUB = 14; // shortest horizontal leg out of a tab (room for a transfer arrowhead)

const ALLOC_H = 42; // allocation ellipse height
const ALLOC_MIN_W = 74; // allocation ellipse minimum width
const ALLOC_PAD_X = 22; // extra width around the label (ellipse needs more than a box)
// ----------------------------------------------------------------------------

export interface RStep {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  level: Level;
  initial: boolean;
  encapsulates: boolean;
  link: string; // "" = not linked
}
export interface RTrans {
  x: number; // spine
  y: number; // tick center
  condition: string;
}
export interface RAlloc {
  cx: number;
  cy: number;
  w: number;
  h: number;
  label: string;
}
export interface RBar {
  x1: number;
  x2: number;
  y: number;
  double: boolean;
  gap: number;
}
export interface RLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Layout {
  width: number;
  height: number;
  title: string;
  titleY: number;
  steps: RStep[];
  transes: RTrans[];
  allocs: RAlloc[];
  bars: RBar[];
  lines: RLine[];
  beginTri: { cx: number; top: number; w: number; h: number } | null;
  endTri: { cx: number; top: number; w: number; h: number } | null;
  loops: Array<{ points: Array<[number, number]>; arrow: { cx: number; y: number } }>;
  gotoLinks: Array<{
    points: Array<[number, number]>;
    arrow: { cx: number; y: number };
    label: string;
    labelX: number;
    labelY: number;
    labelAnchor: "start" | "end";
  }>;
  gotoChips: Array<{ x: number; y: number; w: number; h: number; text: string }>;
  processTitles: Array<{ cx: number; y: number; label: string }>;
  notes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    lines: string[];
    lineH: number;
    link: [number, number, number, number];
  }>;
  syncTabs: Array<{ x: number; y: number; w: number; h: number; label: string }>;
  syncLines: Array<{ points: Array<[number, number]>; transfer: boolean }>;
  stepFont: number;
  transFont: number;
  titleFont: number;
  fontFamily: string;
}

interface Measure {
  leftExt: number; // spine -> left edge
  rightExt: number; // spine -> right edge
  h: number;
  w?: number;
}

// text measurement via a shared canvas (works in Obsidian desktop + mobile DOM)
let _ctx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, px: number): number {
  if (!text) return 0;
  if (!_ctx) {
    const c = document.createElement("canvas");
    _ctx = c.getContext("2d");
  }
  if (!_ctx) return text.length * px * 0.6; // fallback
  _ctx.font = `${px}px ${FONT}`;
  return _ctx.measureText(text).width;
}

// measure caches, reset per layout pass (a measure depends on which side notes sit)
let mmap = new WeakMap<object, Measure>();
let smap = new WeakMap<object, Measure>(); // measure for a sequence (array)

// Elements whose note goes on the LEFT because a sync tab already occupies their right
// side. Notes default to the right. Set by layoutChart() between its two passes.
let noteLeft = new WeakSet<object>();

// horizontal room [left, right] an element reserves for its note callout
function noteReserve(node: StepNode | AllocNode): [number, number] {
  if (!node.note) return [0, 0];
  return noteLeft.has(node) ? [NOTE_RESERVE, 0] : [0, NOTE_RESERVE];
}

// `uniform-width` charts draw every step (and every allocation) at the width of the
// widest one. Set at the start of each layout pass, before anything is measured.
let uniformStepW = 0;
let uniformAllocW = 0;

function stepWidth(label: string): number {
  return Math.max(STEP_MIN_W, textWidth(label, STEP_FONT) + 2 * STEP_PAD_X, uniformStepW);
}

function allocWidth(label: string): number {
  return Math.max(ALLOC_MIN_W, textWidth(label, STEP_FONT) + 2 * ALLOC_PAD_X, uniformAllocW);
}

function setUniformWidths(chart: PfcChart): void {
  uniformStepW = 0;
  uniformAllocW = 0;
  if (!chart.uniformWidth) return;
  let stepW = 0;
  let allocW = 0;
  const walk = (nodes: PfcNode[]): void => {
    for (const nd of nodes) {
      if (nd.kind === "step") stepW = Math.max(stepW, stepWidth(nd.label));
      else if (nd.kind === "alloc") allocW = Math.max(allocW, allocWidth(nd.label));
      else if (nd.kind === "parallel" || nd.kind === "selective") nd.branches.forEach(walk);
      else if (nd.kind === "concurrent") nd.processes.forEach((p) => walk(p.body));
    }
  };
  walk(chart.body);
  uniformStepW = stepW;
  uniformAllocW = allocW;
}

// wrap text to fit a pixel width
function wrapText(text: string, px: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    // a single word that cannot fit on its own line is broken between characters
    if (textWidth(word, px) > maxW) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      let chunk = "";
      for (const ch of word) {
        if (chunk && textWidth(chunk + ch, px) > maxW) {
          lines.push(chunk);
          chunk = "";
        }
        chunk += ch;
      }
      cur = chunk;
      continue;
    }
    const trial = cur ? cur + " " + word : word;
    if (textWidth(trial, px) <= maxW || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

// attach a note callout to the right (or, when `left`, the left) edge of an element
// box (sx,sy,sw,sh)
function emitNote(
  out: Layout,
  note: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  left: boolean
): void {
  const lines = wrapText(note, NOTE_FONT, NOTE_W - 2 * NOTE_PAD);
  const h = lines.length * NOTE_LINE_H + 2 * NOTE_PAD;
  const x = left ? sx - NOTE_GAP - NOTE_W : sx + sw + NOTE_GAP;
  const y = sy + sh / 2 - h / 2;
  const cy = sy + sh / 2;
  out.notes.push({
    x,
    y,
    w: NOTE_W,
    h,
    lines,
    lineH: NOTE_LINE_H,
    link: left ? [sx, cy, x + NOTE_W, cy] : [sx + sw, cy, x, cy],
  });
}

function measureNode(node: PfcNode): Measure {
  const cached = mmap.get(node);
  if (cached) return cached;
  let m: Measure;
  if (node.kind === "step") {
    const w = stepWidth(node.label);
    const reserve = node.markers.length ? SYNC_RESERVE : 0;
    const [noteL, noteR] = noteReserve(node);
    m = { leftExt: w / 2 + reserve + noteL, rightExt: w / 2 + reserve + noteR, h: STEP_H, w };
  } else if (node.kind === "trans") {
    const cw = textWidth(node.condition, TRANS_FONT);
    m = {
      leftExt: TICK_HALF,
      rightExt: TICK_HALF + (node.condition ? COND_GAP + cw : 0),
      h: TRANS_H,
    };
  } else if (node.kind === "alloc") {
    const w = allocWidth(node.label);
    const reserve = node.markers.length ? SYNC_RESERVE : 0;
    const [noteL, noteR] = noteReserve(node);
    m = { leftExt: w / 2 + reserve + noteL, rightExt: w / 2 + reserve + noteR, h: ALLOC_H, w };
  } else if (node.kind === "goto") {
    if (node.drawn) {
      m = { leftExt: 6, rightExt: 6, h: GOTO_H };
    } else {
      const w = textWidth("\u21BA  " + node.targetLabel, CHIP_FONT) + 2 * CHIP_PAD;
      m = { leftExt: w / 2, rightExt: w / 2, h: CHIP_H, w };
    }
  } else if (node.kind === "parallel" || node.kind === "selective") {
    const bms = node.branches.map(measureSeq);
    let x = 0;
    const spines: number[] = [];
    bms.forEach((bm) => {
      spines.push(x + bm.leftExt);
      x += bm.leftExt + bm.rightExt + BRANCH_GAP;
    });
    const totalW = x - BRANCH_GAP;
    const first = spines[0];
    const last = spines[spines.length - 1];
    const spine = (first + last) / 2;
    const maxH = Math.max(...bms.map((b) => b.h));
    const dbl = node.kind === "parallel" ? BAR_DBL : 0;
    m = {
      leftExt: spine,
      rightExt: totalW - spine,
      h: maxH + 4 * STUB + 2 * dbl,
    };
    (node as any)._spines = spines; // relative to block left edge
    (node as any)._bms = bms;
    (node as any)._spine = spine;
    (node as any)._maxH = maxH;
  } else {
    m = { leftExt: 0, rightExt: 0, h: 0 }; // concurrent handled at chart level
  }
  mmap.set(node, m);
  return m;
}

function measureSeq(seq: PfcNode[]): Measure {
  const cached = smap.get(seq);
  if (cached) return cached;
  let leftExt = 0;
  let rightExt = 0;
  let h = 0;
  seq.forEach((node, k) => {
    const nm = measureNode(node);
    leftExt = Math.max(leftExt, nm.leftExt);
    rightExt = Math.max(rightExt, nm.rightExt);
    if (k > 0) h += V_GAP;
    h += nm.h;
  });
  const m = { leftExt, rightExt, h };
  smap.set(seq, m);
  return m;
}

export function layoutChart(chart: PfcChart): Layout {
  noteLeft = new WeakSet();
  const out = layoutPass(chart);
  // A note sits to the right of its element, but if a sync tab landed there (the
  // partner is to the right), the connector would run through the note. Move such
  // notes to the free left side, and lay out again to make room for them there.
  const tabSides = ((out as any)._tabSides ?? new Map()) as Map<PfcNode, Set<"left" | "right">>;
  for (const [node, sides] of tabSides) {
    if ((node.kind === "step" || node.kind === "alloc") && node.note && sides.has("right") && !sides.has("left"))
      noteLeft.add(node);
  }
  return [...tabSides.keys()].some((n) => noteLeft.has(n)) ? layoutPass(chart) : out;
}

function layoutPass(chart: PfcChart): Layout {
  mmap = new WeakMap();
  smap = new WeakMap();
  const out: Layout = {
    width: 0,
    height: 0,
    title: chart.title,
    titleY: 0,
    steps: [],
    transes: [],
    allocs: [],
    bars: [],
    lines: [],
    beginTri: null,
    endTri: null,
    loops: [],
    gotoLinks: [],
    gotoChips: [],
    processTitles: [],
    notes: [],
    syncTabs: [],
    syncLines: [],
    stepFont: STEP_FONT,
    transFont: TRANS_FONT,
    titleFont: TITLE_FONT,
    fontFamily: FONT,
  };

  out.titleY = MARGIN + TITLE_FONT;
  setUniformWidths(chart);

  if (chart.body.length === 1 && chart.body[0].kind === "concurrent") {
    layoutConcurrent(chart.body[0] as any, out);
    return out;
  }

  const bodyM = measureSeq(chart.body);
  // Put the spine on the SVG centerline so the trunk is centered, giving both
  // sides equal room (right side carries the transition condition labels).
  const half = Math.max(bodyM.leftExt, bodyM.rightExt);
  // If the chart both loops (right channel) and has gotos, reserve a left gutter so
  // the goto back-links route on the opposite side and never crowd the loop.
  const gotoCount = countGotos(chart.body);
  const leftGutter = chart.loop && gotoCount > 0 ? (gotoCount + 1) * GOTO_GAP : 0;
  const rootSpine = MARGIN + leftGutter + half;

  // A looping chart is a cycle: no begin/end placeholders, and it needs vertical
  // clearance above the first element and below the last for the return channel.
  const showTerminals = chart.terminals && !chart.loop;
  const headerY = MARGIN + (chart.title ? TITLE_H : 0);
  let y = headerY + (chart.loop ? LOOP_STUB : 0);

  // begin terminal (single downward triangle) — one per chart, a placeholder
  if (showTerminals) {
    out.beginTri = { cx: rootSpine, top: y, w: TERM_W, h: TERM_H };
    y += TERM_H;
    out.lines.push({ x1: rootSpine, y1: y, x2: rootSpine, y2: y + TERM_GAP });
    y += TERM_GAP;
  }

  const firstY = y;
  let bottom = placeSeq(chart.body, rootSpine, firstY, out);

  // end terminal (single upward triangle) — all paths have converged by here
  if (showTerminals) {
    out.lines.push({ x1: rootSpine, y1: bottom, x2: rootSpine, y2: bottom + TERM_GAP });
    bottom += TERM_GAP;
    out.endTri = { cx: rootSpine, top: bottom, w: TERM_W, h: TERM_H };
    bottom += TERM_H;
  }

  out.width = 2 * half + 2 * MARGIN + leftGutter;

  // loop-back: exit the last element, route up the right channel, re-enter the top
  if (chart.loop) {
    const channelX = rootSpine + half + LOOP_GAP;
    out.loops.push(makeLoop(rootSpine, firstY, bottom, channelX));
    out.width = channelX + MARGIN;
    bottom += LOOP_STUB;
  }

  out.height = bottom + MARGIN;
  resolveGotos(out, leftGutter);
  pairSyncMarkers(out);
  return out;
}

// A rectangular loop-back route from an element bottom, out to a side channel,
// and back to the top of the first element (channelX may be left or right).
function makeLoop(
  spineX: number,
  firstY: number,
  bottom: number,
  channelX: number
): { points: Array<[number, number]>; arrow: { cx: number; y: number } } {
  const botY = bottom + LOOP_STUB;
  const topY = firstY - LOOP_STUB;
  return {
    points: [
      [spineX, bottom],
      [spineX, botY],
      [channelX, botY],
      [channelX, topY],
      [spineX, topY],
      [spineX, firstY],
    ],
    arrow: { cx: spineX, y: firstY },
  };
}

// Route each goto as a back-link from its origin, out to a side channel, and up
// into the top of the target step (merging with that step's incoming link).
// When leftGutter > 0 the gotos route on the LEFT in the reserved gutter (used when a
// whole-chart loop already occupies the right); otherwise they route on the right.
function resolveGotos(out: Layout, leftGutter: number): void {
  const gotos = ((out as any)._gotos ?? []) as Array<{ ox: number; oy: number; target: string }>;
  const pos = ((out as any)._stepPos ?? {}) as Record<string, { x: number; y: number }>;
  if (!gotos.length) return;

  if (leftGutter > 0) {
    gotos.forEach((g, i) => {
      const t = pos[g.target];
      if (!t) return;
      const ch = MARGIN + leftGutter - GOTO_GAP * (i + 1);
      const topY = t.y - GOTO_STUB;
      out.gotoLinks.push({
        points: [[g.ox, g.oy], [ch, g.oy], [ch, topY], [t.x, topY], [t.x, t.y]],
        arrow: { cx: t.x, y: t.y },
        label: g.target,
        labelX: g.ox - 8,
        labelY: g.oy - 6,
        labelAnchor: "end",
      });
    });
    return;
  }

  let ch = out.width - MARGIN + GOTO_GAP;
  for (const g of gotos) {
    const t = pos[g.target];
    if (!t) continue;
    const topY = t.y - GOTO_STUB;
    out.gotoLinks.push({
      points: [[g.ox, g.oy], [ch, g.oy], [ch, topY], [t.x, topY], [t.x, t.y]],
      arrow: { cx: t.x, y: t.y },
      label: g.target,
      labelX: g.ox + 8,
      labelY: g.oy - 6,
      labelAnchor: "start",
    });
    ch += GOTO_GAP;
  }
  out.width = Math.max(out.width, ch - GOTO_GAP + MARGIN);
}

// count goto nodes anywhere in the tree
function countGotos(nodes: PfcNode[]): number {
  let n = 0;
  for (const nd of nodes) {
    if (nd.kind === "goto") n += nd.drawn ? 1 : 0;
    else if (nd.kind === "parallel" || nd.kind === "selective") nd.branches.forEach((b) => (n += countGotos(b)));
    else if (nd.kind === "concurrent") nd.processes.forEach((p) => (n += countGotos(p.body)));
  }
  return n;
}

// Independent looping processes side by side, joined by synchronization lines.
// Each process is its own cyclic lane (no begin/end, no convergence). Every lane
// loops back through a dedicated channel in the gutter immediately to its right,
// and routes its own drawn gotos in that same gutter, so the routing stays local
// and never overlaps regardless of how many lanes there are.
function layoutConcurrent(node: { processes: Array<{ label: string; body: PfcNode[] }> }, out: Layout): void {
  const processes = node.processes;
  const pms = processes.map((p) => measureSeq(p.body));
  const hasTitles = processes.some((p) => p.label);
  const headerY = MARGIN + (out.title ? TITLE_H : 0);
  const titleBandY = headerY;
  const topY = headerY + (hasTitles ? PROC_TITLE_H : 0) + LOOP_STUB;

  // Lay lanes left to right. Each lane owns a right-hand gutter holding its loop
  // channel followed by its drawn-goto channels; the next lane starts past that gutter.
  const gotoCounts = processes.map((p) => countGotos(p.body));
  const spines: number[] = [];
  const loopChannels: number[] = [];
  const gotoChannels: number[][] = [];
  let x = MARGIN;
  pms.forEach((pm, i) => {
    const spine = x + pm.leftExt;
    spines.push(spine);
    const laneRight = spine + pm.rightExt;
    const loopCh = laneRight + LOOP_GAP;
    loopChannels.push(loopCh);
    const gch: number[] = [];
    for (let k = 0; k < gotoCounts[i]; k++) gch.push(loopCh + GOTO_GAP * (k + 1));
    gotoChannels.push(gch);
    const gutterEnd = (gch.length ? gch[gch.length - 1] : loopCh) + PROCESS_GAP;
    x = gutterEnd;
  });

  const gotoStore = ((out as any)._gotos ??= []) as Array<any>;
  const procGotos: Array<Array<{ ox: number; oy: number; target: string }>> = [];
  const bottoms = processes.map((proc, i) => {
    if (proc.label)
      out.processTitles.push({ cx: spines[i], y: titleBandY + PROC_TITLE_FONT, label: proc.label });
    const before = gotoStore.length;
    const b = placeSeq(proc.body, spines[i], topY, out);
    procGotos.push(gotoStore.slice(before));
    return b;
  });

  // each lane loops back through its own right-hand channel
  processes.forEach((_proc, i) => {
    out.loops.push(makeLoop(spines[i], topY, bottoms[i], loopChannels[i]));
  });

  // each lane's drawn gotos route through that lane's own goto channels (to its right)
  const pos = ((out as any)._stepPos ?? {}) as Record<string, { x: number; y: number }>;
  procGotos.forEach((gs, i) => {
    let drawn = 0;
    gs.forEach((g) => {
      const t = pos[g.target];
      if (!t) return;
      const ch = gotoChannels[i][drawn++] ?? loopChannels[i] + GOTO_GAP;
      const topYt = t.y - GOTO_STUB;
      out.gotoLinks.push({
        points: [[g.ox, g.oy], [ch, g.oy], [ch, topYt], [t.x, topYt], [t.x, t.y]],
        arrow: { cx: t.x, y: t.y },
        label: g.target,
        labelX: g.ox + 8,
        labelY: g.oy - 6,
        labelAnchor: "start",
      });
    });
  });

  out.width = x + MARGIN;
  out.height = Math.max(...bottoms) + LOOP_STUB + MARGIN;
  pairSyncMarkers(out); // after the loop/goto channels, so connectors route around them
}

interface SyncPair {
  aFace: number;
  bFace: number;
  y1: number; // row of the a tab
  y2: number; // row of the b tab
  transfer: boolean;
  tabs: [number, number]; // indexes into out.syncTabs
  x: number; // channel of the vertical leg
}

// A padded region a sync connector must not run through. `line` marks a solid
// vertical line: the vertical leg avoids it, but a horizontal leg may cross it.
interface SyncObstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tab?: number;
  line?: boolean;
}

function syncObstacles(out: Layout): SyncObstacle[] {
  const obs: SyncObstacle[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number, extra: Partial<SyncObstacle> = {}) =>
    obs.push({ x1: x1 - SYNC_PAD, y1: y1 - SYNC_PAD, x2: x2 + SYNC_PAD, y2: y2 + SYNC_PAD, ...extra });
  const verticals = (pts: Array<[number, number]>) => {
    for (let i = 1; i < pts.length; i++) {
      const [xa, ya] = pts[i - 1];
      const [xb, yb] = pts[i];
      if (xa === xb) add(xa, Math.min(ya, yb), xa, Math.max(ya, yb), { line: true });
    }
  };
  for (const s of out.steps) {
    const g = s.initial ? 4 : 0; // the initial-step double frame
    add(s.x - g, s.y - g, s.x + s.w + g, s.y + s.h + g);
  }
  for (const a of out.allocs) add(a.cx - a.w / 2, a.cy - a.h / 2, a.cx + a.w / 2, a.cy + a.h / 2);
  for (const c of out.gotoChips) add(c.x, c.y, c.x + c.w, c.y + c.h);
  for (const n of out.notes) add(n.x, n.y, n.x + n.w, n.y + n.h);
  for (const t of out.transes) {
    const right = t.x + TICK_HALF + (t.condition ? COND_GAP + textWidth(t.condition, TRANS_FONT) : 0);
    add(t.x - TICK_HALF, t.y - TRANS_FONT / 2, right, t.y + TRANS_FONT / 2);
  }
  out.syncTabs.forEach((t, i) => add(t.x, t.y, t.x + t.w, t.y + t.h, { tab: i }));
  for (const ln of out.lines) verticals([[ln.x1, ln.y1], [ln.x2, ln.y2]]);
  for (const lp of out.loops) verticals(lp.points);
  for (const g of out.gotoLinks) verticals(g.points);
  return obs;
}

// The x ranges where a connector's vertical leg can run without it, or either
// horizontal leg leading to it, passing through an obstacle.
function syncChannels(p: SyncPair, obs: SyncObstacle[]): Array<[number, number]> {
  const left = Math.min(p.aFace, p.bFace);
  const right = Math.max(p.aFace, p.bFace);
  const yLeft = p.aFace <= p.bFace ? p.y1 : p.y2; // row of the left-hand tab
  const yRight = p.aFace <= p.bFace ? p.y2 : p.y1;
  const ylo = Math.min(p.y1, p.y2);
  const yhi = Math.max(p.y1, p.y2);
  let free: Array<[number, number]> = [[left + SYNC_STUB, right - SYNC_STUB]];
  const cut = (lo: number, hi: number) => {
    free = free.flatMap(([a, b]) => {
      const keep: Array<[number, number]> = [];
      if (lo > a) keep.push([a, Math.min(b, lo)]);
      if (hi < b) keep.push([Math.max(a, hi), b]);
      return keep;
    });
    free = free.filter(([a, b]) => a <= b);
  };
  for (const o of obs) {
    if (o.tab === p.tabs[0] || o.tab === p.tabs[1]) continue;
    if (o.y2 > ylo && o.y1 < yhi) cut(o.x1, o.x2);
    if (o.line) continue;
    const cx = (o.x1 + o.x2) / 2;
    if (yLeft > o.y1 && yLeft < o.y2 && cx > left) cut(o.x1, Infinity);
    if (yRight > o.y1 && yRight < o.y2 && cx < right) cut(-Infinity, o.x2);
  }
  return free;
}

type Seg4 = [number, number, number, number]; // x1, y1, x2, y2 (axis-aligned)

function syncSegs(p: SyncPair, x: number): Seg4[] {
  if (p.y1 === p.y2) return [[p.aFace, p.y1, p.bFace, p.y2]];
  return [
    [p.aFace, p.y1, x, p.y1],
    [x, p.y1, x, p.y2],
    [x, p.y2, p.bFace, p.y2],
  ];
}

// Penalty for routing p's vertical leg at x, given the connectors already placed:
// running alongside another connector is worst, then crossing one.
function syncCost(p: SyncPair, x: number, others: SyncPair[]): number {
  const within = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b);
  const overlap = (a1: number, a2: number, b1: number, b2: number) =>
    Math.max(Math.min(a1, a2), Math.min(b1, b2)) < Math.min(Math.max(a1, a2), Math.max(b1, b2));
  let cost = 0;
  const mine = syncSegs(p, x);
  for (const q of others) {
    for (const s of mine) {
      for (const t of syncSegs(q, q.x)) {
        const sV = s[0] === s[2];
        const tV = t[0] === t[2];
        if (sV && tV) {
          if (Math.abs(s[0] - t[0]) < SYNC_SPACING && overlap(s[1], s[3], t[1], t[3])) cost += 1000;
        } else if (!sV && !tV) {
          if (Math.abs(s[1] - t[1]) < SYNC_SPACING && overlap(s[0], s[2], t[0], t[2])) cost += 1000;
        } else {
          const [h, v] = sV ? [t, s] : [s, t];
          if (within(v[0], h[0], h[2]) && within(h[1], v[1], v[3])) cost += 100;
        }
      }
    }
  }
  return cost;
}

// Choose each connector's channel: as close to the midpoint between its tabs as
// possible (the historical position), clear of obstacles, apart from the other
// connectors, and avoiding crossings. Most constrained connectors are placed
// first, then everything is re-placed once against the full set.
function routeSync(out: Layout, pairs: SyncPair[]): void {
  const obs = syncObstacles(out);
  const bent = pairs.filter((p) => p.y1 !== p.y2);
  const channels = new Map(bent.map((p) => [p, syncChannels(p, obs)] as const));
  const room = (p: SyncPair) => channels.get(p)!.reduce((n, [a, b]) => n + b - a, 0);
  const order = [...bent].sort((p, q) => room(p) - room(q));
  const placed = new Set<SyncPair>(pairs.filter((p) => p.y1 === p.y2));
  for (let pass = 0; pass < 2; pass++) {
    for (const p of order) {
      const ideal = (p.aFace + p.bFace) / 2;
      const others = [...placed].filter((q) => q !== p);
      let best = ideal; // boxed in on every side: keep the midpoint
      let bestCost = Infinity;
      for (const [lo, hi] of channels.get(p)!) {
        const cands = [Math.min(hi, Math.max(lo, ideal))];
        for (let x = lo; x < hi; x++) cands.push(x);
        cands.push(hi);
        for (const x of cands) {
          const c = syncCost(p, x, others) + Math.abs(x - ideal);
          if (c < bestCost) {
            bestCost = c;
            best = x;
          }
        }
      }
      p.x = best;
      placed.add(p);
    }
  }
}

// Pair markers collected during placement (by id) into side tabs + connectors.
function pairSyncMarkers(out: Layout): void {
  const marks = ((out as any)._markers ?? []) as Array<{
    id: string;
    transfer: boolean;
    dir: string;
    node: PfcNode;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  }>;
  const byId = new Map<string, typeof marks>();
  for (const mk of marks) {
    const g = byId.get(mk.id);
    if (g) g.push(mk);
    else byId.set(mk.id, [mk]);
  }
  const pairs: SyncPair[] = [];
  for (const group of byId.values()) {
    if (group.length < 2) continue;
    const transfer = group.some((g) => g.transfer);
    let a = group[0];
    let b = group[1];
    if (transfer) {
      a = group.find((g) => g.dir === "out") ?? group[0];
      b = group.find((g) => g.dir === "in") ?? group[1];
    }
    const aCenter = a.sx + a.sw / 2;
    const bCenter = b.sx + b.sw / 2;
    const aIsLeft = aCenter <= bCenter;
    const sides = ((out as any)._tabSides ??= new Map()) as Map<PfcNode, Set<"left" | "right">>;
    const side = (node: PfcNode, s: "left" | "right") => {
      if (!sides.has(node)) sides.set(node, new Set());
      sides.get(node)!.add(s);
    };
    side(a.node, aIsLeft ? "right" : "left");
    side(b.node, aIsLeft ? "left" : "right");
    const aTabX = aIsLeft ? a.sx + a.sw : a.sx - SYNC_W;
    const bTabX = aIsLeft ? b.sx - SYNC_W : b.sx + b.sw;
    const aTabY = a.sy + a.sh / 2 - SYNC_H / 2;
    const bTabY = b.sy + b.sh / 2 - SYNC_H / 2;
    out.syncTabs.push({ x: aTabX, y: aTabY, w: SYNC_W, h: SYNC_H, label: a.id });
    out.syncTabs.push({ x: bTabX, y: bTabY, w: SYNC_W, h: SYNC_H, label: b.id });
    const aFace = aIsLeft ? aTabX + SYNC_W : aTabX;
    const bFace = aIsLeft ? bTabX : bTabX + SYNC_W;
    const y1 = a.sy + a.sh / 2;
    const y2 = b.sy + b.sh / 2;
    const n = out.syncTabs.length;
    pairs.push({ aFace, bFace, y1, y2, transfer, tabs: [n - 2, n - 1], x: (aFace + bFace) / 2 });
  }
  routeSync(out, pairs);
  for (const p of pairs) {
    const points: Array<[number, number]> =
      p.y1 === p.y2
        ? [[p.aFace, p.y1], [p.bFace, p.y2]]
        : [[p.aFace, p.y1], [p.x, p.y1], [p.x, p.y2], [p.bFace, p.y2]];
    out.syncLines.push({ points, transfer: p.transfer });
  }
}

function placeSeq(seq: PfcNode[], spineX: number, startY: number, out: Layout): number {
  let cy = startY;
  seq.forEach((node, k) => {
    if (k > 0) {
      out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: cy + V_GAP });
      cy += V_GAP;
    }
    cy = placeNode(node, spineX, cy, out);
  });
  return cy;
}

function placeNode(node: PfcNode, spineX: number, cy: number, out: Layout): number {
  const m = measureNode(node);
  if (node.kind === "step") {
    out.steps.push({
      x: spineX - m.w! / 2,
      y: cy,
      w: m.w!,
      h: STEP_H,
      label: node.label,
      level: node.level,
      initial: node.initial,
      encapsulates: node.encapsulates,
      link: node.link,
    });
    if (node.markers.length) {
      const store = ((out as any)._markers ??= []) as Array<any>;
      for (const mk of node.markers)
        store.push({ ...mk, node, sx: spineX - m.w! / 2, sy: cy, sw: m.w!, sh: STEP_H });
    }
    if (node.note) emitNote(out, node.note, spineX - m.w! / 2, cy, m.w!, STEP_H, noteLeft.has(node));
    if (node.id) (((out as any)._stepPos ??= {}) as any)[node.id] = { x: spineX, y: cy };
    return cy + STEP_H;
  }
  if (node.kind === "trans") {
    out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: cy + TRANS_H });
    out.transes.push({ x: spineX, y: cy + TRANS_H / 2, condition: node.condition });
    return cy + TRANS_H;
  }
  if (node.kind === "alloc") {
    out.allocs.push({ cx: spineX, cy: cy + ALLOC_H / 2, w: m.w!, h: ALLOC_H, label: node.label });
    if (node.markers.length) {
      const store = ((out as any)._markers ??= []) as Array<any>;
      for (const mk of node.markers)
        store.push({ ...mk, node, sx: spineX - m.w! / 2, sy: cy, sw: m.w!, sh: ALLOC_H });
    }
    if (node.note) emitNote(out, node.note, spineX - m.w! / 2, cy, m.w!, ALLOC_H, noteLeft.has(node));
    return cy + ALLOC_H;
  }

  if (node.kind === "goto") {
    if (node.drawn) {
      out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: cy + GOTO_H / 2 });
      (((out as any)._gotos ??= []) as Array<any>).push({ ox: spineX, oy: cy, target: node.target });
      return cy + GOTO_H;
    }
    out.gotoChips.push({
      x: spineX - m.w! / 2,
      y: cy,
      w: m.w!,
      h: CHIP_H,
      text: "\u21BA  " + node.targetLabel,
    });
    return cy + CHIP_H;
  }

  if (node.kind !== "parallel" && node.kind !== "selective") return cy; // concurrent handled elsewhere

  // branch block
  const spines: number[] = (node as any)._spines;
  const blockLeft = spineX - m.leftExt;
  const absSpines = spines.map((s) => blockLeft + s);
  const first = absSpines[0];
  const last = absSpines[absSpines.length - 1];
  const double = node.kind === "parallel";
  const dbl = double ? BAR_DBL : 0; // span of the second bar line

  const topBarY = cy + STUB;
  const branchTopY = topBarY + dbl + STUB;

  // incoming stub — connects to the TOP line only
  out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: topBarY });
  out.bars.push({ x1: first, x2: last, y: topBarY, double, gap: BAR_DBL });

  const branchBottoms: number[] = [];
  node.branches.forEach((br, k) => {
    const bx = absSpines[k];
    // branch leaves from the BOTTOM line, going down — the gap stays open
    out.lines.push({ x1: bx, y1: topBarY + dbl, x2: bx, y2: branchTopY });
    const bottom = placeSeq(br, bx, branchTopY, out);
    branchBottoms.push(bottom);
  });

  const maxH: number = (node as any)._maxH;
  const botBarY = branchTopY + maxH + STUB;

  // each branch runs down onto the TOP line of the convergence bar
  node.branches.forEach((_br, k) => {
    const bx = absSpines[k];
    out.lines.push({ x1: bx, y1: branchBottoms[k], x2: bx, y2: botBarY });
  });
  out.bars.push({ x1: first, x2: last, y: botBarY, double, gap: BAR_DBL });

  // outgoing stub leaves from the BOTTOM line
  const blockBottom = botBarY + dbl + STUB;
  out.lines.push({ x1: spineX, y1: botBarY + dbl, x2: spineX, y2: blockBottom });
  return blockBottom;
}
