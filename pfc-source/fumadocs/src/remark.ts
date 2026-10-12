// Remark plugin: rewrite ```pfc fenced code blocks into <PFC source="..."/>
// MDX elements, so authors get the familiar fenced-block experience instead of
// importing and calling the component by hand.
//
// The named component (default "PFC") must be in the MDX scope — register it in
// your Fumadocs `mdx-components.tsx` / `getMDXComponents()`.
//
// Typed structurally to avoid a hard dependency on unified/mdast typings.

interface MdastNode {
  type: string;
  [key: string]: unknown;
}
interface Parent extends MdastNode {
  children: MdastNode[];
}
interface Code extends MdastNode {
  type: "code";
  lang?: string | null;
  value: string;
}
interface VFileLike {
  path?: string;
  cwd?: string;
}

export interface RemarkPfcOptions {
  /** Name of the component to emit (must be in MDX scope). Default "PFC". */
  component?: string;
  /** Fence language to match. Default "pfc". */
  lang?: string;
  /**
   * The site serves pages with a trailing slash (Next.js `trailingSlash: true`), so
   * step links are built for URLs like "/docs/units/reaction/". Default false.
   */
  trailingSlash?: boolean;
}

type Transformer = (tree?: Parent, file?: VFileLike) => Transformer | void;

function isParent(node: MdastNode): node is Parent {
  return Array.isArray((node as Parent).children);
}

// The MDX file being compiled, relative to the project root ('/'-separated), so the
// chart can resolve step links as files next to it.
function pagePath(file?: VFileLike): string | undefined {
  if (!file?.path) return undefined;
  const path = file.path.replace(/\\/g, "/");
  const cwd = (file.cwd ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  return cwd && path.startsWith(cwd + "/") ? path.slice(cwd.length + 1) : path;
}

function jsxElement(name: string, source: string, page: string | undefined, trailingSlash: boolean): MdastNode {
  const attributes: MdastNode[] = [{ type: "mdxJsxAttribute", name: "source", value: source }];
  if (page) attributes.push({ type: "mdxJsxAttribute", name: "page", value: page });
  if (trailingSlash) attributes.push({ type: "mdxJsxAttribute", name: "trailingSlash", value: null });
  return { type: "mdxJsxFlowElement", name, attributes, children: [] };
}

function transform(parent: Parent, make: (source: string) => MdastNode, lang: string): void {
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (node.type === "code" && (node as Code).lang === lang) {
      parent.children[i] = make((node as Code).value);
    } else if (isParent(node)) {
      transform(node, make, lang);
    }
  }
}

export function remarkPfc(options: RemarkPfcOptions = {}) {
  const component = options.component ?? "PFC";
  const lang = options.lang ?? "pfc";
  const trailingSlash = options.trailingSlash ?? false;
  // Works both as `remarkPlugins: [remarkPfc]` / `[[remarkPfc, options]]` (unified calls
  // it with the options) and as `[remarkPfc(options)]` (unified then calls the returned
  // function with no tree while setting up, so it hands itself back as the transformer).
  const transformer: Transformer = (tree, file) => {
    if (!tree) return transformer;
    const page = pagePath(file);
    transform(tree, (source) => jsxElement(component, source, page, trailingSlash), lang);
  };
  return transformer;
}

export default remarkPfc;
