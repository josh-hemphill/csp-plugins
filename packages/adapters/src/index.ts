import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';

import { emitFirebase, emitJson, emitNetlify, emitVercel } from './emit.ts';
import {
	mergeApache,
	mergeCaddy,
	mergeExpress,
	mergeFirebase,
	mergeJson,
	mergeNetlify,
	mergeNginx,
	mergeVercel,
	stringifyAdapterOutput,
} from './merge.ts';
import type { AdapterId, HeaderAdapter, HeaderAdapterOptions } from './types.ts';

export type { AdapterId, HeaderAdapter, HeaderAdapterOptions } from './types.ts';
export { adapterIds, cspHeaderNames, isAdapterId } from './types.ts';
export { presentHeaders } from './headers.ts';
export { stringifyAdapterOutput } from './merge.ts';

const adapters: Record<AdapterId, HeaderAdapter> = {
	json: {
		id: 'json',
		fileName: 'csp-headers.json',
		emit: (headers) => emitJson(headers),
		merge: (existing, headers) => mergeJson(existing, headers),
	},
	netlify: {
		id: 'netlify',
		fileName: '_headers',
		emit: (headers, options) => emitNetlify(headers, options),
		merge: (existing, headers, options) => mergeNetlify(existing, headers, options),
	},
	'cloudflare-pages': {
		id: 'cloudflare-pages',
		fileName: '_headers',
		emit: (headers, options) => emitNetlify(headers, options),
		merge: (existing, headers, options) => mergeNetlify(existing, headers, options),
	},
	vercel: {
		id: 'vercel',
		fileName: 'vercel.json',
		emit: (headers, options) => emitVercel(headers, options),
		merge: (existing, headers, options) => mergeVercel(existing, headers, options),
	},
	firebase: {
		id: 'firebase',
		fileName: 'firebase.json',
		emit: (headers, options) => emitFirebase(headers, options),
		merge: (existing, headers, options) => mergeFirebase(existing, headers, options),
	},
	nginx: {
		id: 'nginx',
		fileName: 'csp-headers.nginx.conf',
		emit: (headers) => mergeNginx('', headers),
		merge: (existing, headers) => mergeNginx(existing, headers),
	},
	apache: {
		id: 'apache',
		fileName: 'csp-headers.apache.conf',
		emit: (headers) => mergeApache('', headers),
		merge: (existing, headers) => mergeApache(existing, headers),
	},
	caddy: {
		id: 'caddy',
		fileName: 'Caddyfile.csp',
		emit: (headers) => mergeCaddy('', headers),
		merge: (existing, headers) => mergeCaddy(existing, headers),
	},
	express: {
		id: 'express',
		fileName: 'csp-headers.middleware.js',
		emit: (headers) => mergeExpress('', headers),
		merge: (existing, headers) => mergeExpress(existing, headers),
	},
};

export function getAdapter(id: AdapterId): HeaderAdapter {
	return adapters[id];
}

export function parseAdapterIds(value: string): AdapterId[] {
	const ids: AdapterId[] = [];
	for (const part of value.split(',')) {
		const id = part.trim();
		if (id.length === 0) {
			continue;
		}
		if (!(id in adapters)) {
			throw new Error(`Unknown header adapter: ${id}`);
		}
		ids.push(id as AdapterId);
	}
	return ids;
}

export function emitAdapter(
	id: AdapterId,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	return stringifyAdapterOutput(getAdapter(id).emit(headers, options));
}

export { adapters };
