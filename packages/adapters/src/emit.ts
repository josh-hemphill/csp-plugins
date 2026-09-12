import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';

import {
	defaultPathPrefix,
	escapeDoubleQuoted,
	escapeJsSingleQuoted,
	presentHeaders,
} from './headers.ts';
import type { HeaderAdapterOptions } from './types.ts';

export function emitJson(headers: CspDirectiveHeaders): Record<string, string> {
	return Object.fromEntries(presentHeaders(headers));
}

export function emitNetlify(headers: CspDirectiveHeaders, options?: HeaderAdapterOptions): string {
	const pathPrefix = defaultPathPrefix('netlify', options?.pathPrefix);
	const lines = presentHeaders(headers).map(([name, value]) => `  ${name}: ${value}`);
	return `${pathPrefix}\n${lines.join('\n')}\n`;
}

export function emitVercel(
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): Record<string, unknown> {
	const source = defaultPathPrefix('vercel', options?.pathPrefix);
	return {
		headers: [
			{
				source,
				headers: presentHeaders(headers).map(([key, value]) => ({ key, value })),
			},
		],
	};
}

export function emitFirebase(
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): Record<string, unknown> {
	const source = defaultPathPrefix('firebase', options?.pathPrefix);
	return {
		hosting: {
			headers: [
				{
					source,
					headers: presentHeaders(headers).map(([key, value]) => ({ key, value })),
				},
			],
		},
	};
}

export function emitNginx(headers: CspDirectiveHeaders): string {
	return presentHeaders(headers)
		.map(([name, value]) => `add_header ${name} "${escapeDoubleQuoted(value)}" always;`)
		.join('\n')
		.concat('\n');
}

export function emitApache(headers: CspDirectiveHeaders): string {
	return presentHeaders(headers)
		.map(([name, value]) => `Header always set ${name} "${escapeDoubleQuoted(value)}"`)
		.join('\n')
		.concat('\n');
}

export function emitCaddy(headers: CspDirectiveHeaders): string {
	const lines = presentHeaders(headers).map(
		([name, value]) => `\t${name} "${escapeDoubleQuoted(value)}"`,
	);
	return `header {\n${lines.join('\n')}\n}\n`;
}

export function emitExpress(headers: CspDirectiveHeaders): string {
	const sets = presentHeaders(headers)
		.map(
			([name, value]) =>
				`\tres.setHeader('${escapeJsSingleQuoted(name)}', '${escapeJsSingleQuoted(value)}');`,
		)
		.join('\n');
	return `export function cspHeaders(req, res, next) {\n${sets}\n\tnext();\n}\n`;
}
