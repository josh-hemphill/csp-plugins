# @csp-plugins/typed-directives

Typed CSP, Report-To, and Referrer-Policy values, plus `CspDirectives` to turn them into header strings.

Kept up to date with [Mozilla's CSP documentation of available directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy).

npm ships compiled `dist/*.mjs` + `*.d.mts`. JSR ships the TypeScript source under the same package name. Do not import `.ts` files from the npm package.

## Installation

```shell
pnpm add @csp-plugins/typed-directives
```

JSR:

```shell
pnpm add jsr:@csp-plugins/typed-directives
```

## Basic usage

Pass directives at construction or assign them afterward. Read the header map from `getHeaders()` — there is no `headers` field.

```ts
import { CspDirectives } from '@csp-plugins/typed-directives';

const csp = new CspDirectives({
	'child-src': 'none',
});

csp.CSP['connect-src'] = 'example.com';
csp.CSP['navigate-to'] = ['example.com', 'example2.com'];

csp.getHeaders();
// {
//   'Content-Security-Policy-Report-Only': '',
//   'Content-Security-Policy':
//     "child-src 'none'; connect-src example.com; navigate-to example.com example2.com",
//   'Report-To': '',
//   'Referrer-Policy': 'strict-origin-when-cross-origin',
// }
```

The default Referrer-Policy is `strict-origin-when-cross-origin`.

## Report-To and report-only

`ReportTo` lives on the `./csp.types` subpath.

```ts
import { CspDirectives } from '@csp-plugins/typed-directives';
import type { ReportTo } from '@csp-plugins/typed-directives/csp.types';

const reportTo: ReportTo[] = [
	{
		max_age: 12000,
		group: 'example-group-name',
		endpoints: [{ url: 'https://example.com' }],
	},
];

const csp = new CspDirectives(
	{
		'child-src': 'none',
		'connect-src': 'example.com',
		'report-to': 'example-group-name',
	},
	reportTo,
	{ 'connect-src': 'example.com' },
	'strict-origin',
);

csp.getHeaders();
```

## Directive names and `DirectiveMap`

`DirectiveMap.get(name)` returns `{ values, categories }`, not a bare source-category array. `values` is the flattened compose helpers for those categories.

```ts
import {
	DirectiveMap,
	directiveNamesList,
	type DirectiveName,
	type DirectiveResult,
} from '@csp-plugins/typed-directives';

const names = directiveNamesList;
const name: DirectiveName = 'report-to';
const reportTo: DirectiveResult | undefined = DirectiveMap.get(name);
reportTo?.categories; // ['primitiveSourceString']
reportTo?.values; // [{ displayName, consumes, compose }, ...]
```

`CspDirectives` accepts `ReportTos` (`ReportTo | ReportTo[]`) as the second constructor argument.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) (includes the pre-monorepo `csp-typed-directives` 1.x history). TypeDoc HTML is generated from the workspace root with `pnpm docs:api`.

## License

[MIT](./LICENSE)
