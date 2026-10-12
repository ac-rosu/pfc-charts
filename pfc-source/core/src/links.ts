// Helpers for `link` targets. A target is written once in the chart and has to
// work in every adapter: VS Code resolves relative files with GitHub-style heading
// slugs, Obsidian resolves note names/paths with heading text, and docs sites need
// page URLs. These pure functions let each adapter translate the same target.

/** True for an absolute URL with a scheme (https:, mailto:, obsidian:, ...). */
export function isExternalLink(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/** Split "path#heading" into its path and heading (the heading without its '#'). */
export function splitLink(target: string): { path: string; heading: string } {
  const hash = target.indexOf("#");
  if (hash < 0) return { path: target, heading: "" };
  return { path: target.slice(0, hash), heading: target.slice(hash + 1) };
}

/** decodeURIComponent that leaves malformed input (a stray '%') as it is. */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** GitHub-style heading slug, as VS Code and most docs sites use: "Cool operation" -> "cool-operation". */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * Resolve a "./" or "../" path against the folder of `fromFile` (both '/'-separated,
 * relative to the same root). Other paths are returned unchanged.
 */
export function resolveRelativePath(fromFile: string, path: string): string {
  if (!path.startsWith("./") && !path.startsWith("../")) return path;
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of path.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}
