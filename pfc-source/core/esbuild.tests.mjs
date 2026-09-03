// Bundles the TypeScript test files (which import the extensionless source
// modules) into runnable JS for Node's built-in test runner.
import esbuild from "esbuild";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import builtins from "builtin-modules";

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = join(here, "tests");

const entryPoints = readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join(testsDir, f));

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outdir: join(here, "tests-dist"),
  external: [...builtins],
  logLevel: "warning",
});
