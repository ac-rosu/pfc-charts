// Build orchestrator: bundles each target into output/<target>.
//
//   node build.mjs                 build every implemented target
//   node build.mjs obsidian        build a single target
//   node build.mjs obsidian --watch   rebuild-on-change (dev)
//
// output/ holds only generated artifacts and is safe to delete.
import esbuild from "esbuild";
import { rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import builtins from "builtin-modules";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const target = args.find((a) => !a.startsWith("--"));

const OBSIDIAN_EXTERNAL = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtins,
];

async function buildObsidian() {
  const out = "output/obsidian";
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const copyAssets = () => {
    for (const f of ["manifest.json", "styles.css", "versions.json"]) {
      const s = join("pfc-source/obsidian", f);
      if (existsSync(s)) copyFileSync(s, join(out, f));
    }
  };

  const opts = {
    entryPoints: ["pfc-source/obsidian/src/main.ts"],
    bundle: true,
    external: OBSIDIAN_EXTERNAL,
    format: "cjs",
    target: "es2018",
    treeShaking: true,
    sourcemap: watch ? "inline" : false,
    logLevel: "info",
    outfile: join(out, "main.js"),
  };

  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    copyAssets();
    console.log("obsidian: watching -> output/obsidian");
  } else {
    await esbuild.build(opts);
    copyAssets();
    console.log("obsidian: built -> output/obsidian");
  }
}

// Adapters not yet implemented; folders are scaffolded under pfc-source/.
const NOT_YET = new Set(["vscode", "fumadocs"]);
const builders = { obsidian: buildObsidian };

async function run() {
  if (target && !builders[target]) {
    if (NOT_YET.has(target)) {
      console.log(`${target}: adapter not implemented yet — nothing to build.`);
      return;
    }
    console.error(`unknown target '${target}' (known: ${Object.keys(builders).join(", ")})`);
    process.exit(1);
  }
  const targets = target ? [target] : Object.keys(builders);
  for (const t of targets) await builders[t]();
}

run();
