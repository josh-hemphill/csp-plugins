# CSP build plugins

This package is part of the unpublished [CSP Plugins workspace](../../README.md).
The Vite plugin processes static HTML. Webpack, Rollup, and esbuild integrations
record build assets for post-build processing.

## Vite 8

Import the Vite entry point into your Vite config.

```ts
import csp from '@csp-plugins/unplugin/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [csp()],
});
```

A production build adds a CSP meta tag to each emitted HTML page and emits
`csp-headers.json` in the output directory. One page produces a flat header map.
A multi-page build produces a `routes` object keyed by deployed HTML path,
including the Vite `base`. Set `generateCsp: false` to track assets only,
`emitHeadersFile: false` to skip JSON, or pass a filename to change it.

Static policies use SHA-256 by default and are reproducible. When serving an
HTTP policy, select the entry for the requested HTML document. A single policy
from a multi-page build can block other pages. Meta policies apply to their own
document. Directives such as `frame-ancestors` require an HTTP header.

Ordinary Vite dev and HMR run unchanged by default. `devServer: true` opts into
a policy on dev HTML. Vite and framework plugins can inject styles or scripts at
runtime that require a deliberate development policy. Verify these flows before
enabling the option on a development application.

## Asset tracking

Use the plugin for your build tool. The named exports from the package root
are the same factories as the default exports from their individual entry points.

```ts
import { esbuild, rollup, webpack } from '@csp-plugins/unplugin';

const webpackPlugins = [webpack()];
const rollupPlugins = [rollup()];
const esbuildPlugins = [esbuild()];
```

Webpack 5 and Rollup 4 track emitted production assets. esbuild 0.28 tracks
disk and in-memory output when an `outfile` or `outdir` is configured. The disk build enables esbuild metadata to discover its output files. The
plugins use `.csp-manifest` relative to the build root or working directory.
Pass an absolute `manifestDir` to make the destination explicit. Run the
[CLI](../cli/README.md) on the final HTML directory to generate policies for
these pipelines.

For a prerendered Nuxt site, run the CLI on the published static directory
after generation. The `/nuxt` export is an experimental build-hook helper
requiring a Nuxt instance as its second argument. Nitro middleware, runtime
SSR responses, and per-request nonces are outside the static workflow.
