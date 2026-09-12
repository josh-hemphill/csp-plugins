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
```

`pnpm build` covers `@csp-plugins/typed-directives`, `@csp-plugins/core`, `@csp-plugins/shared`, and `@csp-plugins/basic-fscache`. `pnpm build:all` also builds `@csp-plugins/cli` and `@csp-plugins/unplugin` (CI uses this). `pnpm test` runs unit tests for typed-directives, core, and basic-fscache. E2e is present but not in the default test pipeline.

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

See [`CORE_MODULE_FLOW.md`](CORE_MODULE_FLOW.md). Dual-publish (npm dist + JSR TypeScript source) is documented in [`docs/publishing.md`](docs/publishing.md).
