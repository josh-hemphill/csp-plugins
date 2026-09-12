import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';

export type AdapterId =
	| 'json'
	| 'netlify'
	| 'cloudflare-pages'
	| 'vercel'
	| 'firebase'
	| 'nginx'
	| 'apache'
	| 'caddy'
	| 'express';

export interface HeaderAdapterOptions {
	pathPrefix?: string;
}

export interface HeaderAdapter {
	id: AdapterId;
	fileName: string;
	emit: (
		headers: CspDirectiveHeaders,
		options?: HeaderAdapterOptions,
	) => string | Record<string, unknown>;
	merge: (
		existing: string,
		headers: CspDirectiveHeaders,
		options?: HeaderAdapterOptions,
	) => string;
}

export const adapterIds: readonly AdapterId[] = [
	'json',
	'netlify',
	'cloudflare-pages',
	'vercel',
	'firebase',
	'nginx',
	'apache',
	'caddy',
	'express',
];

export const cspHeaderNames = [
	'Content-Security-Policy',
	'Content-Security-Policy-Report-Only',
	'Report-To',
	'Referrer-Policy',
] as const;

export function isAdapterId(value: string): value is AdapterId {
	return (adapterIds as readonly string[]).includes(value);
}
