// Build orchestrator: bundles each target into output/<target>.
//
//   node build.mjs                 build every implemented target
//   node build.mjs obsidian        build a single target
//   node build.mjs obsidian --watch   rebuild-on-change (dev)
//
// output/ holds only generated artifacts and is safe to delete.
import esbuild from "esbuild";
import { rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import builtins from "builtin-modules";

// Empty a directory's contents without removing the directory itself, so it
// works even when the folder is a terminal's current working directory (Windows
// locks a cwd, which would make rmSync on the dir fail with EPERM).
function cleanDir(dir) {
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true });
  } else {
    mkdirSync(dir, { recursive: true });
  }
}

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
  cleanDir(out);

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

async function buildVscode() {
  const out = "output/vscode";
  cleanDir(out);
  mkdirSync(join(out, "dist"), { recursive: true });
  mkdirSync(join(out, "media"), { recursive: true });

  await esbuild.build({
    entryPoints: ["pfc-source/vscode/src/extension.ts"],
    bundle: true,
    external: ["vscode"],
    platform: "node",
    format: "cjs",
    target: "node16",
    treeShaking: true,
    sourcemap: watch ? "inline" : false,
    logLevel: "info",
    outfile: join(out, "dist/extension.js"),
  });

  // self-contained extension folder, ready for `vsce package`
  copyFileSync("pfc-source/vscode/package.json", join(out, "package.json"));
  copyFileSync("pfc-source/vscode/media/pfc-preview.css", join(out, "media/pfc-preview.css"));
  // a standalone README (the source one has repo-relative links vsce can't resolve)
  writeFileSync(
    join(out, "README.md"),
    [
      "# PFC Charts (ISA-88)",
      "",
      "Render ISA-88 Procedure Function Charts from `pfc` fenced code blocks in the",
      "built-in Markdown preview.",
      "",
      "````markdown",
      "```pfc",
      "pfc Simple Batch",
      'step "Charge Reactor" :operation',
      'trans "level >= 500L"',
      'step "Heat" :operation',
      "```",
      "````",
      "",
      "Open a Markdown file and run **Markdown: Open Preview** (`Ctrl/Cmd+Shift+V`).",
      "`pfc` blocks render as inline SVG that follows the active color theme.",
      "",
    ].join("\n")
  );
  // launch config so pressing F5 in this folder starts an Extension Development Host
  mkdirSync(join(out, ".vscode"), { recursive: true });
  writeFileSync(
    join(out, ".vscode/launch.json"),
    JSON.stringify(
      {
        version: "0.2.0",
        configurations: [
          {
            name: "Run PFC Charts extension",
            type: "extensionHost",
            request: "launch",
            args: ["--extensionDevelopmentPath=${workspaceFolder}"],
          },
        ],
      },
      null,
      2
    )
  );
  console.log("vscode: built -> output/vscode");
}

// Adapters not yet implemented; folders are scaffolded under pfc-source/.
const NOT_YET = new Set(["fumadocs"]);
const builders = { obsidian: buildObsidian, vscode: buildVscode };

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
