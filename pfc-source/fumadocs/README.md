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
    remarkPlugins: [remarkPfc()],
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

The plugin rewrites each ` ```pfc ` fence into `<PFC source="..."/>`.

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
  literal), `className?: string`. Parse errors render as a `.pfc-error` block.
- `remarkPfc(options?)` — remark plugin. Options: `component` (default `"PFC"`),
  `lang` (default `"pfc"`). Also the default export.
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
