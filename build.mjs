// Build orchestrator: bundles each target into output/<target>.
//
//   node build.mjs                 build every implemented target
//   node build.mjs obsidian        build a single target
//   node build.mjs obsidian --watch   rebuild-on-change (dev)
//
// output/ holds only generated artifacts and is safe to delete.
import esbuild from "esbuild";
import { rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
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

  // preview-side script (zoom controls), run inside the Markdown preview webview
  await esbuild.build({
    entryPoints: ["pfc-source/vscode/src/preview.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    treeShaking: true,
    sourcemap: watch ? "inline" : false,
    logLevel: "info",
    outfile: join(out, "media/pfc-preview.js"),
  });

  // self-contained extension folder, ready for `vsce package`
  copyFileSync("pfc-source/vscode/package.json", join(out, "package.json"));

  // media assets (icon + preview stylesheet; the preview script is built above);
  // .svg is the icon's source, not shipped
  for (const f of readdirSync("pfc-source/vscode/media")) {
    if (f.endsWith(".svg")) continue;
    copyFileSync(join("pfc-source/vscode/media", f), join(out, "media", f));
  }

  // README.package.md is the Marketplace-facing README (self-contained; the source
  // README.md has repo-relative links vsce can't resolve). LICENSE + CHANGELOG ship too.
  copyFileSync("pfc-source/vscode/README.package.md", join(out, "README.md"));
  for (const f of ["LICENSE", "CHANGELOG.md"]) {
    const s = join("pfc-source/vscode", f);
    if (existsSync(s)) copyFileSync(s, join(out, f));
  }
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
  // keep dev-only files out of the packaged VSIX (also silences vsce's warning)
  writeFileSync(join(out, ".vscodeignore"), [".vscode/**", "**/*.map", ""].join("\n"));
  console.log("vscode: built -> output/vscode");
}

// Fumadocs adapter — bundled to compiled ESM with @pfc/core inlined and React
// left external. Shipping compiled JS (not raw TS) makes it resolve like any
// normal package in a consumer app: no `transpilePackages`, no @pfc/core dep.
// Type declarations are emitted separately via tsconfig.build.json.
async function buildFumadocs() {
  const out = "output/fumadocs";
  cleanDir(out);
  mkdirSync(join(out, "dist"), { recursive: true });

  await esbuild.build({
    entryPoints: {
      index: "pfc-source/fumadocs/src/index.ts",
      remark: "pfc-source/fumadocs/src/remark.ts",
    },
    bundle: true,
    external: ["react", "react-dom", "react/jsx-runtime"],
    platform: "node",
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    treeShaking: true,
    sourcemap: watch ? "inline" : false,
    logLevel: "info",
    outdir: join(out, "dist"),
  });

  copyFileSync("pfc-source/fumadocs/styles.css", join(out, "styles.css"));
  if (existsSync("pfc-source/fumadocs/README.md")) {
    copyFileSync("pfc-source/fumadocs/README.md", join(out, "README.md"));
  }

  // hand-written declarations (the public surface is small and stable, and this
  // avoids tsc pulling the bundled @pfc/core sources into the emit tree). Keep them in
  // step with src/: core/tests/fumadocsTypes.test.ts fails when they drift.
  const remarkDts = [
    "export interface RemarkPfcOptions {",
    "  component?: string;",
    "  lang?: string;",
    "  trailingSlash?: boolean;",
    "}",
    "export declare function remarkPfc(options?: RemarkPfcOptions): (tree?: unknown, file?: unknown) => void;",
    "declare const _default: typeof remarkPfc;",
    "export default _default;",
    "",
  ].join("\n");
  writeFileSync(join(out, "dist/remark.d.ts"), remarkDts);
  writeFileSync(
    join(out, "dist/index.d.ts"),
    [
      "export interface PFCProps {",
      "  source?: string;",
      "  children?: string;",
      "  className?: string;",
      "  page?: string;",
      "  trailingSlash?: boolean;",
      "  linkHref?: (target: string) => string;",
      "}",
      "export declare function PFC(props: PFCProps): import(\"react\").ReactElement;",
      "export declare function docsHref(target: string): string;",
      "export declare function pageHref(target: string, page: string, trailingSlash?: boolean): string;",
      "export { remarkPfc, default as remarkPfcDefault } from \"./remark\";",
      "export type { RemarkPfcOptions } from \"./remark\";",
      "",
    ].join("\n")
  );

  // standalone, installable manifest (core is bundled; React stays a peer dep).
  // Version is the single source of truth in pfc-source/fumadocs/package.json.
  const version = JSON.parse(readFileSync("pfc-source/fumadocs/package.json", "utf8")).version;
  writeFileSync(
    join(out, "package.json"),
    JSON.stringify(
      {
        name: "@pfc/fumadocs",
        version,
        description: "Fumadocs (Next.js + MDX) adapter for PFC Charts (ISA-88).",
        license: "MIT",
        author: "ACRO",
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
          "./remark": { types: "./dist/remark.d.ts", default: "./dist/remark.js" },
          "./styles.css": "./styles.css",
        },
        peerDependencies: { react: ">=18" },
        files: ["dist", "styles.css", "README.md"],
      },
      null,
      2
    )
  );

  console.log("fumadocs: built -> output/fumadocs");
}

// Adapters not yet implemented; folders are scaffolded under pfc-source/.
const NOT_YET = new Set();
const builders = { obsidian: buildObsidian, vscode: buildVscode, fumadocs: buildFumadocs };

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
