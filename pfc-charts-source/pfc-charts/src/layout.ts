// Deterministic top-to-bottom layout for PFC charts.
// Produces absolutely-positioned primitives; no external layout library.

import { PfcChart, PfcNode, Level } from "./parser";

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

const mmap = new WeakMap<object, Measure>();
const smap = new WeakMap<object, Measure>(); // measure for a sequence (array)

// wrap text to fit a pixel width
function wrapText(text: string, px: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
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

// attach a note callout to the right edge of an element box (sx,sy,sw,sh)
function emitNote(out: Layout, note: string, sx: number, sy: number, sw: number, sh: number): void {
  const lines = wrapText(note, NOTE_FONT, NOTE_W - 2 * NOTE_PAD);
  const h = lines.length * NOTE_LINE_H + 2 * NOTE_PAD;
  const x = sx + sw + NOTE_GAP;
  const y = sy + sh / 2 - h / 2;
  out.notes.push({
    x,
    y,
    w: NOTE_W,
    h,
    lines,
    lineH: NOTE_LINE_H,
    link: [sx + sw, sy + sh / 2, x, sy + sh / 2],
  });
}

function measureNode(node: PfcNode): Measure {
  const cached = mmap.get(node);
  if (cached) return cached;
  let m: Measure;
  if (node.kind === "step") {
    const w = Math.max(STEP_MIN_W, textWidth(node.label, STEP_FONT) + 2 * STEP_PAD_X);
    const reserve = node.markers.length ? SYNC_RESERVE : 0;
    const noteR = node.note ? NOTE_RESERVE : 0;
    m = { leftExt: w / 2 + reserve, rightExt: w / 2 + reserve + noteR, h: STEP_H, w };
  } else if (node.kind === "trans") {
    const cw = textWidth(node.condition, TRANS_FONT);
    m = {
      leftExt: TICK_HALF,
      rightExt: TICK_HALF + (node.condition ? COND_GAP + cw : 0),
      h: TRANS_H,
    };
  } else if (node.kind === "alloc") {
    const w = Math.max(ALLOC_MIN_W, textWidth(node.label, STEP_FONT) + 2 * ALLOC_PAD_X);
    const reserve = node.markers.length ? SYNC_RESERVE : 0;
    const noteR = node.note ? NOTE_RESERVE : 0;
    m = { leftExt: w / 2 + reserve, rightExt: w / 2 + reserve + noteR, h: ALLOC_H, w };
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

  if (chart.body.length === 1 && chart.body[0].kind === "concurrent") {
    layoutConcurrent(chart.body[0] as any, out);
    return out;
  }

  const bodyM = measureSeq(chart.body);
  // Put the spine on the SVG centerline so the trunk is centered, giving both
  // sides equal room (right side carries the transition condition labels).
  const half = Math.max(bodyM.leftExt, bodyM.rightExt);
  const rootSpine = MARGIN + half;

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

  pairSyncMarkers(out);

  // end terminal (single upward triangle) — all paths have converged by here
  if (showTerminals) {
    out.lines.push({ x1: rootSpine, y1: bottom, x2: rootSpine, y2: bottom + TERM_GAP });
    bottom += TERM_GAP;
    out.endTri = { cx: rootSpine, top: bottom, w: TERM_W, h: TERM_H };
    bottom += TERM_H;
  }

  out.width = 2 * half + 2 * MARGIN;

  // loop-back: exit the last element, route up the right channel, re-enter the top
  if (chart.loop) {
    const channelX = MARGIN + 2 * half + LOOP_GAP;
    out.loops.push(makeLoop(rootSpine, firstY, bottom, channelX));
    out.width = channelX + MARGIN;
    bottom += LOOP_STUB;
  }

  out.height = bottom + MARGIN;
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

// Independent looping processes side by side, joined by synchronization lines.
// Each process is its own cyclic lane (no begin/end, no convergence): process 0
// loops on the left, the rest loop on the right.
function layoutConcurrent(node: { processes: Array<{ label: string; body: PfcNode[] }> }, out: Layout): void {
  const processes = node.processes;
  const pms = processes.map((p) => measureSeq(p.body));
  const hasTitles = processes.some((p) => p.label);
  const headerY = MARGIN + (out.title ? TITLE_H : 0);
  const titleBandY = headerY;
  const topY = headerY + (hasTitles ? PROC_TITLE_H : 0) + LOOP_STUB;

  const leftChannelX = MARGIN + 8;
  let x = MARGIN + LOOP_GAP; // room for process 0's left loop channel
  const spines: number[] = [];
  pms.forEach((pm) => {
    spines.push(x + pm.leftExt);
    x += pm.leftExt + pm.rightExt + PROCESS_GAP;
  });
  const rightEdge = x - PROCESS_GAP;

  const bottoms = processes.map((proc, i) => {
    if (proc.label)
      out.processTitles.push({ cx: spines[i], y: titleBandY + PROC_TITLE_FONT, label: proc.label });
    return placeSeq(proc.body, spines[i], topY, out);
  });

  pairSyncMarkers(out);

  processes.forEach((_proc, i) => {
    const channelX = i === 0 ? leftChannelX : rightEdge + LOOP_GAP * i;
    out.loops.push(makeLoop(spines[i], topY, bottoms[i], channelX));
  });

  out.width = rightEdge + LOOP_GAP * (processes.length - 1) + MARGIN;
  out.height = Math.max(...bottoms) + LOOP_STUB + MARGIN;
}

// Pair markers collected during placement (by id) into side tabs + connectors.
function pairSyncMarkers(out: Layout): void {
  const marks = ((out as any)._markers ?? []) as Array<{
    id: string;
    transfer: boolean;
    dir: string;
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
    const midX = (aFace + bFace) / 2;
    const points: Array<[number, number]> =
      y1 === y2
        ? [[aFace, y1], [bFace, y2]]
        : [[aFace, y1], [midX, y1], [midX, y2], [bFace, y2]];
    out.syncLines.push({ points, transfer });
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
    });
    if (node.markers.length) {
      const store = ((out as any)._markers ??= []) as Array<any>;
      for (const mk of node.markers)
        store.push({ ...mk, sx: spineX - m.w! / 2, sy: cy, sw: m.w!, sh: STEP_H });
    }
    if (node.note) emitNote(out, node.note, spineX - m.w! / 2, cy, m.w!, STEP_H);
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
        store.push({ ...mk, sx: spineX - m.w! / 2, sy: cy, sw: m.w!, sh: ALLOC_H });
    }
    if (node.note) emitNote(out, node.note, spineX - m.w! / 2, cy, m.w!, ALLOC_H);
    return cy + ALLOC_H;
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
