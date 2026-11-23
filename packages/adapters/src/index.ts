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
	prepareStructuredConfig,
	readStructuredRouting,
	stringifyAdapterOutput,
} from './merge.ts';
import {
	cspHeaderNames,
	isAdapterId,
	type AdapterId,
	type HeaderAdapter,
	type HeaderAdapterOptions,
} from './types.ts';

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
		fileName: 'csp-headers.middleware.mjs',
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
		if (!isAdapterId(id)) {
			throw new Error(`Unknown header adapter: ${id}`);
		}
		if (!ids.includes(id)) ids.push(id);
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

export type StaticHeaderArtifact =
	| CspDirectiveHeaders
	| { routes: Record<string, CspDirectiveHeaders> };

function headerRules(
	headers: StaticHeaderArtifact | undefined,
	fallback: string,
	cleanPaths: boolean,
	trailingSlash?: boolean,
): Map<string, CspDirectiveHeaders> {
	if (!headers) return new Map();
	if (!('routes' in headers)) return new Map([[fallback, headers]]);
	const pages = Object.entries(headers.routes);
	const rules = new Map(pages);
	for (const [path, value] of pages) {
		if (!/^\/[\w.%/-]*$/.test(path)) throw new Error(`Unsupported static header path: ${path}`);
		const alias = path.endsWith('/index.html')
			? path.slice(0, -'index.html'.length)
			: cleanPaths && path.endsWith('.html')
				? path.slice(0, -'.html'.length)
				: undefined;
		if (!alias) continue;
		let canonical = alias;
		if (trailingSlash === false && alias.length > 1 && alias.endsWith('/'))
			canonical = alias.slice(0, -1);
		if (trailingSlash === true && !alias.endsWith('/')) canonical = alias + '/';
		for (const candidate of new Set([alias, canonical])) {
			const existing = rules.get(candidate);
			if (existing && JSON.stringify(existing) !== JSON.stringify(value)) {
				throw new Error(
					`Static HTML path ${path} conflicts with another CSP policy at ${candidate}`,
				);
			}
			rules.set(candidate, value);
		}
	}
	return rules;
}

const routeStart = '# csp-plugins headers begin';
const routeEnd = '# csp-plugins headers end';

/** Merge a static header artifact, optionally replacing rules from a prior generation. */
export function mergeStaticHeaders(
	id: AdapterId,
	existing: string,
	headers: StaticHeaderArtifact,
	options?: Omit<HeaderAdapterOptions, 'pathPrefix'>,
	previous?: StaticHeaderArtifact,
): string {
	const adapter = getAdapter(id);
	if (id === 'json') {
		const parsed: unknown = existing.trim() ? JSON.parse(existing) : {};
		const managed = new Set<string>([
			'routes',
			...cspHeaderNames.map((name) => name.toLowerCase()),
		]);
		const unmanaged = (value: unknown): Record<string, string> => {
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new Error('Expected a JSON header map');
			const entries = Object.entries(value).filter(([name]) => !managed.has(name.toLowerCase()));
			if (entries.some(([, item]) => typeof item !== 'string'))
				throw new Error('Expected a JSON header map');
			return Object.fromEntries(entries);
		};
		const global = unmanaged(parsed);
		const before = (parsed as { routes?: unknown }).routes ?? {};
		if (!before || typeof before !== 'object' || Array.isArray(before))
			throw new Error('Expected a JSON route map');
		const routes = new Map(
			Object.entries(before)
				.map(([path, values]) => [path, unmanaged(values)] as const)
				.filter(([, values]) => Object.keys(values).length > 0),
		);
		if (!('routes' in headers)) {
			if (routes.size > 0)
				throw new Error(
					'Cannot replace a route map with a single policy while it contains user-managed route headers.',
				);
			return stringifyAdapterOutput({ ...global, ...headers });
		}
		for (const [path, values] of Object.entries(headers.routes))
			routes.set(path, { ...routes.get(path), ...values });
		return stringifyAdapterOutput({ ...global, routes: Object.fromEntries(routes) });
	}
	const routed = 'routes' in headers;
	if (id === 'nginx' || id === 'apache' || id === 'caddy' || id === 'express') {
		if (routed)
			throw new Error(
				`${id} emits a single-policy snippet. Use the JSON route map to attach each policy to its route.`,
			);
		return adapter.merge(existing, headers);
	}
	const fallback = id === 'vercel' ? '/(.*)' : id === 'firebase' ? '**' : '/*';
	const routing =
		id === 'vercel' || id === 'firebase'
			? readStructuredRouting(id, existing, options)
			: { cleanUrls: true };
	const rules = headerRules(headers, fallback, routing.cleanUrls, routing.trailingSlash);
	if (id === 'netlify' || id === 'cloudflare-pages') {
		const prefix = existing.split(/\r?\n/);
		const begin = prefix.indexOf(routeStart);
		const end = prefix.indexOf(routeEnd);
		if (begin !== -1 || end !== -1) {
			if (
				begin < 0 ||
				end <= begin ||
				prefix.lastIndexOf(routeStart) !== begin ||
				prefix.lastIndexOf(routeEnd) !== end
			) {
				throw new Error('Invalid CSP header block markers');
			}
			prefix.splice(begin, end - begin + 1);
		}
		const remaining = prefix.join('\n').trimEnd();
		let path = '';
		for (const line of prefix) {
			if (line.trim() && !line.startsWith('#') && !/^\s/.test(line)) path = line.trim();
			if (
				/^\s*content-security-policy(?:-report-only)?\s*:/i.test(line) &&
				(!routed || !/^\/[\w.%/-]*$/.test(path) || rules.has(path))
			) {
				throw new Error(
					'An existing CSP rule overlaps generated routes. Remove or scope that rule before emitting a route policy.',
				);
			}
		}
		const output = [...rules]
			.map(([source, value]) => emitAdapter(id, value, { pathPrefix: source }).trimEnd())
			.join('\n\n');
		const merged = `${remaining ? remaining + '\n\n' : ''}${routeStart}\n${output}\n${routeEnd}\n`;
		if (id === 'cloudflare-pages') {
			const lines = merged.split('\n');
			const paths = lines.filter((line) => line.trim() && !/^[#\s]/.test(line));
			if (paths.length > 100 || lines.some((line) => line.length > 2000)) {
				throw new Error(
					'Cloudflare Pages headers exceed its 100-rule or 2,000-character line limit',
				);
			}
		}
		return merged;
	}
	const prior = headerRules(previous, fallback, routing.cleanUrls, routing.trailingSlash);
	let output = prepareStructuredConfig(
		id,
		existing,
		prior,
		new Set(rules.keys()),
		routed,
		options,
	);
	for (const [path, value] of rules) {
		output = adapter.merge(output, value, { ...options, pathPrefix: path });
	}
	return output;
}
