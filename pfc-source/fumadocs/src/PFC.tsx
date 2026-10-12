// PFC Charts — Fumadocs (Next.js + MDX) React component.
//
// A React *Server* Component: it runs the shared @pfc/core engine at
// build/request time and emits inline SVG, so there is no client-side
// JavaScript and charts are fully static (great for SSG/SEO). Theming comes
// from ./styles.css, which maps the chart classes onto Fumadocs' --color-fd-*
// tokens.
import { parsePfc, ParseError, renderChartToString } from "@pfc/core";
import { docsHref, pageHref } from "./links";

export interface PFCProps {
  /** PFC source. Preferred (the remark plugin passes this). */
  source?: string;
  /** Alternatively, a template-literal child: <PFC>{`pfc ...`}</PFC>. */
  children?: string;
  /** Extra class(es) merged onto the chart container. */
  className?: string;
  /**
   * The content file this chart is on (the remark plugin fills it in). Step links
   * are then resolved as files next to it, so they work at any folder depth.
   */
  page?: string;
  /** The site serves pages with a trailing slash (Next.js `trailingSlash: true`). */
  trailingSlash?: boolean;
  /**
   * Maps a step's `link` target to its href, overriding the default: {@link pageHref}
   * when `page` is known, otherwise {@link docsHref} (relative to the current URL).
   */
  linkHref?: (target: string) => string;
}

export function PFC({ source, children, className, page, trailingSlash, linkHref }: PFCProps) {
  const href = linkHref ?? (page ? (t: string) => pageHref(t, page, trailingSlash) : docsHref);
  const code = String(source ?? children ?? "");
  const container = className ? `pfc-container ${className}` : "pfc-container";

  let svg: string;
  try {
    // core escapes all user-supplied text, so the markup is safe to inject.
    svg = renderChartToString(parsePfc(code), { links: true, linkHref: href });
  } catch (e) {
    const msg =
      e instanceof ParseError && e.line > 0
        ? `PFC error (line ${e.line}): ${e.message}`
        : `PFC error: ${(e as Error).message}`;
    return <pre className="pfc-error">{msg}</pre>;
  }

  return <div className={container} dangerouslySetInnerHTML={{ __html: svg }} />;
}
