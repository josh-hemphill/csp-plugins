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
	const base = isRecord(parsed) ? { ...parsed } : {};
	for (const name of cspHeaderNames) {
		delete base[name];
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
	headers: CspDirectiveHeaders,
): NamedHeader[] {
	const cspNames = new Set<string>(cspHeaderNames);
	const kept = existing.filter((header) => !cspNames.has(header.key));
	return [...kept, ...presentHeaders(headers).map(([key, value]) => ({ key, value }))];
}

function mergePathGroups(
	existing: unknown,
	source: string,
	headers: CspDirectiveHeaders,
): PathHeaderGroup[] {
	const groups: PathHeaderGroup[] = [];
	if (Array.isArray(existing)) {
		for (const item of existing) {
			if (!isRecord(item) || typeof item.source !== 'string') {
				continue;
			}
			groups.push({ source: item.source, headers: asNamedHeaders(item.headers) });
		}
	}

	const index = groups.findIndex((group) => group.source === source);
	const mergedHeaders = mergeNamedHeaderList(index >= 0 ? groups[index].headers : [], headers);
	if (index >= 0) {
		groups[index] = { source, headers: mergedHeaders };
		return groups;
	}
	return [...groups, { source, headers: mergedHeaders }];
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
	const base = isRecord(parsed) ? { ...parsed } : {};
	const source =
		options?.pathPrefix !== undefined && options.pathPrefix.length > 0
			? options.pathPrefix
			: '/(.*)';
	base.headers = mergePathGroups(base.headers, source, headers);
	return prettyJson(base);
}

export function mergeFirebase(
	existing: string,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	let parsed: unknown = {};
	if (existing.trim().length > 0) {
		parsed = JSON.parse(existing) as unknown;
	}
	const base = isRecord(parsed) ? { ...parsed } : {};
	const hosting = isRecord(base.hosting) ? { ...base.hosting } : {};
	const source =
		options?.pathPrefix !== undefined && options.pathPrefix.length > 0
			? options.pathPrefix
			: '**';
	hosting.headers = mergePathGroups(hosting.headers, source, headers);
	base.hosting = hosting;
	return prettyJson(base);
}

function parseNetlifyBlocks(existing: string): Array<{ path: string; lines: string[] }> {
	const blocks: Array<{ path: string; lines: string[] }> = [];
	let current: { path: string; lines: string[] } | undefined;
	for (const rawLine of existing.split('\n')) {
		const line = rawLine.replaceAll('\r', '');
		if (line.trim().length === 0) {
			if (current !== undefined) {
				current.lines.push(line);
			}
			continue;
		}
		if (line.startsWith('#') && current === undefined) {
			continue;
		}
		if (!line.startsWith(' ') && !line.startsWith('\t')) {
			current = { path: line.trim(), lines: [] };
			blocks.push(current);
			continue;
		}
		if (current !== undefined) {
			current.lines.push(line);
		}
	}
	return blocks;
}

export function mergeNetlify(
	existing: string,
	headers: CspDirectiveHeaders,
	options?: HeaderAdapterOptions,
): string {
	const pathPrefix =
		options?.pathPrefix !== undefined && options.pathPrefix.length > 0
			? options.pathPrefix
			: '/*';
	if (existing.trim().length === 0) {
		return emitNetlify(headers, options);
	}

	const blocks = parseNetlifyBlocks(existing);
	const cspNames = new Set<string>(cspHeaderNames);
	const index = blocks.findIndex((block) => block.path === pathPrefix);
	const cspLines = presentHeaders(headers).map(([name, value]) => `  ${name}: ${value}`);

	if (index < 0) {
		const emitted = emitNetlify(headers, options).trimEnd();
		return `${existing.trimEnd()}\n\n${emitted}\n`;
	}

	const kept = blocks[index].lines.filter((line) => {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith('#')) {
			return true;
		}
		const name = trimmed.split(':')[0]?.trim();
		return name === undefined || !cspNames.has(name);
	});
	blocks[index] = { path: pathPrefix, lines: [...kept, ...cspLines] };

	return `${blocks
		.map((block) => `${block.path}\n${block.lines.join('\n')}`.trimEnd())
		.join('\n\n')}\n`;
}

export function mergeSnippet(
	existing: string,
	emitted: string,
	begin: string,
	end: string,
): string {
	const block = `${begin}\n${emitted.trimEnd()}\n${end}\n`;
	if (existing.trim().length === 0) {
		return block;
	}
	const start = existing.indexOf(begin);
	const stop = existing.indexOf(end);
	if (start >= 0 && stop > start) {
		return `${existing.slice(0, start)}${block}${existing.slice(stop + end.length)}`.replace(
			/\n{3,}/g,
			'\n\n',
		);
	}
	return `${existing.trimEnd()}\n\n${block}`;
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
