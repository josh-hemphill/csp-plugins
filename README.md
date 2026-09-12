# CSP Plugins

Monorepo for generating typed Content-Security-Policy meta tags and headers from HTML and build assets.

This is an unpublished rewrite of [vite-plugin-csp](https://github.com/josh-hemphill/csp-plugins). Product work (strict zero-config CSP, host adapters) is tracked in [`docs/next-work.md`](docs/next-work.md).

## Requirements

  - **Node.js** 22.13+ (CI tests 22, 24, and 26; `.node-version` is 24 Active LTS)
  - **pnpm** 12.4.1 (pinned via `packageManager`; Corepack or `pnpm/setup` will download it — npm `latest` is still the 11 line)
  - **TypeScript** 6.0.x (workspace catalog). **OxLint** lints code; **markdownlint-cli2** lints Markdown; **cspell** checks spelling; **oxfmt** formats code (type-aware lint waits for TypeScript 7)

```shell
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:markdown
pnpm spell
pnpm fmt:check
pnpm test
pnpm test:coverage
pnpm docs:api
```

`pnpm build` covers `@csp-plugins/typed-directives`, `@csp-plugins/core`, `@csp-plugins/shared`, and `@csp-plugins/basic-fscache`. `pnpm build:all` also builds `@csp-plugins/cli` and `@csp-plugins/unplugin` (CI uses this). `pnpm test` runs unit tests for typed-directives, core, shared, basic-fscache, and the workspace scripts. `pnpm test:coverage` adds V8 coverage (Cobertura + HTML + JSON) for typed-directives, core, shared, and basic-fscache; CI uploads that report to GitHub Code Quality on Node 24. `pnpm docs:api` generates TypeDoc HTML for `@csp-plugins/typed-directives` (deployed from `main` to GitHub Pages).

## Packages

| Package | Role |
| --- | --- |
| `@csp-plugins/typed-directives` | Typed CSP / Report-To / Referrer-Policy → header strings |
| `@csp-plugins/core` | HTML analysis, hashes/nonces, meta-tag injection |
| `@csp-plugins/shared` | Asset tracking and `.csp-manifest` I/O |
| `@csp-plugins/basic-fscache` | Optional filesystem cache for fetched externals |
| `@csp-plugins/cli` | Post-build HTML + `csp-headers.json` (`build:all`, not default `test`) |
| `@csp-plugins/unplugin` | Vite / Webpack / Rollup / esbuild / Nuxt plugins (`build:all`, not default `test`) |

## Architecture

See [`CORE_MODULE_FLOW.md`](CORE_MODULE_FLOW.md). Dual-publish (npm dist + JSR TypeScript source) is documented in [`docs/publishing.md`](docs/publishing.md). API docs for `@csp-plugins/typed-directives` are generated with TypeDoc (`pnpm docs:api`) and published to GitHub Pages from `main`.

Local release prep is [Monup](https://github.com/josh-hemphill/monup) (`pnpm exec monup version` then `pnpm exec monup changelog`) once `@monup/cli` is installable — see [`docs/publishing.md`](docs/publishing.md). CI publish is a manual workflow and stays dry-run until the packages are ready for a first public npm/JSR release.

## Contributors

The [contributors list](CONTRIBUTORS.md) is generated from the GitHub contributors API on pushes to `main`. Do not edit it by hand.

<!-- CONTRIBUTORS:START -->
  - <img src="https://avatars.githubusercontent.com/u/46608115?v=4" width="24" height="24" alt=""> [josh-hemphill](https://github.com/josh-hemphill)
<!-- CONTRIBUTORS:END -->
