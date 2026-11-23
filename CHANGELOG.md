# Changelog

## v2.0.0

The CSP Plugins workspace replaces the standalone `vite-plugin-csp` source
with build plugins, a post-build CLI, and typed CSP utilities. This GitHub
source release requires Node.js 22.13+ and pnpm 12.4.1 to build.
The workspace packages remain unpublished to npm and JSR.

  - **Vite 8** generates a CSP meta tag and HTTP header values for each static
  page. Policies use deterministic inline hashes, and local integrity checks
  use final asset bytes. Development CSP is opt-in.
  - **Post-build CLI** generates policies from static HTML, preserves authored
  CSP by default, and reports stale local integrity pins and conflicting
  deployment rules before writing output.
  - **Hosting** supports per-page headers for Netlify, Cloudflare Pages, Vercel,
  and Firebase, with JSON output and single-policy snippets for nginx, Apache,
  Caddy, and Express.
  - **Other build tools** include asset manifests for Webpack 5, Rollup 4, and
  esbuild 0.28. Run the CLI on their final HTML or on prerendered Nuxt output.

### Upgrade notes

Build the workspace with `pnpm install --frozen-lockfile` and
`pnpm build:all`. The Vite factory now lives at `@csp-plugins/unplugin/vite`.
Multi-page output maps headers to the deployed HTML paths under `routes`.
Follow the [build plugin guide](packages/unplugin/README.md) and
[CLI and hosting guide](packages/cli/README.md) to update your integration.
Runtime SSR and per-request nonces require server integration. Use regular
expressions without the global or sticky flag for resource filters.

[Full changes since v1.1.2](https://github.com/josh-hemphill/csp-plugins/compare/v1.1.2...v2.0.0)
