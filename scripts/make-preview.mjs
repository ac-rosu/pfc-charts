// Renders a sample PFC chart to assets/pfc-example.png for the README.
// Bundles @pfc/core on the fly (its source is TS), renders a chart to an SVG
// string, injects a concrete light theme (the runtime CSS uses host theme
// variables), then rasterises with resvg. Run with: npm run preview
import esbuild from "esbuild";
import { Resvg } from "@resvg/resvg-js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import builtins from "builtin-modules";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CHART = `pfc Batch Reaction
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat to 80C" :operation
parallel
  branch
    step "Dose Acid" :phase
    trans "acid dosed"
    step "Hold" :phase
  branch
    step "Agitate" :phase
end
step "Cool" :operation
step "Discharge" :operation`;

// Concrete light theme mirroring pfc-preview.css (GitHub-friendly).
const CSS = `
.pfc-line{stroke:#1f2328;stroke-width:1.5}
.pfc-bar{stroke:#1f2328;stroke-width:2.5;stroke-linecap:round}
.pfc-trans-tick{stroke:#1f2328;stroke-width:2}
.pfc-step-rect{fill:#ffffff;stroke:#0969da;stroke-width:1.75;stroke-linejoin:miter}
.pfc-step-initial{fill:none;stroke:#0969da;stroke-width:1.25;opacity:.75}
.pfc-corner{stroke:#0969da;stroke-width:1.75}
.pfc-plus{stroke:#1f2328;stroke-width:1.75}
.pfc-terminal{fill:#0969da;stroke:none}
.pfc-loop{fill:none;stroke:#1f2328;stroke-width:1.5}
.pfc-loop-arrow{fill:#1f2328;stroke:none}
.pfc-sync{fill:#ffffff;stroke:#0969da;stroke-width:1.75}
.pfc-sync-line{fill:none;stroke:#1f2328;stroke-width:1.5;stroke-dasharray:5 4}
.pfc-sync-arrow{fill:#1f2328;stroke:none}
.pfc-sync-label{fill:#1f2328;font-weight:600}
.pfc-alloc{fill:#ffffff;stroke:#0969da;stroke-width:1.75}
.pfc-alloc-label{fill:#1f2328;font-weight:500}
.pfc-proc-title{fill:#1f2328;font-weight:700}
.pfc-goto-label{fill:#6e7781;font-weight:600}
.pfc-goto-chip{fill:#f6f8fa;stroke:#0969da;stroke-width:1.5}
.pfc-goto-chip-text{fill:#1f2328;font-weight:600}
.pfc-note{fill:#f6f8fa;stroke:#6e7781;stroke-width:1}
.pfc-note-link{stroke:#6e7781;stroke-width:1;stroke-dasharray:2 2}
.pfc-note-text{fill:#6e7781}
.pfc-step-label{fill:#1f2328;font-weight:500}
.pfc-cond{fill:#6e7781}
.pfc-title{fill:#1f2328;font-weight:700}`;

// Bundle the TS core to a temp ESM module we can import.
const out = join(mkdtempSync(join(tmpdir(), "pfc-preview-")), "core.mjs");
await esbuild.build({
  stdin: {
    contents: `export { parsePfc, renderChartToString } from "./pfc-source/core/src/index.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: out,
  external: [...builtins],
  logLevel: "warning",
});

const { parsePfc, renderChartToString } = await import(pathToFileURL(out).href);

const svg = renderChartToString(parsePfc(CHART));
const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
const W = Number(w);
const H = Number(h);
const P = 24;
const OW = W + 2 * P;
const OH = H + 2 * P;

const framed =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${OW} ${OH}">` +
  `<style>${CSS}</style>` +
  `<rect x="0" y="0" width="${OW}" height="${OH}" rx="12" fill="#ffffff"/>` +
  svg.replace("<svg ", `<svg x="${P}" y="${P}" `) +
  `</svg>`;

const png = new Resvg(framed, {
  fitTo: { mode: "width", value: OW * 2 },
  font: { defaultFontFamily: "Arial", loadSystemFonts: true },
}).render().asPng();

const dest = join(root, "assets");
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, "pfc-example.png"), png);
console.log(`wrote assets/pfc-example.png (${OW * 2}x${OH * 2})`);
