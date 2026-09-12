import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';

import { cspHeaderNames } from './types.ts';

/** Return CSP-related headers whose values are non-empty. */
export function presentHeaders(headers: CspDirectiveHeaders): Array<[string, string]> {
	return cspHeaderNames
		.filter((name) => {
			const value = headers[name];
			return typeof value === 'string' && value.length > 0;
		})
		.map((name) => [name, headers[name]]);
}

/** Escape a value for a double-quoted config string. */
export function escapeDoubleQuoted(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/** Escape a value for a JavaScript single-quoted string. */
export function escapeJsSingleQuoted(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

export function defaultPathPrefix(
	kind: 'netlify' | 'vercel' | 'firebase',
	override?: string,
): string {
	if (override !== undefined && override.length > 0) {
		return override;
	}
	if (kind === 'vercel') {
		return '/(.*)';
	}
	if (kind === 'firebase') {
		return '**';
	}
	return '/*';
}
