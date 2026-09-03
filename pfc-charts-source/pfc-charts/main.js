"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PfcChartsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/parser.ts
var ParseError = class extends Error {
  constructor(message, line) {
    super(message);
    this.name = "ParseError";
    this.line = line;
  }
};
var LEVELS = {
  phase: "phase",
  operation: "operation",
  op: "operation",
  unitprocedure: "unitprocedure",
  unit: "unitprocedure",
  up: "unitprocedure",
  procedure: "procedure",
  proc: "procedure"
};
function stripComment(raw) {
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"')
      inQuote = !inQuote;
    else if (!inQuote && c === "/" && raw[i + 1] === "/")
      return raw.slice(0, i);
  }
  return raw;
}
function firstWord(s) {
  const m = s.match(/^(\S+)/);
  return m ? m[1].toLowerCase() : "";
}
function extractLevel(rest) {
  const m = rest.match(/(^|\s):([A-Za-z]+)(?=\s|$)/);
  if (m) {
    const key = m[2].toLowerCase();
    const level = LEVELS[key];
    if (level) {
      const cleaned = (rest.slice(0, m.index) + rest.slice(m.index + m[0].length)).trim();
      return { rest: cleaned, level };
    }
  }
  return { rest: rest.trim(), level: "phase" };
}
function splitIdLabel(rest) {
  const q = rest.indexOf('"');
  if (q >= 0) {
    const q2 = rest.indexOf('"', q + 1);
    if (q2 < 0)
      return { id: "", label: rest.slice(q + 1) };
    return { id: rest.slice(0, q).trim(), label: rest.slice(q + 1, q2) };
  }
  return { id: "", label: rest.trim() };
}
function parsePfc(source) {
  const lines = [];
  let title = "";
  let terminals = true;
  let loop = false;
  const rawLines = source.split(/\r?\n/);
  for (let idx = 0; idx < rawLines.length; idx++) {
    const stripped = stripComment(rawLines[idx]).trim();
    if (stripped === "" || stripped.startsWith("#"))
      continue;
    if (firstWord(stripped) === "pfc") {
      title = stripped.slice(3).trim().replace(/^"|"$/g, "");
      continue;
    }
    const low = stripped.toLowerCase();
    if (low === "no-terminals" || low === "terminals off" || low === "no terminals") {
      terminals = false;
      continue;
    }
    if (low === "loop" || low === "loop back" || low === "cycle") {
      loop = true;
      continue;
    }
    lines.push({ text: stripped, n: idx + 1 });
  }
  let i = 0;
  function parseSequence(stops, depth) {
    var _a, _b;
    if (depth > 40)
      throw new ParseError("nesting too deep", (_b = (_a = lines[i]) == null ? void 0 : _a.n) != null ? _b : 0);
    const seq = [];
    while (i < lines.length) {
      const { text, n } = lines[i];
      const kw = firstWord(text);
      if (stops.includes(kw))
        break;
      if (kw === "step") {
        const { rest, level } = extractLevel(text.slice(4).trim());
        let label = "";
        let outside = "";
        const q = rest.indexOf('"');
        if (q >= 0) {
          const q2 = rest.indexOf('"', q + 1);
          if (q2 < 0) {
            label = rest.slice(q + 1);
            outside = rest.slice(0, q);
          } else {
            label = rest.slice(q + 1, q2);
            outside = rest.slice(0, q) + " " + rest.slice(q2 + 1);
          }
        } else {
          label = rest;
        }
        if (!label.trim())
          throw new ParseError("step needs a label", n);
        let initial = false;
        let encapsulates = false;
        const idToks = [];
        for (const t of outside.split(/\s+/).filter(Boolean)) {
          const lt = t.toLowerCase();
          if (lt === "initial")
            initial = true;
          else if (t === "+" || lt === "contains" || lt === "encapsulates")
            encapsulates = true;
          else
            idToks.push(t);
        }
        seq.push({
          kind: "step",
          id: idToks.join(" "),
          label: q >= 0 ? label : label.trim(),
          level,
          initial,
          encapsulates,
          markers: [],
          note: ""
        });
        i++;
      } else if (kw === "trans" || kw === "transition") {
        const rest = text.slice(kw.length).trim();
        const cond = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        seq.push({ kind: "trans", condition: cond });
        i++;
      } else if (kw === "goto" || kw === "return") {
        const toks = text.slice(kw.length).trim().split(/\s+/);
        const target = toks[0] || "";
        if (!target)
          throw new ParseError(`'${kw}' needs a target step id`, n);
        const drawn = (toks[1] || "").toLowerCase() === "line";
        seq.push({ kind: "goto", target, line: n, drawn, targetLabel: "" });
        i++;
      } else if (kw === "alloc" || kw === "allocation") {
        const rest = text.slice(kw.length).trim();
        const label = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        if (!label.trim())
          throw new ParseError("alloc needs a label", n);
        seq.push({ kind: "alloc", label, markers: [], note: "" });
        i++;
      } else if (kw === "note") {
        const last = seq[seq.length - 1];
        if (!last || last.kind !== "step" && last.kind !== "alloc")
          throw new ParseError("'note' must come right after a step or allocation", n);
        const rest = text.slice(4).trim();
        const noteText = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        if (!noteText.trim())
          throw new ParseError("note needs text", n);
        last.note = noteText;
        i++;
      } else if (kw === "sync" || kw === "transfer") {
        const last = seq[seq.length - 1];
        if (!last || last.kind !== "step" && last.kind !== "alloc")
          throw new ParseError(`'${kw}' must come right after a step or allocation`, n);
        if (kw === "sync") {
          const id = text.slice(4).trim().split(/\s+/)[0] || "";
          if (!id)
            throw new ParseError("sync needs an id", n);
          last.markers.push({ id, transfer: false, dir: "none" });
        } else {
          const toks = text.slice(8).trim().split(/\s+/);
          const id = toks[0] || "";
          const dir = (toks[1] || "").toLowerCase();
          if (!id)
            throw new ParseError("transfer needs an id", n);
          if (dir !== "in" && dir !== "out")
            throw new ParseError("transfer needs a direction: 'in' or 'out'", n);
          last.markers.push({ id, transfer: true, dir });
        }
        i++;
      } else if (kw === "concurrent") {
        if (depth !== 0)
          throw new ParseError("'concurrent' must be at the top level", n);
        i++;
        const processes = [];
        while (i < lines.length && firstWord(lines[i].text) === "process") {
          const rest = lines[i].text.slice(7).trim();
          const label = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
          i++;
          processes.push({ label, body: parseSequence(["process", "end"], depth + 1) });
        }
        if (i >= lines.length || firstWord(lines[i].text) !== "end")
          throw new ParseError("missing 'end' to close 'concurrent'", n);
        i++;
        if (processes.length < 2)
          throw new ParseError("'concurrent' needs at least two 'process' blocks", n);
        if (processes.some((p) => p.body.length === 0))
          throw new ParseError("'concurrent' has an empty process", n);
        seq.push({ kind: "concurrent", processes });
      } else if (kw === "parallel" || kw === "selective") {
        const kind = kw;
        i++;
        const branches = [];
        while (i < lines.length && firstWord(lines[i].text) === "branch") {
          i++;
          branches.push(parseSequence(["branch", "end"], depth + 1));
        }
        if (i >= lines.length || firstWord(lines[i].text) !== "end")
          throw new ParseError(`missing 'end' to close '${kind}'`, n);
        i++;
        if (branches.length < 2)
          throw new ParseError(`'${kind}' needs at least two 'branch' blocks`, n);
        if (branches.some((b) => b.length === 0))
          throw new ParseError(`'${kind}' has an empty branch`, n);
        seq.push({ kind, branches });
      } else {
        throw new ParseError(`unknown statement: "${text}"`, n);
      }
    }
    return seq;
  }
  const body = parseSequence([], 0);
  if (i < lines.length)
    throw new ParseError(`unexpected '${lines[i].text}'`, lines[i].n);
  if (body.length === 0)
    throw new ParseError("chart is empty", 0);
  if (body.some((nd) => nd.kind === "concurrent") && body.length > 1)
    throw new ParseError("'concurrent' must be the only thing in the chart", 0);
  const idLabel = /* @__PURE__ */ new Map();
  const gotos = [];
  const scan = (nodes) => {
    for (const nd of nodes) {
      if (nd.kind === "step" && nd.id)
        idLabel.set(nd.id, nd.label);
      else if (nd.kind === "goto")
        gotos.push(nd);
      else if (nd.kind === "parallel" || nd.kind === "selective")
        nd.branches.forEach(scan);
      else if (nd.kind === "concurrent")
        nd.processes.forEach((p) => scan(p.body));
    }
  };
  scan(body);
  for (const g of gotos) {
    if (!idLabel.has(g.target))
      throw new ParseError(`goto target '${g.target}' is not a step id`, g.line);
    g.targetLabel = idLabel.get(g.target);
  }
  return { title, terminals, loop, body };
}

// src/layout.ts
var FONT = "sans-serif";
var STEP_FONT = 13;
var TRANS_FONT = 12;
var TITLE_FONT = 15;
var STEP_H = 44;
var STEP_MIN_W = 96;
var STEP_PAD_X = 16;
var TRANS_H = 30;
var TICK_HALF = 15;
var COND_GAP = 8;
var V_GAP = 24;
var BRANCH_GAP = 44;
var STUB = 16;
var BAR_DBL = 4;
var MARGIN = 24;
var TITLE_H = 34;
var TERM_W = 24;
var TERM_H = 15;
var TERM_GAP = 18;
var LOOP_GAP = 26;
var LOOP_STUB = 20;
var PROCESS_GAP = 46;
var GOTO_H = 12;
var GOTO_GAP = 26;
var GOTO_STUB = 14;
var CHIP_H = 26;
var CHIP_FONT = 12;
var CHIP_PAD = 12;
var PROC_TITLE_H = 24;
var PROC_TITLE_FONT = 13;
var NOTE_W = 150;
var NOTE_FONT = 11;
var NOTE_PAD = 8;
var NOTE_LINE_H = 15;
var NOTE_GAP = 22;
var NOTE_RESERVE = NOTE_W + NOTE_GAP + 6;
var SYNC_W = 26;
var SYNC_H = 16;
var SYNC_RESERVE = 30;
var ALLOC_H = 42;
var ALLOC_MIN_W = 74;
var ALLOC_PAD_X = 22;
var _ctx = null;
function textWidth(text, px) {
  if (!text)
    return 0;
  if (!_ctx) {
    const c = document.createElement("canvas");
    _ctx = c.getContext("2d");
  }
  if (!_ctx)
    return text.length * px * 0.6;
  _ctx.font = `${px}px ${FONT}`;
  return _ctx.measureText(text).width;
}
var mmap = /* @__PURE__ */ new WeakMap();
var smap = /* @__PURE__ */ new WeakMap();
function wrapText(text, px, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (textWidth(trial, px) <= maxW || !cur)
      cur = trial;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur)
    lines.push(cur);
  return lines.length ? lines : [text];
}
function emitNote(out, note, sx, sy, sw, sh) {
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
    link: [sx + sw, sy + sh / 2, x, sy + sh / 2]
  });
}
function measureNode(node) {
  const cached = mmap.get(node);
  if (cached)
    return cached;
  let m;
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
      h: TRANS_H
    };
  } else if (node.kind === "alloc") {
    const w = Math.max(ALLOC_MIN_W, textWidth(node.label, STEP_FONT) + 2 * ALLOC_PAD_X);
    const reserve = node.markers.length ? SYNC_RESERVE : 0;
    const noteR = node.note ? NOTE_RESERVE : 0;
    m = { leftExt: w / 2 + reserve, rightExt: w / 2 + reserve + noteR, h: ALLOC_H, w };
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
    const spines = [];
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
      h: maxH + 4 * STUB + 2 * dbl
    };
    node._spines = spines;
    node._bms = bms;
    node._spine = spine;
    node._maxH = maxH;
  } else {
    m = { leftExt: 0, rightExt: 0, h: 0 };
  }
  mmap.set(node, m);
  return m;
}
function measureSeq(seq) {
  const cached = smap.get(seq);
  if (cached)
    return cached;
  let leftExt = 0;
  let rightExt = 0;
  let h = 0;
  seq.forEach((node, k) => {
    const nm = measureNode(node);
    leftExt = Math.max(leftExt, nm.leftExt);
    rightExt = Math.max(rightExt, nm.rightExt);
    if (k > 0)
      h += V_GAP;
    h += nm.h;
  });
  const m = { leftExt, rightExt, h };
  smap.set(seq, m);
  return m;
}
function layoutChart(chart) {
  const out = {
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
    fontFamily: FONT
  };
  out.titleY = MARGIN + TITLE_FONT;
  if (chart.body.length === 1 && chart.body[0].kind === "concurrent") {
    layoutConcurrent(chart.body[0], out);
    return out;
  }
  const bodyM = measureSeq(chart.body);
  const half = Math.max(bodyM.leftExt, bodyM.rightExt);
  const gotoCount = countGotos(chart.body);
  const leftGutter = chart.loop && gotoCount > 0 ? (gotoCount + 1) * GOTO_GAP : 0;
  const rootSpine = MARGIN + leftGutter + half;
  const showTerminals = chart.terminals && !chart.loop;
  const headerY = MARGIN + (chart.title ? TITLE_H : 0);
  let y = headerY + (chart.loop ? LOOP_STUB : 0);
  if (showTerminals) {
    out.beginTri = { cx: rootSpine, top: y, w: TERM_W, h: TERM_H };
    y += TERM_H;
    out.lines.push({ x1: rootSpine, y1: y, x2: rootSpine, y2: y + TERM_GAP });
    y += TERM_GAP;
  }
  const firstY = y;
  let bottom = placeSeq(chart.body, rootSpine, firstY, out);
  pairSyncMarkers(out);
  if (showTerminals) {
    out.lines.push({ x1: rootSpine, y1: bottom, x2: rootSpine, y2: bottom + TERM_GAP });
    bottom += TERM_GAP;
    out.endTri = { cx: rootSpine, top: bottom, w: TERM_W, h: TERM_H };
    bottom += TERM_H;
  }
  out.width = 2 * half + 2 * MARGIN + leftGutter;
  if (chart.loop) {
    const channelX = rootSpine + half + LOOP_GAP;
    out.loops.push(makeLoop(rootSpine, firstY, bottom, channelX));
    out.width = channelX + MARGIN;
    bottom += LOOP_STUB;
  }
  out.height = bottom + MARGIN;
  resolveGotos(out, leftGutter);
  return out;
}
function makeLoop(spineX, firstY, bottom, channelX) {
  const botY = bottom + LOOP_STUB;
  const topY = firstY - LOOP_STUB;
  return {
    points: [
      [spineX, bottom],
      [spineX, botY],
      [channelX, botY],
      [channelX, topY],
      [spineX, topY],
      [spineX, firstY]
    ],
    arrow: { cx: spineX, y: firstY }
  };
}
function resolveGotos(out, leftGutter) {
  var _a, _b;
  const gotos = (_a = out._gotos) != null ? _a : [];
  const pos = (_b = out._stepPos) != null ? _b : {};
  if (!gotos.length)
    return;
  if (leftGutter > 0) {
    gotos.forEach((g, i) => {
      const t = pos[g.target];
      if (!t)
        return;
      const ch2 = MARGIN + leftGutter - GOTO_GAP * (i + 1);
      const topY = t.y - GOTO_STUB;
      out.gotoLinks.push({
        points: [[g.ox, g.oy], [ch2, g.oy], [ch2, topY], [t.x, topY], [t.x, t.y]],
        arrow: { cx: t.x, y: t.y },
        label: g.target,
        labelX: g.ox - 8,
        labelY: g.oy - 6,
        labelAnchor: "end"
      });
    });
    return;
  }
  let ch = out.width - MARGIN + GOTO_GAP;
  for (const g of gotos) {
    const t = pos[g.target];
    if (!t)
      continue;
    const topY = t.y - GOTO_STUB;
    out.gotoLinks.push({
      points: [[g.ox, g.oy], [ch, g.oy], [ch, topY], [t.x, topY], [t.x, t.y]],
      arrow: { cx: t.x, y: t.y },
      label: g.target,
      labelX: g.ox + 8,
      labelY: g.oy - 6,
      labelAnchor: "start"
    });
    ch += GOTO_GAP;
  }
  out.width = Math.max(out.width, ch - GOTO_GAP + MARGIN);
}
function countGotos(nodes) {
  let n = 0;
  for (const nd of nodes) {
    if (nd.kind === "goto")
      n += nd.drawn ? 1 : 0;
    else if (nd.kind === "parallel" || nd.kind === "selective")
      nd.branches.forEach((b) => n += countGotos(b));
    else if (nd.kind === "concurrent")
      nd.processes.forEach((p) => n += countGotos(p.body));
  }
  return n;
}
function layoutConcurrent(node, out) {
  var _a, _b;
  const processes = node.processes;
  const pms = processes.map((p) => measureSeq(p.body));
  const hasTitles = processes.some((p) => p.label);
  const headerY = MARGIN + (out.title ? TITLE_H : 0);
  const titleBandY = headerY;
  const topY = headerY + (hasTitles ? PROC_TITLE_H : 0) + LOOP_STUB;
  const g0 = countGotos(processes[0].body);
  const leftPad = g0 * GOTO_GAP;
  const leftChannelX = MARGIN + 8 + leftPad;
  let x = MARGIN + LOOP_GAP + leftPad;
  const spines = [];
  pms.forEach((pm) => {
    spines.push(x + pm.leftExt);
    x += pm.leftExt + pm.rightExt + PROCESS_GAP;
  });
  const rightEdge = x - PROCESS_GAP;
  const gotoStore = (_a = out._gotos) != null ? _a : out._gotos = [];
  const procGotos = [];
  const bottoms = processes.map((proc, i) => {
    if (proc.label)
      out.processTitles.push({ cx: spines[i], y: titleBandY + PROC_TITLE_FONT, label: proc.label });
    const before = gotoStore.length;
    const b = placeSeq(proc.body, spines[i], topY, out);
    procGotos.push(gotoStore.slice(before));
    return b;
  });
  pairSyncMarkers(out);
  processes.forEach((_proc, i) => {
    const channelX = i === 0 ? leftChannelX : rightEdge + LOOP_GAP * i;
    out.loops.push(makeLoop(spines[i], topY, bottoms[i], channelX));
  });
  const pos = (_b = out._stepPos) != null ? _b : {};
  let rightCh = rightEdge + LOOP_GAP * (processes.length - 1) + GOTO_GAP;
  let maxRight = rightEdge + LOOP_GAP * (processes.length - 1);
  procGotos.forEach((gs, i) => {
    gs.forEach((g, k) => {
      const t = pos[g.target];
      if (!t)
        return;
      const topYt = t.y - GOTO_STUB;
      let ch;
      let anchor;
      let lx;
      if (i === 0) {
        ch = MARGIN + 8 + k * GOTO_GAP;
        anchor = "end";
        lx = g.ox - 8;
      } else {
        ch = rightCh;
        rightCh += GOTO_GAP;
        maxRight = Math.max(maxRight, ch);
        anchor = "start";
        lx = g.ox + 8;
      }
      out.gotoLinks.push({
        points: [[g.ox, g.oy], [ch, g.oy], [ch, topYt], [t.x, topYt], [t.x, t.y]],
        arrow: { cx: t.x, y: t.y },
        label: g.target,
        labelX: lx,
        labelY: g.oy - 6,
        labelAnchor: anchor
      });
    });
  });
  out.width = maxRight + MARGIN;
  out.height = Math.max(...bottoms) + LOOP_STUB + MARGIN;
}
function pairSyncMarkers(out) {
  var _a, _b, _c;
  const marks = (_a = out._markers) != null ? _a : [];
  const byId = /* @__PURE__ */ new Map();
  for (const mk of marks) {
    const g = byId.get(mk.id);
    if (g)
      g.push(mk);
    else
      byId.set(mk.id, [mk]);
  }
  for (const group of byId.values()) {
    if (group.length < 2)
      continue;
    const transfer = group.some((g) => g.transfer);
    let a = group[0];
    let b = group[1];
    if (transfer) {
      a = (_b = group.find((g) => g.dir === "out")) != null ? _b : group[0];
      b = (_c = group.find((g) => g.dir === "in")) != null ? _c : group[1];
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
    const points = y1 === y2 ? [[aFace, y1], [bFace, y2]] : [[aFace, y1], [midX, y1], [midX, y2], [bFace, y2]];
    out.syncLines.push({ points, transfer });
  }
}
function placeSeq(seq, spineX, startY, out) {
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
function placeNode(node, spineX, cy, out) {
  var _a, _b, _c, _d;
  const m = measureNode(node);
  if (node.kind === "step") {
    out.steps.push({
      x: spineX - m.w / 2,
      y: cy,
      w: m.w,
      h: STEP_H,
      label: node.label,
      level: node.level,
      initial: node.initial,
      encapsulates: node.encapsulates
    });
    if (node.markers.length) {
      const store = (_a = out._markers) != null ? _a : out._markers = [];
      for (const mk of node.markers)
        store.push({ ...mk, sx: spineX - m.w / 2, sy: cy, sw: m.w, sh: STEP_H });
    }
    if (node.note)
      emitNote(out, node.note, spineX - m.w / 2, cy, m.w, STEP_H);
    if (node.id)
      ((_b = out._stepPos) != null ? _b : out._stepPos = {})[node.id] = { x: spineX, y: cy };
    return cy + STEP_H;
  }
  if (node.kind === "trans") {
    out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: cy + TRANS_H });
    out.transes.push({ x: spineX, y: cy + TRANS_H / 2, condition: node.condition });
    return cy + TRANS_H;
  }
  if (node.kind === "alloc") {
    out.allocs.push({ cx: spineX, cy: cy + ALLOC_H / 2, w: m.w, h: ALLOC_H, label: node.label });
    if (node.markers.length) {
      const store = (_c = out._markers) != null ? _c : out._markers = [];
      for (const mk of node.markers)
        store.push({ ...mk, sx: spineX - m.w / 2, sy: cy, sw: m.w, sh: ALLOC_H });
    }
    if (node.note)
      emitNote(out, node.note, spineX - m.w / 2, cy, m.w, ALLOC_H);
    return cy + ALLOC_H;
  }
  if (node.kind === "goto") {
    if (node.drawn) {
      out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: cy + GOTO_H / 2 });
      ((_d = out._gotos) != null ? _d : out._gotos = []).push({ ox: spineX, oy: cy, target: node.target });
      return cy + GOTO_H;
    }
    out.gotoChips.push({
      x: spineX - m.w / 2,
      y: cy,
      w: m.w,
      h: CHIP_H,
      text: "\u21BA  " + node.targetLabel
    });
    return cy + CHIP_H;
  }
  if (node.kind !== "parallel" && node.kind !== "selective")
    return cy;
  const spines = node._spines;
  const blockLeft = spineX - m.leftExt;
  const absSpines = spines.map((s) => blockLeft + s);
  const first = absSpines[0];
  const last = absSpines[absSpines.length - 1];
  const double = node.kind === "parallel";
  const dbl = double ? BAR_DBL : 0;
  const topBarY = cy + STUB;
  const branchTopY = topBarY + dbl + STUB;
  out.lines.push({ x1: spineX, y1: cy, x2: spineX, y2: topBarY });
  out.bars.push({ x1: first, x2: last, y: topBarY, double, gap: BAR_DBL });
  const branchBottoms = [];
  node.branches.forEach((br, k) => {
    const bx = absSpines[k];
    out.lines.push({ x1: bx, y1: topBarY + dbl, x2: bx, y2: branchTopY });
    const bottom = placeSeq(br, bx, branchTopY, out);
    branchBottoms.push(bottom);
  });
  const maxH = node._maxH;
  const botBarY = branchTopY + maxH + STUB;
  node.branches.forEach((_br, k) => {
    const bx = absSpines[k];
    out.lines.push({ x1: bx, y1: branchBottoms[k], x2: bx, y2: botBarY });
  });
  out.bars.push({ x1: first, x2: last, y: botBarY, double, gap: BAR_DBL });
  const blockBottom = botBarY + dbl + STUB;
  out.lines.push({ x1: spineX, y1: botBarY + dbl, x2: spineX, y2: blockBottom });
  return blockBottom;
}

// src/render.ts
var SVGNS = "http://www.w3.org/2000/svg";
function svgEl(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs)
    e.setAttribute(k, String(attrs[k]));
  return e;
}
var HOP_R = 5;
var XPS = 1.5;
var isH = (s) => s.y1 === s.y2 && s.x1 !== s.x2;
var isV = (s) => s.x1 === s.x2 && s.y1 !== s.y2;
function polySegs(points, cls) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    out.push({ x1, y1, x2, y2, cls, hops: [] });
  }
  return out;
}
function computeHops(all) {
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
      if (vx > lo + XPS && vx < hi - XPS && y > vlo + XPS && y < vhi - XPS)
        h.hops.push(vx);
    }
    h.hops.sort((a, b) => a - b);
  }
}
function drawSeg(svg, s) {
  if (!isH(s) || s.hops.length === 0) {
    svg.appendChild(svgEl("line", { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: s.cls }));
    return;
  }
  const y = s.y1;
  const left = Math.min(s.x1, s.x2);
  const right = Math.max(s.x1, s.x2);
  let d = `M ${left} ${y}`;
  for (const hx of s.hops) {
    if (hx <= left + HOP_R || hx >= right - HOP_R)
      continue;
    d += ` L ${hx - HOP_R} ${y} A ${HOP_R} ${HOP_R} 0 0 0 ${hx + HOP_R} ${y}`;
  }
  d += ` L ${right} ${y}`;
  svg.appendChild(svgEl("path", { d, class: s.cls, fill: "none" }));
}
var LEVEL_MARKS = {
  phase: 1,
  operation: 2,
  unitprocedure: 3,
  procedure: 4
};
var LEVEL_ORDER = ["tl", "tr", "br", "bl"];
var MARK = 16;
function markLine(corner, x, y, w, h) {
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
function renderChart(chart) {
  const L = layoutChart(chart);
  const svg = svgEl("svg", {
    class: "pfc-svg",
    width: Math.ceil(L.width),
    height: Math.ceil(L.height),
    viewBox: `0 0 ${Math.ceil(L.width)} ${Math.ceil(L.height)}`,
    xmlns: SVGNS
  });
  if (L.title) {
    const t = svgEl("text", {
      x: L.width / 2,
      y: L.titleY,
      class: "pfc-title",
      "text-anchor": "middle",
      "font-size": L.titleFont,
      "font-family": L.fontFamily
    });
    t.textContent = L.title;
    svg.appendChild(t);
  }
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
        "font-family": L.fontFamily
      });
      t.textContent = line;
      svg.appendChild(t);
    });
  }
  const lineSegs = L.lines.map((ln) => ({ ...ln, cls: "pfc-line", hops: [] }));
  const barSegs = [];
  for (const b of L.bars) {
    barSegs.push({ x1: b.x1, y1: b.y, x2: b.x2, y2: b.y, cls: "pfc-bar", hops: [] });
    if (b.double)
      barSegs.push({ x1: b.x1, y1: b.y + b.gap, x2: b.x2, y2: b.y + b.gap, cls: "pfc-bar", hops: [] });
  }
  const loopSegs = L.loops.flatMap((lp) => polySegs(lp.points, "pfc-loop"));
  const gotoSegs = L.gotoLinks.flatMap((g) => polySegs(g.points, "pfc-loop"));
  computeHops([...lineSegs, ...barSegs, ...loopSegs, ...gotoSegs]);
  for (const s of lineSegs)
    drawSeg(svg, s);
  for (const s of barSegs)
    drawSeg(svg, s);
  for (const tr of L.transes) {
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
        "font-family": L.fontFamily
      });
      c.textContent = tr.condition;
      svg.appendChild(c);
    }
  }
  for (const s of L.steps) {
    if (s.initial) {
      svg.appendChild(
        svgEl("rect", {
          x: s.x - 4,
          y: s.y - 4,
          width: s.w + 8,
          height: s.h + 8,
          class: "pfc-step-initial"
        })
      );
    }
    svg.appendChild(
      svgEl("rect", { x: s.x, y: s.y, width: s.w, height: s.h, class: "pfc-step-rect" })
    );
    const corners = new Set(LEVEL_ORDER.slice(0, LEVEL_MARKS[s.level]));
    if (s.encapsulates)
      corners.add("tr");
    for (const corner of LEVEL_ORDER) {
      if (corners.has(corner))
        svg.appendChild(svgEl("line", { ...markLine(corner, s.x, s.y, s.w, s.h), class: "pfc-corner" }));
    }
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
      "font-family": L.fontFamily
    });
    label.textContent = s.label;
    svg.appendChild(label);
  }
  if (L.beginTri) {
    const { cx, top, w, h } = L.beginTri;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - w / 2},${top} ${cx + w / 2},${top} ${cx},${top + h}`,
        class: "pfc-terminal"
      })
    );
  }
  if (L.endTri) {
    const { cx, top, w, h } = L.endTri;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - w / 2},${top + h} ${cx + w / 2},${top + h} ${cx},${top}`,
        class: "pfc-terminal"
      })
    );
  }
  for (const s of loopSegs)
    drawSeg(svg, s);
  for (const lp of L.loops) {
    const { cx, y } = lp.arrow;
    svg.appendChild(
      svgEl("polygon", {
        points: `${cx - 5},${y - 9} ${cx + 5},${y - 9} ${cx},${y}`,
        class: "pfc-loop-arrow"
      })
    );
  }
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
      "font-family": L.fontFamily
    });
    lbl.textContent = al.label;
    svg.appendChild(lbl);
  }
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
          class: "pfc-sync-arrow"
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
      "font-family": L.fontFamily
    });
    lbl.textContent = t.label;
    svg.appendChild(lbl);
  }
  for (const s of gotoSegs)
    drawSeg(svg, s);
  for (const g of L.gotoLinks) {
    svg.appendChild(
      svgEl("polygon", {
        points: `${g.arrow.cx - 5},${g.arrow.y - 9} ${g.arrow.cx + 5},${g.arrow.y - 9} ${g.arrow.cx},${g.arrow.y}`,
        class: "pfc-loop-arrow"
      })
    );
    const lbl = svgEl("text", {
      x: g.labelX,
      y: g.labelY,
      class: "pfc-goto-label",
      "text-anchor": g.labelAnchor,
      "font-size": 11,
      "font-family": L.fontFamily
    });
    lbl.textContent = "\u2191 " + g.label;
    svg.appendChild(lbl);
  }
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
      "font-family": L.fontFamily
    });
    t.textContent = c.text;
    svg.appendChild(t);
  }
  for (const pt of L.processTitles) {
    const t = svgEl("text", {
      x: pt.cx,
      y: pt.y,
      class: "pfc-proc-title",
      "text-anchor": "middle",
      "font-size": 13,
      "font-family": L.fontFamily
    });
    t.textContent = pt.label;
    svg.appendChild(t);
  }
  return svg;
}

// src/main.ts
var PfcChartsPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor("pfc", (source, el) => {
      el.empty();
      el.addClass("pfc-container");
      try {
        const chart = parsePfc(source);
        el.appendChild(renderChart(chart));
      } catch (e) {
        const pre = el.createEl("pre", { cls: "pfc-error" });
        if (e instanceof ParseError) {
          pre.setText(
            e.line > 0 ? `PFC error (line ${e.line}): ${e.message}` : `PFC error: ${e.message}`
          );
        } else {
          pre.setText(`PFC error: ${e.message}`);
        }
      }
    });
  }
};
