// The Fumadocs package ships hand-written type declarations (written by build.mjs).
// Fail when the source gains an option, prop or export the declarations don't have,
// so consumers never type-check against a stale surface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function interfaceKeys(src: string, name: string): string[] {
  const body = src.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  return [...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
}

test("hand-written Fumadocs declarations match the source", () => {
  const build = read("build.mjs");
  const dts = build.slice(build.indexOf("hand-written declarations"), build.indexOf("standalone, installable manifest"));
  const checks: Array<[string, string]> = [
    ["pfc-source/fumadocs/src/remark.ts", "RemarkPfcOptions"],
    ["pfc-source/fumadocs/src/PFC.tsx", "PFCProps"],
  ];
  for (const [file, name] of checks) {
    const keys = interfaceKeys(read(file), name);
    assert.ok(keys.length > 0, `found ${name} in ${file}`);
    for (const k of keys) assert.match(dts, new RegExp(`"  ${k}\\?:`), `${name}.${k} is declared`);
  }
  const exported = [...read("pfc-source/fumadocs/src/index.ts").matchAll(/export \{ ([^}]+) \}/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim().split(/\s+as\s+/).pop()!);
  for (const name of exported) assert.match(dts, new RegExp(`\\b${name}\\b`), `export ${name} is declared`);
});
