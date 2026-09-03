// VS Code Markdown-preview integration.
//
// VS Code loads this module for the built-in Markdown preview and calls
// `extendMarkdownIt`. We add a fence rule that turns ```pfc code blocks into
// inline SVG using the shared @pfc/core engine. All theming comes from
// media/pfc-preview.css (contributed via markdown.previewStyles).

import { parsePfc, ParseError, renderChartToString } from "@pfc/core";

// Minimal structural types for the bits of markdown-it we touch (avoids a
// runtime dependency; VS Code passes its own markdown-it instance).
type Token = { info: string; content: string };
type FenceRule = (
  tokens: Token[],
  idx: number,
  options: unknown,
  env: unknown,
  self: { renderToken(tokens: Token[], idx: number, options: unknown): string }
) => string;
interface MarkdownItLike {
  renderer: { rules: { fence?: FenceRule } };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function extendMarkdownIt(md: MarkdownItLike): MarkdownItLike {
  const prev: FenceRule =
    md.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const lang = (tokens[idx].info || "").trim().split(/\s+/)[0];
    if (lang === "pfc") {
      try {
        const svg = renderChartToString(parsePfc(tokens[idx].content));
        return `<div class="pfc-container">${svg}</div>`;
      } catch (e) {
        const msg =
          e instanceof ParseError && e.line > 0
            ? `PFC error (line ${e.line}): ${e.message}`
            : `PFC error: ${(e as Error).message}`;
        return `<pre class="pfc-error">${escapeHtml(msg)}</pre>`;
      }
    }
    return prev(tokens, idx, options, env, self);
  };

  return md;
}

// VS Code calls the object returned from activate() to extend its Markdown
// preview renderer; the whole integration lives in extendMarkdownIt.
export function activate(): { extendMarkdownIt(md: MarkdownItLike): MarkdownItLike } {
  return { extendMarkdownIt };
}

export function deactivate(): void {}
