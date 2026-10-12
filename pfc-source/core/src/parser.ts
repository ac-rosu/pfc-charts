// Parser for the PFC text DSL.
// Grammar (whitespace / indentation is ignored; structure comes from keywords):
//
//   pfc <optional title...>
//   step [ID] "Label" [:level]
//   trans "condition"           (aliases: transition)
//   parallel                    (simultaneous branches)
//     branch
//       ...elements...
//     branch
//       ...elements...
//   end
//   selective                   (alternative branches)
//     branch ...
//   end
//
// Levels: :phase :operation(:op) :unitprocedure(:up) :procedure(:proc)

export type Level = "phase" | "operation" | "unitprocedure" | "procedure";

export interface SyncMarker {
  id: string;
  transfer: boolean; // true = material transfer (arrow), false = synchronization
  dir: "out" | "in" | "none";
}
export interface StepNode {
  kind: "step";
  id: string;
  label: string;
  level: Level;
  initial: boolean;
  encapsulates: boolean;
  markers: SyncMarker[];
  note: string;
}
export interface TransNode {
  kind: "trans";
  condition: string;
}
export interface AllocNode {
  kind: "alloc";
  label: string;
  markers: SyncMarker[];
  note: string;
}
export interface GotoNode {
  kind: "goto";
  target: string;
  line: number;
  drawn: boolean; // true = draw the routed back-link; false (default) = label chip only
  targetLabel: string; // resolved label of the target step (for the chip)
}
export interface BranchBlock {
  kind: "parallel" | "selective";
  branches: PfcNode[][];
}
export interface ConcurrentBlock {
  kind: "concurrent";
  processes: Array<{ label: string; body: PfcNode[] }>;
}
export type PfcNode = StepNode | TransNode | AllocNode | GotoNode | BranchBlock | ConcurrentBlock;

export interface PfcChart {
  title: string;
  terminals: boolean;
  loop: boolean;
  uniformWidth: boolean;
  body: PfcNode[];
}

export class ParseError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "ParseError";
    this.line = line;
  }
}

const LEVELS: Record<string, Level> = {
  phase: "phase",
  operation: "operation",
  op: "operation",
  unitprocedure: "unitprocedure",
  unit: "unitprocedure",
  up: "unitprocedure",
  procedure: "procedure",
  proc: "procedure",
};

interface SrcLine {
  text: string;
  n: number; // 1-based original line number
}

// Remove a // comment that is not inside a double-quoted string.
function stripComment(raw: string): string {
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === "/" && raw[i + 1] === "/") return raw.slice(0, i);
  }
  return raw;
}

function firstWord(s: string): string {
  const m = s.match(/^(\S+)/);
  return m ? m[1].toLowerCase() : "";
}

function extractLevel(rest: string): { rest: string; level: Level } {
  const m = rest.match(/(^|\s):([A-Za-z]+)(?=\s|$)/);
  if (m) {
    const key = m[2].toLowerCase();
    const level = LEVELS[key];
    if (level) {
      const cleaned = (rest.slice(0, m.index) + rest.slice(m.index! + m[0].length)).trim();
      return { rest: cleaned, level };
    }
  }
  return { rest: rest.trim(), level: "phase" };
}

// Split "ID "Label"" or bare text into id + label.
function splitIdLabel(rest: string): { id: string; label: string } {
  const q = rest.indexOf('"');
  if (q >= 0) {
    const q2 = rest.indexOf('"', q + 1);
    if (q2 < 0) return { id: "", label: rest.slice(q + 1) }; // tolerate missing close quote
    return { id: rest.slice(0, q).trim(), label: rest.slice(q + 1, q2) };
  }
  return { id: "", label: rest.trim() };
}

export function parsePfc(source: string): PfcChart {
  const lines: SrcLine[] = [];
  let title = "";
  let titleSeen = false;
  let terminals = true;
  let loop = false;
  let uniformWidth = false;

  const rawLines = source.split(/\r?\n/);
  for (let idx = 0; idx < rawLines.length; idx++) {
    const stripped = stripComment(rawLines[idx]).trim();
    if (stripped === "" || stripped.startsWith("#")) continue;
    if (firstWord(stripped) === "pfc") {
      if (titleSeen) throw new ParseError("duplicate 'pfc' title line", idx + 1);
      titleSeen = true;
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
    if (low === "uniform-width" || low === "uniform width" || low === "uniform") {
      uniformWidth = true;
      continue;
    }
    lines.push({ text: stripped, n: idx + 1 });
  }

  let i = 0;

  // Every sync/transfer marker, tracked with its source line for pairing checks.
  const allMarkers: Array<{ id: string; transfer: boolean; dir: string; line: number }> = [];

  function parseSequence(stops: string[], depth: number): PfcNode[] {
    if (depth > 40) throw new ParseError("nesting too deep", lines[i]?.n ?? 0);
    const seq: PfcNode[] = [];
    while (i < lines.length) {
      const { text, n } = lines[i];
      const kw = firstWord(text);
      if (stops.includes(kw)) break;

      if (kw === "step") {
        const raw = text.slice(4).trim();
        // Isolate the quoted label first so a ':level'-looking token inside the
        // label is never mistaken for the level tag.
        let label = "";
        let outside = "";
        let level: Level;
        const q = raw.indexOf('"');
        if (q >= 0) {
          const q2 = raw.indexOf('"', q + 1);
          if (q2 < 0) {
            label = raw.slice(q + 1);
            outside = raw.slice(0, q);
          } else {
            label = raw.slice(q + 1, q2);
            outside = raw.slice(0, q) + " " + raw.slice(q2 + 1);
          }
          const ex = extractLevel(outside);
          outside = ex.rest;
          level = ex.level;
        } else {
          const ex = extractLevel(raw);
          label = ex.rest;
          level = ex.level;
        }
        if (!label.trim()) throw new ParseError("step needs a label", n);
        let initial = false;
        let encapsulates = false;
        const idToks: string[] = [];
        for (const t of outside.split(/\s+/).filter(Boolean)) {
          const lt = t.toLowerCase();
          if (lt === "initial") initial = true;
          else if (t === "+" || lt === "contains" || lt === "encapsulates") encapsulates = true;
          else idToks.push(t);
        }
        seq.push({
          kind: "step",
          id: idToks.join(" "),
          label: q >= 0 ? label : label.trim(),
          level,
          initial,
          encapsulates,
          markers: [],
          note: "",
        });
        i++;
      } else if (kw === "trans" || kw === "transition") {
        const rest = text.slice(kw.length).trim();
        const cond = rest.startsWith('"')
          ? splitIdLabel(rest).label
          : rest;
        seq.push({ kind: "trans", condition: cond });
        i++;
      } else if (kw === "goto" || kw === "return") {
        const toks = text.slice(kw.length).trim().split(/\s+/);
        const target = toks[0] || "";
        if (!target) throw new ParseError(`'${kw}' needs a target step id`, n);
        const drawn = (toks[1] || "").toLowerCase() === "line";
        seq.push({ kind: "goto", target, line: n, drawn, targetLabel: "" });
        i++;
      } else if (kw === "alloc" || kw === "allocation") {
        const rest = text.slice(kw.length).trim();
        const label = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        if (!label.trim()) throw new ParseError("alloc needs a label", n);
        seq.push({ kind: "alloc", label, markers: [], note: "" });
        i++;
      } else if (kw === "note") {
        const last = seq[seq.length - 1];
        if (!last || (last.kind !== "step" && last.kind !== "alloc"))
          throw new ParseError("'note' must come right after a step or allocation", n);
        const rest = text.slice(4).trim();
        const noteText = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        if (!noteText.trim()) throw new ParseError("note needs text", n);
        last.note = noteText;
        i++;
      } else if (kw === "sync" || kw === "transfer") {
        const last = seq[seq.length - 1];
        if (!last || (last.kind !== "step" && last.kind !== "alloc"))
          throw new ParseError(`'${kw}' must come right after a step or allocation`, n);
        if (kw === "sync") {
          const id = text.slice(4).trim().split(/\s+/)[0] || "";
          if (!id) throw new ParseError("sync needs an id", n);
          last.markers.push({ id, transfer: false, dir: "none" });
          allMarkers.push({ id, transfer: false, dir: "none", line: n });
        } else {
          const toks = text.slice(8).trim().split(/\s+/);
          const id = toks[0] || "";
          const dir = (toks[1] || "").toLowerCase();
          if (!id) throw new ParseError("transfer needs an id", n);
          if (dir !== "in" && dir !== "out")
            throw new ParseError("transfer needs a direction: 'in' or 'out'", n);
          last.markers.push({ id, transfer: true, dir });
          allMarkers.push({ id, transfer: true, dir, line: n });
        }
        i++;
      } else if (kw === "concurrent") {
        if (depth !== 0)
          throw new ParseError("'concurrent' must be at the top level", n);
        i++; // consume opener
        const processes: Array<{ label: string; body: PfcNode[] }> = [];
        while (i < lines.length && firstWord(lines[i].text) === "process") {
          const rest = lines[i].text.slice(7).trim();
          const label = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
          i++; // consume 'process'
          processes.push({ label, body: parseSequence(["process", "end"], depth + 1) });
        }
        if (i >= lines.length)
          throw new ParseError("missing 'end' to close 'concurrent'", n);
        if (firstWord(lines[i].text) !== "end")
          throw new ParseError(
            `unexpected '${lines[i].text}' in 'concurrent' (expected 'process' or 'end')`,
            lines[i].n
          );
        i++; // consume 'end'
        if (processes.length < 2)
          throw new ParseError("'concurrent' needs at least two 'process' blocks", n);
        if (processes.some((p) => p.body.length === 0))
          throw new ParseError("'concurrent' has an empty process", n);
        seq.push({ kind: "concurrent", processes });
      } else if (kw === "parallel" || kw === "selective") {
        const kind = kw as "parallel" | "selective";
        i++; // consume opener
        const branches: PfcNode[][] = [];
        while (i < lines.length && firstWord(lines[i].text) === "branch") {
          i++; // consume 'branch'
          branches.push(parseSequence(["branch", "end"], depth + 1));
        }
        if (i >= lines.length || firstWord(lines[i].text) !== "end")
          throw new ParseError(`missing 'end' to close '${kind}'`, n);
        i++; // consume 'end'
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
  if (body.length === 0) throw new ParseError("chart is empty", 0);
  if (body.some((nd) => nd.kind === "concurrent") && body.length > 1)
    throw new ParseError("'concurrent' must be the only thing in the chart", 0);

  // check every goto points at a real step id, and resolve its label
  const idLabel = new Map<string, string>();
  const gotos: GotoNode[] = [];
  const scan = (nodes: PfcNode[]): void => {
    for (const nd of nodes) {
      if (nd.kind === "step" && nd.id) idLabel.set(nd.id, nd.label);
      else if (nd.kind === "goto") gotos.push(nd);
      else if (nd.kind === "parallel" || nd.kind === "selective") nd.branches.forEach(scan);
      else if (nd.kind === "concurrent") nd.processes.forEach((p) => scan(p.body));
    }
  };
  scan(body);
  for (const g of gotos) {
    if (!idLabel.has(g.target))
      throw new ParseError(`goto target '${g.target}' is not a step id`, g.line);
    g.targetLabel = idLabel.get(g.target)!;
  }

  // check every sync/transfer id is used exactly twice, and that a transfer pair
  // is exactly one 'out' and one 'in'
  const markerGroups = new Map<string, typeof allMarkers>();
  for (const mk of allMarkers) {
    const g = markerGroups.get(mk.id);
    if (g) g.push(mk);
    else markerGroups.set(mk.id, [mk]);
  }
  for (const [id, group] of markerGroups) {
    if (group.length !== 2)
      throw new ParseError(
        `marker '${id}' must be used exactly twice (found ${group.length})`,
        group[0].line
      );
    if (group.some((m) => m.transfer)) {
      const outs = group.filter((m) => m.transfer && m.dir === "out").length;
      const ins = group.filter((m) => m.transfer && m.dir === "in").length;
      if (outs !== 1 || ins !== 1)
        throw new ParseError(
          `transfer '${id}' needs exactly one 'out' and one 'in'`,
          group[0].line
        );
    }
  }

  return { title, terminals, loop, uniformWidth, body };
}
