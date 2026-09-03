// Bundles the TypeScript test files (which import the extensionless source
// modules) into runnable JS for Node's built-in test runner.
import esbuild from "esbuild";
import { readdirSync } from "node:fs";
import builtins from "builtin-modules";

const entryPoints = readdirSync("tests")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`);

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outdir: "tests-dist",
  external: [...builtins],
  logLevel: "warning",
});
