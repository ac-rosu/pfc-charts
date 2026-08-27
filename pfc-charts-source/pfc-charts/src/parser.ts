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
}
export interface TransNode {
  kind: "trans";
  condition: string;
}
export interface AllocNode {
  kind: "alloc";
  label: string;
  markers: SyncMarker[];
}
export interface BranchBlock {
  kind: "parallel" | "selective";
  branches: PfcNode[][];
}
export type PfcNode = StepNode | TransNode | AllocNode | BranchBlock;

export interface PfcChart {
  title: string;
  terminals: boolean;
  loop: boolean;
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
  let terminals = true;
  let loop = false;

  const rawLines = source.split(/\r?\n/);
  for (let idx = 0; idx < rawLines.length; idx++) {
    const stripped = stripComment(rawLines[idx]).trim();
    if (stripped === "" || stripped.startsWith("#")) continue;
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

  function parseSequence(stops: string[], depth: number): PfcNode[] {
    if (depth > 40) throw new ParseError("nesting too deep", lines[i]?.n ?? 0);
    const seq: PfcNode[] = [];
    while (i < lines.length) {
      const { text, n } = lines[i];
      const kw = firstWord(text);
      if (stops.includes(kw)) break;

      if (kw === "step") {
        const { rest, level } = extractLevel(text.slice(4).trim());
        // Pull out the quoted label; everything else on the line is modifiers/id.
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
        });
        i++;
      } else if (kw === "trans" || kw === "transition") {
        const rest = text.slice(kw.length).trim();
        const cond = rest.startsWith('"')
          ? splitIdLabel(rest).label
          : rest;
        seq.push({ kind: "trans", condition: cond });
        i++;
      } else if (kw === "alloc" || kw === "allocation") {
        const rest = text.slice(kw.length).trim();
        const label = rest.startsWith('"') ? splitIdLabel(rest).label : rest;
        if (!label.trim()) throw new ParseError("alloc needs a label", n);
        seq.push({ kind: "alloc", label, markers: [] });
        i++;
      } else if (kw === "sync" || kw === "transfer") {
        const last = seq[seq.length - 1];
        if (!last || (last.kind !== "step" && last.kind !== "alloc"))
          throw new ParseError(`'${kw}' must come right after a step or allocation`, n);
        if (kw === "sync") {
          const id = text.slice(4).trim().split(/\s+/)[0] || "";
          if (!id) throw new ParseError("sync needs an id", n);
          last.markers.push({ id, transfer: false, dir: "none" });
        } else {
          const toks = text.slice(8).trim().split(/\s+/);
          const id = toks[0] || "";
          const dir = (toks[1] || "").toLowerCase();
          if (!id) throw new ParseError("transfer needs an id", n);
          if (dir !== "in" && dir !== "out")
            throw new ParseError("transfer needs a direction: 'in' or 'out'", n);
          last.markers.push({ id, transfer: true, dir });
        }
        i++;
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
  return { title, terminals, loop, body };
}
