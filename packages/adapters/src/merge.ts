import { posix } from 'node:path';

import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';

import { emitApache, emitCaddy, emitExpress, emitJson, emitNetlify, emitNginx } from './emit.ts';
import { presentHeaders } from './headers.ts';
import type { HeaderAdapterOptions } from './types.ts';
import { cspHeaderNames } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function prettyJson(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function stringifyEmitted(value: string | Record<string, unknown>): string {
	return typeof value === 'string' ? value : prettyJson(value);
}

/** Merge CSP keys into a JSON object of header name → value. */
export function mergeJson(existing: string, headers: CspDirectiveHeaders): string {
	let parsed: unknown = {};
	if (existing.trim().length > 0) {
		parsed = JSON.parse(existing) as unknown;
	}
	if (!isRecord(parsed)) throw new Error('Expected an existing JSON configuration object');
	const base = { ...parsed };
	const managed = new Set<string>(cspHeaderNames.map((name) => name.toLowerCase()));
	for (const name of Object.keys(base)) {
		if (managed.has(name.toLowerCase())) delete base[name];
	}
	return prettyJson({ ...base, ...emitJson(headers) });
}

interface NamedHeader {
	key: string;
	value: string;
}

interface PathHeaderGroup {
	source: string;
	headers: NamedHeader[];
}

function asNamedHeaders(value: unknown): NamedHeader[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const result: NamedHeader[] = [];
	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}
		if (typeof item.key !== 'string' || typeof item.value !== 'string') {
			continue;
		}
		result.push({ key: item.key, value: item.value });
	}
	return result;
}

function mergeNamedHeaderList(
	existing: NamedHeader[],
	headers: Partial<CspDirectiveHeaders>,
	preserveAbsent: boolean,
): NamedHeader[] {
	const incoming = presentHeaders(headers);
	const replaced = preserveAbsent ? incoming.map(([name]) => name) : cspHeaderNames;
	const cspNames = new Set(replaced.map((name) => name.toLowerCase()));
	const kept = existing.filter((header) => !cspNames.has(header.key.toLowerCase()));
	return [...kept, ...incoming.map(([key, value]) => ({ key, value }))];
}

export function mergePathGroups(
	existing: unknown,
	source: string,
	headers: Partial<CspDirectiveHeaders>,
	preserveAbsent = false,
): unknown[] {
	if (existing !== undefined && !Array.isArray(existing)) {
		throw new Error('Expected the existing headers configuration to be an array');
	}
	const groups: unknown[] = Array.isArray(existing) ? [...existing] : [];
	const indexes = groups.flatMap((group, index) =>
		isRecord(group) &&
		group.source === source &&
		group.has === undefined &&
		group.missing === undefined
			? [index]
			: [],
	);
	if (indexes.length > 1) throw new Error(`Multiple unconditional header rules for ${source}`);
	const index = indexes[0] ?? -1;
	if (index >= 0) {
		const group = groups[index] as Record<string, unknown>;
		groups[index] = {
			...group,
			headers: mergeNamedHeaderList(asNamedHeaders(group.headers), headers, preserveAbsent),
		};
	} else {
		groups.push({
			source,
			headers: mergeNamedHeaderList([], headers, preserveAbsent),
		} satisfies PathHeaderGroup);
	}
	return groups;
}

export function mergeVercel(
	existing: string,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	let parsed: unknown = {};
	if (existing.trim().length > 0) {
		parsed = JSON.parse(existing) as unknown;
	}
	if (!isRecord(parsed)) throw new Error('Expected an existing JSON configuration object');
	const base = { ...parsed };
	const source =
		options?.pathPrefix !== undefined && options.pathPrefix.length > 0
			? options.pathPrefix
			: '/(.*)';
	base.headers = mergePathGroups(base.headers, source, headers);
	return prettyJson(base);
}

function directoryName(path: string): string {
	return posix.normalize(path).replace(/\/$/, '') || '/';
}

export function readStructuredRouting(
	id: 'vercel' | 'firebase',
	existing: string,
	options?: HeaderAdapterOptions,
): { cleanUrls: boolean; trailingSlash?: boolean } {
	const parsed: unknown = existing.trim() ? JSON.parse(existing) : {};
	if (!isRecord(parsed)) throw new Error(`Expected an existing ${id} configuration object`);
	let site: Record<string, unknown> = parsed;
	if (id === 'firebase') {
		updateFirebaseSite(parsed, options, (selected) => {
			site = selected;
			return selected;
		});
	} else if (
		options?.publicDir &&
		typeof parsed.outputDirectory === 'string' &&
		directoryName(parsed.outputDirectory) !== directoryName(options.publicDir)
	) {
		throw new Error(
			`Vercel publishes ${parsed.outputDirectory} but the selected output directory is ${options.publicDir}`,
		);
	}
	return {
		cleanUrls: site.cleanUrls === true,
		trailingSlash: typeof site.trailingSlash === 'boolean' ? site.trailingSlash : undefined,
	};
}

function updateFirebaseSite(
	base: Record<string, unknown>,
	options: HeaderAdapterOptions | undefined,
	update: (site: Record<string, unknown>) => Record<string, unknown>,
): void {
	if (Array.isArray(base.hosting)) {
		const matches = base.hosting.flatMap((site, index) =>
			isRecord(site) &&
			(options?.firebaseTarget !== undefined
				? site.target === options.firebaseTarget
				: options?.publicDir !== undefined &&
					typeof site.public === 'string' &&
					directoryName(site.public) === directoryName(options.publicDir))
				? [index]
				: [],
		);
		if (matches.length !== 1)
			throw new Error(
				'Select exactly one Firebase Hosting site by target or its configured public directory',
			);
		base.hosting = base.hosting.map((site, index) =>
			index === matches[0] ? update(site as Record<string, unknown>) : site,
		);
		return;
	}
	if (base.hosting !== undefined && !isRecord(base.hosting))
		throw new Error('Invalid Firebase Hosting configuration');
	const site = base.hosting ?? {};
	if (
		options?.publicDir &&
		site.public !== undefined &&
		(typeof site.public !== 'string' ||
			directoryName(site.public) !== directoryName(options.publicDir))
	) {
		throw new Error(
			`Firebase Hosting publishes ${String(site.public)} but the selected output directory is ${options.publicDir}`,
		);
	}
	if (options?.publicDir && site.public === undefined) site.public = options.publicDir;
	base.hosting = update(site);
}

export function mergeFirebase(
	existing: string,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	const parsed: unknown = existing.trim() ? JSON.parse(existing) : {};
	if (!isRecord(parsed)) throw new Error('Expected an existing Firebase configuration object');
	const base = { ...parsed };
	updateFirebaseSite(base, options, (site) => ({
		...site,
		headers: mergePathGroups(site.headers, options?.pathPrefix || '**', headers),
	}));
	return prettyJson(base);
}

export function writeStructuredConfig(
	id: 'vercel' | 'firebase',
	existing: string,
	previousRules: ReadonlyMap<string, Partial<CspDirectiveHeaders>>,
	nextRules: ReadonlyMap<string, CspDirectiveHeaders>,
	routed: boolean,
	options?: HeaderAdapterOptions,
): { body: string; rules: Record<string, Partial<CspDirectiveHeaders>> } {
	const parsed: unknown = existing.trim() ? JSON.parse(existing) : {};
	if (!isRecord(parsed)) throw new Error(`Expected an existing ${id} configuration object`);
	const written = new Map<string, Partial<CspDirectiveHeaders>>();
	const prepare = (record: Record<string, unknown>) => {
		const groups = record.headers ?? [];
		if (!Array.isArray(groups))
			throw new Error('Expected the existing headers configuration to be an array');
		let kept = groups.flatMap((group: unknown): unknown[] => {
			if (!isRecord(group) || !Array.isArray(group.headers)) return [group];
			const managed =
				typeof group.source === 'string' &&
				group.has === undefined &&
				group.missing === undefined
					? previousRules.get(group.source)
					: undefined;
			const values = new Map(
				managed
					? presentHeaders(managed).map(([key, value]) => [key.toLowerCase(), value])
					: [],
			);
			const entries: unknown[] = group.headers.filter(
				(entry: unknown) =>
					!isRecord(entry) ||
					typeof entry.key !== 'string' ||
					!values.has(entry.key.toLowerCase()) ||
					values.get(entry.key.toLowerCase()) !== entry.value,
			);
			const conflicting = entries.some(
				(entry: unknown) =>
					isRecord(entry) &&
					typeof entry.key === 'string' &&
					/^content-security-policy(?:-report-only)?$/i.test(entry.key),
			);
			if (
				conflicting &&
				(!routed ||
					typeof group.source !== 'string' ||
					!/^\/[\w.%/-]*$/.test(group.source) ||
					nextRules.has(group.source))
			) {
				throw new Error(
					'An existing CSP rule overlaps generated routes. Remove or scope that rule before emitting a route policy.',
				);
			}
			if (
				managed &&
				entries.length === 0 &&
				Object.keys(group).every((key) => key === 'source' || key === 'headers')
			)
				return [];
			return [{ ...group, headers: entries }];
		});
		// The browser default should not supersede an authored broader route rule.
		const userReferrerPolicy = kept.some(
			(group) =>
				isRecord(group) &&
				asNamedHeaders(group.headers).some(
					(header) => header.key.toLowerCase() === 'referrer-policy',
				),
		);

		for (const [source, headers] of nextRules) {
			const effective: Partial<CspDirectiveHeaders> = { ...headers };
			if (
				userReferrerPolicy &&
				effective['Referrer-Policy'] === 'strict-origin-when-cross-origin'
			) {
				delete effective['Referrer-Policy'];
			}
			const existing = kept.find(
				(item) =>
					isRecord(item) &&
					item.source === source &&
					item.has === undefined &&
					item.missing === undefined,
			);
			if (isRecord(existing)) {
				for (const name of ['Referrer-Policy', 'Report-To'] as const) {
					const authored = asNamedHeaders(existing.headers).find(
						(item) => item.key.toLowerCase() === name.toLowerCase(),
					);
					if (!authored) continue;
					const requested = effective[name];
					if (
						requested &&
						requested !== authored.value &&
						!(name === 'Referrer-Policy' && requested === 'strict-origin-when-cross-origin')
					) {
						throw new Error(
							`Existing ${name} for ${source} conflicts with the requested value`,
						);
					}
					delete effective[name];
				}
			}
			kept = mergePathGroups(kept, source, effective, true);
			written.set(source, effective);
		}
		return { ...record, headers: kept };
	};
	if (id === 'vercel')
		return { body: prettyJson(prepare(parsed)), rules: Object.fromEntries(written) };
	const base = { ...parsed };
	updateFirebaseSite(base, options, prepare);
	return { body: prettyJson(base), rules: Object.fromEntries(written) };
}

export function mergeNetlify(
	existing: string,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	const path = options?.pathPrefix || '/*';
	const lines = existing.split(/\r?\n/);
	const index = lines.findIndex((line) => line === path);
	if (index < 0) {
		const emitted = emitNetlify(headers, options);
		return existing.trimEnd() ? `${existing.trimEnd()}\n\n${emitted}` : emitted;
	}

	let stop = index + 1;
	while (stop < lines.length && /^[ \t]/.test(lines[stop])) stop++;
	const managedNames = new Set<string>(cspHeaderNames.map((name) => name.toLowerCase()));
	const kept = lines.slice(index + 1, stop).filter((line) => {
		const name = line.trim().split(':')[0]?.trim().toLowerCase();
		return !managedNames.has(name);
	});
	const generated = presentHeaders(headers).map(([name, value]) => `  ${name}: ${value}`);
	return [...lines.slice(0, index + 1), ...kept, ...generated, ...lines.slice(stop)].join('\n');
}

export function mergeSnippet(
	existing: string,
	emitted: string,
	begin: string,
	end: string,
): string {
	const block = `${begin}\n${emitted.trimEnd()}\n${end}`;
	const beginMatches = [...existing.matchAll(new RegExp(`^${begin}$`, 'gm'))];
	const endMatches = [...existing.matchAll(new RegExp(`^${end}$`, 'gm'))];
	if (beginMatches.length === 0 && endMatches.length === 0) {
		return existing.trimEnd() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
	}
	if (
		beginMatches.length !== 1 ||
		endMatches.length !== 1 ||
		beginMatches[0].index >= endMatches[0].index
	) {
		throw new Error('Invalid CSP header block markers');
	}
	return (
		existing.slice(0, beginMatches[0].index) +
		block +
		existing.slice(endMatches[0].index + end.length)
	);
}

export function mergeNginx(existing: string, headers: CspDirectiveHeaders): string {
	return mergeSnippet(existing, emitNginx(headers), '# csp-plugins begin', '# csp-plugins end');
}

export function mergeApache(existing: string, headers: CspDirectiveHeaders): string {
	return mergeSnippet(existing, emitApache(headers), '# csp-plugins begin', '# csp-plugins end');
}

export function mergeCaddy(existing: string, headers: CspDirectiveHeaders): string {
	return mergeSnippet(existing, emitCaddy(headers), '# csp-plugins begin', '# csp-plugins end');
}

export function mergeExpress(existing: string, headers: CspDirectiveHeaders): string {
	return mergeSnippet(
		existing,
		emitExpress(headers),
		'// csp-plugins begin',
		'// csp-plugins end',
	);
}

export function stringifyAdapterOutput(value: string | Record<string, unknown>): string {
	return stringifyEmitted(value);
}
