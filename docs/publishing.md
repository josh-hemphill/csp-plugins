# npm + JSR dual-publish

npm and JSR ship **different artifacts from the same source**. Mixing those maps is what broke package resolution last time.

## Contract

| Registry | Artifact | `exports` point at |
| --- | --- | --- |
| npm | `obuild` `dist/*.mjs` + `*.d.mts` | compiled JS and generated types only |
| JSR | TypeScript source | `src/**/*.ts` via `jsr.json` |

Rules that keep Node, bundlers, and TypeScript from mixing graphs:

1. **npm `exports` never point at `.ts`.** No `source`, `typescript`, or `default` condition that lands on `src/`.
2. **npm `files` does not include `src`.** Consumers who install from npm must not be able to import source by path.
3. **Source keeps explicit `.ts` import specifiers.** JSR requires that. npm must rewrite them to `.mjs` in `dist`.
4. **Do not add a `"types"` field that points at source** while `"import"` points at `dist`. TypeScript will follow `.ts` specifiers inside those files and then fail to resolve the published `.mjs` graph (or the reverse).

How the rewrite happens depends on the obuild entry type:

  - **transform** packages (`core`, `shared`, `basic-fscache`, `unplugin`) set `oxc.typescript.rewriteImportExtensions` via `scripts/oxc.default.ts`.
  - **bundle** packages (`typed-directives`) use rolldown; it rewrites specifiers as part of the bundle. `rewriteImportExtensions` is not a bundle-entry option. Do not switch this package to transform without adding that oxc flag, or `.ts` specifiers would leak into npm `dist`.

Workspace packages consume each other through `workspace:*` and the npm export map (`dist`). Package tests that import `../src/...` are local-only and are not part of either publish graph.

## First package

`@csp-plugins/typed-directives` is the JSR candidate: no `node:` APIs, no DOM parser, source already uses `.ts` specifiers.

`pnpm publish:jsr:dry` validates the source graph (passes `--allow-dirty` so it works during development). A real `jsr publish` should run from a clean git tree **without** `--allow-slow-types`. If dry-run starts requiring `--allow-slow-types` again, add explicit return types on the public `compose` helpers — do not “fix” it by pointing npm `exports` at source. Claiming the `@csp-plugins` scope on jsr.io is still required before a real publish.

`@csp-plugins/core` stays npm-only until htmlparser2 and Node builtins have an explicit JSR dependency story.

## Release (Monup)

Version and changelog are meant to stay local so they can be reviewed before anything is published:

```shell
pnpm exec monup version
pnpm exec monup changelog
```

Config lives in [`monup.config.ts`](../monup.config.ts). Git tags use the package strategy; `push` is off so a local run does not update the remote until you push the commit yourself.

CI publish is [`.github/workflows/release.yml`](../.github/workflows/release.yml): manual `workflow_dispatch`, dry-run by default. Do not switch that workflow to a real npm/JSR publish until the packages are ready. `pnpm publish:jsr:dry` remains the JSR graph check.

**Blocker:** `@monup/cli@0.3.0` is on npm, but its tarball still lists `catalog:` and `workspace:*` dependencies, so it cannot be installed into this workspace yet. Keep the config and workflow; add `@monup/cli` / `@monup/options` to the `dev` catalog after a publish that rewrites those specifiers.

## Type-aware OxLint

OxLint is the workspace linter. `--type-aware` / `oxlint-tsgolint` needs TypeScript 7 (`tsgo`). Stay on TypeScript 6 + `tsc --noEmit` until the compiler port is the workspace `typescript` package.
