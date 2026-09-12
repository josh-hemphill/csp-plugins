# Contributing to csp-plugins

Thanks for contributing. This is a pnpm 12 TypeScript monorepo. The unpublished product plan lives in [`docs/next-work.md`](../docs/next-work.md) — do not start strict-CSP defaults, Vite HTML injection, hash-prefix contract changes, or hosting adapters unless that document is explicitly picked up.

This project follows [the repository's code of conduct](CODE_OF_CONDUCT.md). Report unacceptable behavior to <dev@joshuahemphill.com>.

## Local setup

Requirements are in the root [`README.md`](../README.md): Node.js 22.13+ (local `.node-version` is 24), pnpm 12.4.1 via `packageManager`.

```shell
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm test
pnpm test:coverage
pnpm docs:api
```

| Script | What it does |
| --- | --- |
| `pnpm build` | typed-directives, core, shared, basic-fscache |
| `pnpm build:all` | those four plus cli and unplugin (CI uses this) |
| `pnpm test` | Vitest unit tests for typed-directives, core, basic-fscache, and `scripts/` |
| `pnpm test:coverage` | same tests with V8 coverage (Cobertura + HTML + JSON) |
| `pnpm docs:api` | TypeDoc HTML for `@csp-plugins/typed-directives` |
| `pnpm contributors` | refresh `CONTRIBUTORS.md` and the README block from the GitHub API |
| `pnpm exec monup version` / `changelog` | Monup local version bump and changelog, once `@monup/cli` is installable |
| `pnpm lint` | OxLint with `--deny-warnings` |
| `pnpm lint:markdown` | markdownlint-cli2 (check; `lint:markdown:fix` writes) |
| `pnpm spell` | cspell |
| `pnpm fmt` / `pnpm fmt:check` | oxfmt (code; Markdown is linted, not formatted) |
| `pnpm typecheck` | `tsc --noEmit` |

Add dependencies with a named catalog, not a default `catalog:` entry:

```shell
pnpm add <pkg> --save-catalog-name <build|dev|logging|parsing|plugin-systems|test|types>
```

Keep the package DAG: **typed-directives → core → (shared, basic-fscache) → (cli \| unplugin) → e2e**. Do not merge packages or add adapters until Area 5 of the product plan.

## Bugs and enhancements

Search [existing issues](https://github.com/josh-hemphill/csp-plugins/issues) first. Use the [bug](ISSUE_TEMPLATE/bug_report.md) or [feature](ISSUE_TEMPLATE/feature_request.md) template.

A useful report includes the package involved (`@csp-plugins/core`, unplugin, CLI, …), Node and pnpm versions, a minimal reproduction, the observed vs expected behavior, and a stack trace when something throws.

## Pull requests

1. Open against this repository (`josh-hemphill/csp-plugins`).
2. Match the styleguides below. Prefer named exports.
3. Add or update Vitest tests next to the code you change.
4. Wait for CI (`build:all`, typecheck, lint, markdownlint, cspell, fmt:check, test; Node 24 also runs coverage and TypeDoc) to pass. If a check fails for a reason unrelated to your change, say so on the PR.

The [contributors list](../CONTRIBUTORS.md) is generated from GitHub's contributors API on pushes to `main`. Do not hand-edit that file or the marked block in the root README.

## Styleguides

### Git commit messages

Write a concise subject that explains **why**, not a file list. Conventional prefixes (`feat:`, `fix:`, `chore:`) are welcome when they fit.

### TypeScript and JavaScript

Lint with [OxLint](https://oxc.rs/docs/guide/usage/linter). Format with [oxfmt](https://oxc.rs/docs/guide/usage/formatter) (tabs, width 3; YAML uses 2 spaces). Lint Markdown with [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2); oxfmt does not replace it. Spell-check with cspell. Prefer object spread over `Object.assign()`, inline named `export`s, and platform-agnostic code unless the file is already Node-only (CLI, cache, tests).

### Tests

Use [Vitest](https://vitest.dev/). Colocate unit tests with the package they cover. Treat `describe` as a noun or situation and `it` as a statement about state.

```js
describe('a dog', () => {
	it('barks', () => {
		describe('when the dog is happy', () => {
			it('wags its tail', () => {
				// spec here
			});
		});
	});
});
```

### Documentation

Use Markdown. Package READMEs describe the public API; [`docs/publishing.md`](../docs/publishing.md) covers npm vs JSR. TypeDoc HTML for typed-directives is generated with `pnpm docs:api` and deployed to GitHub Pages from `main`. Do not import `.ts` files from the npm `dist` packages.

## Working on core packages

Read the Vitest files beside the source (`packages/typed-directives/tests`, `packages/core/tests`, `packages/basic-fscache`). Many internals are named exports, so you can exercise them in isolation. CSP work is mostly parsers and header composition — keep that platform-agnostic unless a package is explicitly Node-only.
