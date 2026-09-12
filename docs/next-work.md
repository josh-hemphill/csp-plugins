# Next work: strict CSP + hosting adapters

Restore point: `52f0301` (`chore: snapshot the unpublished CSP plugins monorepo rewrite`).
Do not start this plan until the workspace baseline (typed-directives + core, current deps) is in place and this document is explicitly picked up.

## Tooling decisions (baseline, already chosen)

Do **not** reopen these unless something is broken:

| Tool | Choice | Why |
| --- | --- | --- |
| Node | **24** local (`.node-version`); CI **22 / 24 / 26**; `engines.node` `>=22.13` | 22 Maintenance LTS, 24 Active LTS, 26 Current (LTS 2026-10-28). |
| pnpm | **12.4.1** (`packageManager` pin) | Rust CLI; named catalogs + injected workspace packages. `catalogMode: strict` only gates the default catalog — add deps with `pnpm add <pkg> --save-catalog-name <name>`. Install from `latest-12` until npm `latest` moves. |
| CI orchestrator | **GitHub Actions** + [`pnpm/setup@v2`](https://github.com/pnpm/setup) | Installs `packageManager`. Node version comes from the job matrix (`runtime: node@22/24/26`), not from `devEngines.runtime`. |
| Monorepo runner | **pnpm `-r` / `--filter`** | Default pipeline is four packages. Playground and `e2e-tests/test-app` are extra workspace members. Turbo/Nx/moon are extra moving parts. |
| Lint | **OxLint** + **oxfmt** (not type-aware yet) | Same oxc family as obuild. Type-aware lint needs TypeScript 7 / `oxlint-tsgolint`. |
| Markdown | **markdownlint-cli2** | Linter. oxfmt can wrap Markdown via bundled Prettier, but that is not a lint replacement and native Markdown formatting is still unshipped — keep ignoring `*.md` in oxfmt. |
| Spelling | **cspell** | Root `pnpm spell`; CI runs it. |
| Release | **Monup** (`pnpm version`, `pnpm changelog`; CI `release.yml` dry-run by default) | Local version/changelog for review. Do not flip the workflow to a real publish until the packages are ready. Do not reintroduce bumpp/changelogithub. |
| TypeScript | **6.0.x** (not 7) | Last JS-based compiler; `stableTypeOrdering` + no `baseUrl` for TS 7. 7.0 is still `tsgo`. |
| Dual-publish | npm `dist` + JSR source (`typed-directives` first) | See [`docs/publishing.md`](publishing.md). |

Pin files: `package.json#packageManager`, `package.json#devEngines`, `.node-version`.

## Layout (do not reopen)

Keep this DAG: **typed-directives → core → (shared, basic-fscache) → (cli \| unplugin) → e2e**.

Do **not** merge `shared` into `core`, merge `cli` into `unplugin`, add `@csp-plugins/headers`, or start `packages/adapters/` until Area 5. `CspDirectiveHeaders` stays in typed-directives. `CspPluginOptions` currently lives in `packages/shared/src/types.ts` — Area 3 should edit that file or move the type then, not fork a second options interface. Area 5 emitters belong in `packages/adapters/`, not a package named `headers`.

`pnpm build` is the four-package baseline. `pnpm build:all` also compiles cli + unplugin so their export maps fail in CI; their product tests stay out of `pnpm test`. `packages/e2e-tests/test-app` is a workspace member (`@csp-plugins/e2e-test-app`).

## Restored orchestration (done before product Areas 1–5)

These were stripped in the cleanup commit and restored on the new `main` line before first publish:

| Restore | How |
| --- | --- |
| Unit-test coverage | Vitest `@vitest/coverage-v8`. `pnpm test:coverage` writes Cobertura + HTML + JSON. CI (Node 24) uploads the report with `actions/upload-code-coverage` and a job summary. Not Codecov. |
| API docs | TypeDoc for `@csp-plugins/typed-directives` (`pnpm docs:api` → `api-docs/`). `.github/workflows/docs.yml` deploys GitHub Pages from `main`. Keep `packages/typed-directives/CHANGELOG.md`. |
| Contributor list | GitHub-native: `scripts/contributors.ts` reads the contributors API and writes `CONTRIBUTORS.md` plus the marked README block. `.github/workflows/contributors.yml` refreshes it on `main`. |
| Release automation | Monup config + gated `release.yml`. Local `pnpm exec monup version` / `changelog` once `@monup/cli` publishes rewritten deps (`0.3.0` still has `catalog:` / `workspace:*`). |

## Goal

A developer can add one plugin (or one CLI invocation) and get a **strict** Content-Security-Policy with hashes for inline script/style, optional SRI, and **no `'unsafe-inline'` by default** — then drop the same declarative header list onto common hosts and servers without hand-writing nginx/Netlify/Vercel config.

## Current baseline (what not to redo)

  - `@csp-plugins/typed-directives` already maps typed directives to `CspDirectiveHeaders`.
  - `@csp-plugins/core` already parses HTML, hashes/nonces, injects `<meta>`, and can hash externals.
  - CLI already writes `csp-headers.json`. Bundler plugins only write `.csp-manifest`.
  - Plugins do **not** transform HTML (`generateCsp` is unused). Manifest hashes are often raw base64. Auto-manifest still allows `'unsafe-inline'`.

## Stack graph

```text
Area 1 (hash contract)
  ← Area 2 (strict defaults in core)
    ← Area 3 (Vite/unplugin HTML + headers at build)
      ← Area 4 (CLI consumes same contract; drop unsafe-inline auto-manifest)
        ← Area 5 (host adapters: Netlify, Vercel, nginx, Express)
```

Areas 3 and 5 conflict if both invent header-file formats; Area 1 owns the canonical `CspDirectiveHeaders` + hash string contract.

## Conflict map

  - Hash string format (`sha256-<b64>` vs raw b64) — Area 1. Do not “fix” this inside plugin or adapter PRs.
  - `CSPResult.headers` and `generateHeaders` — Area 2.
  - Vite `transformIndexHtml` / `generateCsp` — Area 3. CLI post-process stays valid as a fallback.
  - `csp-headers.json` shape — Area 1/5. Adapters must consume `CspDirectiveHeaders`, not invent a second JSON schema.

---

### Area 1: Hash and header contract

  - Status: **done on this line** — `generateHash` returns `sha256|sha384|sha512-<base64>`, `toHashSource` is idempotent, `CommonAssetTracker.generateManifest` awaits pending hashes, integrity/CSP sources reuse the same string (no double-prefix). Shared now has a Vitest project.
  - Goal: Every hash that appears in a manifest, integrity attribute, or CSP source is `sha256|sha384|sha512-<base64>`. `getHeaders()` is the only public header map.
  - Depends on: nothing (baseline)
  - Out of scope: plugin HTML transform, host files, changing default directives
  - Likely files: `packages/core/lib/crypto.ts`, `packages/shared/src/asset-tracker.ts`, `packages/core/lib/csp-processor.ts`, unit tests in core **and a new shared Vitest project** (none exists yet)
  - `CspDirectiveHeaders` stays in `@csp-plugins/typed-directives`. Area 1 owns the hash *string* contract, not a new headers package.
  - Public surface:

```ts
function generateHash(content: string, algorithm: ValidCrypto): Promise<`${ValidCrypto}-${string}`>
interface CSPResult {
  builder: CspDirectives
  headers: CspDirectiveHeaders
  nonces: { script?: string; style?: string }
  analysis: HTMLAnalysisResult
  html?: string
}
```

  - Pseudo-code:
    - `generateHash` returns `${algorithm}-${b64}`; callers stop prefixing a second time.
    - `CommonAssetTracker.trackAsset` **awaits** hash generation (or `trackAsset` becomes async / `generateManifest` waits on pending hashes). Never write a manifest with a racing undefined hash.
    - Integrity attributes use the same prefixed string.
  - Tests: existing e2e TODOs in `csp-hash-validation.test.ts` / `csp-integrity-hashing.test.ts` become assertions, not warnings. Core unit tests check prefix + no double-prefix.
  - Risks: old manifests without prefix; migrate by detecting missing `sha\d{3}-`.
  - Conflicts with: Area 3 (plugin reads hashes), Area 5 (headers files)

### Area 2: Strict defaults in core

  - Goal: Default policy is `'self'` + hashes/nonces. `'unsafe-inline'` / `'unsafe-eval'` only behind `development.allowUnsafeInline` / `allowUnsafeEval`.
  - Depends on: Area 1
  - Out of scope: bundler plugins, host adapters, SSR nonce sessions
  - Likely files: `packages/core/lib/csp-processor.ts`, `packages/core/tests/*`
  - Public surface: keep `CSPProcessorOptions`; change defaults, not option names.
  - Pseudo-code:
    - When `generateHeaders` is true, `result.headers = builder.getHeaders()`.
    - When false, `result.headers` is empty (existing test).
    - Default `script-src` / `style-src` start as `['self']` plus computed hashes/nonces.
    - Do not add remote URLs to `script-src` when hashing; hashes/SRI are the allow mechanism (already the intended core behavior).
  - Tests: processor tests that currently expect `'unsafe-inline'` in prod paths should fail and be rewritten. Dev-mode tests keep the escape hatch.
  - Risks: sites that relied on unsafe-inline via auto-manifest — that is Area 4.
  - Conflicts with: Area 4 defaults

### Area 3: Build-time HTML + headers (Vite first)

  - Goal: `cspVitePlugin()` with no extra CLI step injects the CSP meta tag into built HTML and writes `csp-headers.json` next to output. `generateCsp` defaults **true**.
  - Depends on: Area 2
  - Out of scope: Webpack/Rollup/esbuild/Nuxt parity (follow-up PRs), SSR nonces, host-specific files
  - Likely files: `packages/unplugin/src/vite.ts`, `packages/unplugin/src/dev-server-integration.ts`, `packages/unplugin/src/index.ts` (remove Hello Unplugin stub), `packages/shared/src/types.ts` (`CspPluginOptions` — do not invent a second options type), e2e `csp-browser-validation.test.ts`
  - Public surface:

```ts
interface CspPluginOptions {
  trackAssets?: boolean
  generateCsp?: boolean // default true
  emitHeadersFile?: boolean | string // default 'csp-headers.json'
  cspProcessorOptions?: Partial<CSPProcessorOptions>
  manifestDir?: string
  devServer?: boolean
}
```

  - Pseudo-code:
    - `generateBundle` / `closeBundle`: track assets (await hashes).
    - `transformIndexHtml` (enforce post): `CSPProcessor.processHTML(html)` → replace HTML.
    - If `devServer`, reuse `DevServerIntegration.processHTML` on the HTML middleware.
    - Write `CspDirectiveHeaders` JSON beside `outDir`.
  - Tests: browser e2e TODOs become: built `index.html` has `meta[http-equiv=Content-Security-Policy]`, Puppeteer reports zero violations for the test app without `'unsafe-inline'`.
  - Risks: Vite HTML transform order vs other plugins; hashed filenames vs HTML src.
  - Conflicts with: Area 4 (CLI should no-op if HTML already processed), Area 5 (same headers JSON)

### Area 4: CLI uses the same contract

  - Goal: `csp-cli dist/` remains the post-build path for non-Vite tools. Auto-manifest no longer injects `'unsafe-inline'`.
  - Depends on: Area 2
  - Out of scope: new host formats (Area 5)
  - Likely files: `packages/cli/src/cli.ts`, CLI README
  - Pseudo-code:
    - Default baseDirectives: `'self'` + hashes from processor, not unsafe-inline.
    - `--headers-output` still writes `getHeaders()` JSON.
    - If HTML already has a CSP meta from Area 3, replace-or-skip per `metaTagOptions.replaceExisting`.
  - Tests: scenario tests that assume unsafe-inline in auto-manifest must switch to hash-based expectations.
  - Conflicts with: Area 2 defaults

### Area 5: Hosting and server adapters

  - Goal: One declarative `CspDirectiveHeaders` object can be emitted as native config for common hosts. Least developer intervention: `--emit netlify,vercel` or auto-detect from repo files.
  - Depends on: Area 1 (header map), Area 3/4 (something actually produces the map)
  - Out of scope: every host on earth; start with the set below. No new CSP semantics.
  - Likely files: new `packages/adapters/` (not `packages/headers/` — that name collides with `CspDirectiveHeaders`), CLI flag `--emit`, small fixtures
  - Public surface:

```ts
interface HeaderAdapter {
  id: 'json' | 'netlify' | 'cloudflare-pages' | 'vercel' | 'firebase' | 'nginx' | 'apache' | 'caddy' | 'express'
  emit(headers: CspDirectiveHeaders, options?: { pathPrefix?: string }): string | Record<string, unknown>
}
```

  - Pseudo-code (emitters only; do not fetch or scan HTML here):

```text
json     → current csp-headers.json
netlify / cloudflare-pages → `_headers`:
  /*
    Content-Security-Policy: ...
    Referrer-Policy: ...
    Report-To: ...
vercel   → vercel.json { headers: [{ source: '/(.*)', headers: [...] }] }
firebase → firebase.json hosting.headers
nginx    → add_header ... always;
apache   → Header always set ...
caddy    → header { ... }
express  → middleware (req, res, next) => { res.set(headers); next() }
```

  - Empty header values (`Report-To: ''`) are omitted.
  - Tests: golden files per adapter from a fixed `CspDirectiveHeaders` fixture. Round-trip JSON adapter. No live deploys.
  - Risks: Vercel/Netlify merge vs overwrite of existing `_headers` / `vercel.json` — adapters should merge CSP-related keys, not clobber unrelated headers.
  - Conflicts with: none if they only consume `CspDirectiveHeaders`

## Explicitly later (not in this stack)

  - SSR / per-request nonces (GitHub issue #1 on vite-plugin-csp). Static hashes are the zero-config path.
  - Parsing URLs embedded in JS (framework-specific).
  - Webpack/Rollup/esbuild/Nuxt HTML transform parity after Vite works.
  - Reconcile published `csp-typed-directives` npm package vs workspace package name.
  - GitHub default-branch switchover: new work lands on isolated `main`; `latest` stays the published vite-plugin-csp / snapshot line until the GitHub default is switched.

## Known bugs to absorb into the stack (do not “drive-by” before this plan)

  - `CommonAssetTracker` hash generation is fire-and-forget; manifests can miss hashes.
  - `packages/unplugin/src/index.ts` default export is still the unplugin starter stub.
  - `generateCsp` currently defaults **false** in `packages/shared/src/asset-tracker.ts`; Area 3 wants Vite default **true**. Flip the contract in one place, not only the Vite wrapper.
  - Local rewrite history is **not** a fast-forward of `origin/latest` (published vite-plugin-csp 1.1.2).
