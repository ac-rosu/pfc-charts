# PFC Charts — Fumadocs adapter (`@pfc/fumadocs`)

Renders ISA-88 **Procedure Function Charts** in a [Fumadocs](https://fumadocs.dev)
(Next.js + MDX) site, reusing the shared engine in [`../core`](../core) (`@pfc/core`).

`PFC` is a **React Server Component**: it runs parser + layout + renderer at
build/request time and emits inline SVG — **no client-side JavaScript**, fully static
(SSG/SEO friendly). Theming maps onto Fumadocs' `--color-fd-*` tokens.

## Install

The build emits a self-contained, compiled package in `output/fumadocs/` — `@pfc/core`
is bundled in and React stays a peer dependency, so it installs and resolves like any
normal package (no `transpilePackages`, no separate `@pfc/core`).

From this repo, build and pack in one step:

```bash
npm run pack:fumadocs        # -> output/pfc-fumadocs-<version>.tgz
```

Then in your docs app:

```bash
npm install /absolute/path/to/output/pfc-fumadocs-<version>.tgz
```

Import the stylesheet once (e.g. in your root layout or global CSS):

```ts
import "@pfc/fumadocs/styles.css";
```

## Usage

### Option A — fenced `pfc` blocks (recommended)

Add the remark plugin to your MDX pipeline and register the `PFC` component in the MDX
scope, then author charts as normal fenced code blocks.

```ts
// source.config.ts (Fumadocs MDX) — or your MDX loader options
import { remarkPfc } from "@pfc/fumadocs/remark";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkPfc],
    // or, if your site serves pages with a trailing slash (`trailingSlash: true`):
    // remarkPlugins: [[remarkPfc, { trailingSlash: true }]],
  },
});
```

```tsx
// mdx-components.tsx
import { PFC } from "@pfc/fumadocs";

export function getMDXComponents(components) {
  return { PFC, ...components };
}
```

````mdx
```pfc
pfc Simple Batch
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat" :operation
```
````

The plugin rewrites each ` ```pfc ` fence into `<PFC source="..."/>`, and passes the
page's file path so step links resolve correctly (see below).

### Step links

A step with `link "charge.md#phases"` becomes a link to that page. The target is
resolved as a file next to the page the chart is on, the way VS Code and Obsidian
resolve it, and turned into the page's URL: `.md`/`.mdx` and `index` are dropped,
`(group)` folders are skipped, and the heading becomes its slug (`#phases`). This works
from any page to any other, at any folder depth. Set `trailingSlash: true` on the remark
plugin if your site serves pages at URLs ending in `/`; otherwise links come out one
folder too deep.

### Option B — use the component directly

```mdx
import { PFC } from "@pfc/fumadocs";

<PFC source={`pfc Simple Batch
step "Charge Reactor" :operation
trans "level >= 500L"
step "Heat" :operation`} />
```

## API

- `PFC` — server component. Props: `source?: string`, `children?: string` (template
  literal), `className?: string`, plus for step links `page?: string` (the content file
  the chart is on; the remark plugin sets it), `trailingSlash?: boolean`, and
  `linkHref?: (target) => string` to build hrefs yourself. Parse errors render as a
  `.pfc-error` block.
- `remarkPfc(options?)` — remark plugin. Options: `component` (default `"PFC"`),
  `lang` (default `"pfc"`), `trailingSlash` (default `false`). Use it as `remarkPfc`,
  `[remarkPfc, options]` or `remarkPfc(options)`. Also the default export.
- `pageHref(target, page, trailingSlash?)` / `docsHref(target)` — the href builders,
  with and without the page's file path.
- `@pfc/fumadocs/styles.css` — theme stylesheet (Fumadocs tokens).

The chart language is identical across all targets — see
[../obsidian/DOCUMENTATION.md](../obsidian/DOCUMENTATION.md) and the authoring skill in
[../../pfc-skills](../../pfc-skills).

## Build & release

`node build.mjs fumadocs` bundles this adapter to compiled ESM in `output/fumadocs/`
(`@pfc/core` inlined, React external) with type declarations and an installable
`package.json`. `npm run build:fumadocs` type-checks (its own `tsconfig.json`) first.

To cut a new version: bump `version` in this folder's `package.json` (the build reads it
into the packaged manifest), then run `npm run pack:fumadocs` from the repo root to
produce `output/pfc-fumadocs-<version>.tgz`, and reinstall it in your docs app.
