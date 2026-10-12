// Turns a step's `link` target into a docs-site URL. Charts are written with file
// links (as in VS Code and Obsidian), but a Fumadocs page lives at its route, so
// "charge.md#Phases" becomes "charge#phases": the .md/.mdx extension and a trailing
// "index" are dropped, and the heading becomes the slug the page's headings carry.
import { headingSlug, isExternalLink, resolveRelativePath, safeDecode, splitLink } from "@pfc/core";

export function docsHref(target: string): string {
  if (isExternalLink(target)) return target;
  const { path, heading } = splitLink(target);
  const page = encodeURI(
    safeDecode(path)
      .replace(/\.mdx?$/i, "")
      .replace(/(^|\/)index$/i, "$1")
  );
  if (heading) return `${page}#${headingSlug(safeDecode(heading))}`;
  return page || "./"; // a bare "index.md" is the current folder's page
}

// Fumadocs URL segments for a content file: no extension, "(group)" folders dropped
// (they organise files without appearing in URLs), and "index" pages are their folder.
function slugSegments(file: string): string[] {
  const segs = file
    .replace(/\.mdx?$/i, "")
    .split("/")
    .filter((s) => s && !/^\(.+\)$/.test(s));
  if (segs[segs.length - 1]?.toLowerCase() === "index") segs.pop();
  return segs;
}

/**
 * Like {@link docsHref}, but resolves the target as a file next to `page` (the
 * content file the chart is on, e.g. "content/docs/units/reaction.mdx"), the way
 * VS Code and Obsidian do, then turns it into a URL relative to that page. This is
 * right for any folder nesting, for index pages, and for sites with
 * `trailingSlash: true` (pages at "/docs/units/reaction/").
 */
export function pageHref(target: string, page: string, trailingSlash = false): string {
  if (isExternalLink(target) || target.startsWith("/")) return target; // already a URL
  const { path, heading } = splitLink(target);
  const hash = heading ? `#${headingSlug(safeDecode(heading))}` : "";
  if (!path) return hash; // same page
  const rel = path.startsWith("./") || path.startsWith("../") ? path : `./${path}`;
  const file = resolveRelativePath(page, safeDecode(rel));
  const from = slugSegments(page);
  const to = slugSegments(file);
  // relative URLs resolve against the page URL's folder: the page itself when the URL
  // ends in "/", its parent otherwise
  const base = trailingSlash ? from : from.slice(0, -1);
  let common = 0;
  while (common < base.length && common < to.length && base[common] === to[common]) common++;
  const rest = to.slice(common).map(encodeURIComponent).join("/");
  const url = "../".repeat(base.length - common) + rest + (trailingSlash && rest ? "/" : "");
  return (url || "./") + hash;
}
