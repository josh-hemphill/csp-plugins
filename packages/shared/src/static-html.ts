import {
	CSPProcessor,
	generateHash,
	type CSPProcessorOptions,
	type HashAlgorithm,
	type CSPResult,
} from '@csp-plugins/core';

type Headers = CSPResult['headers'];
type StaticHeaders = Headers | { routes: Record<string, Headers> };

const STATIC_ORIGIN = 'https://static.invalid';

/** Use URL paths in header metadata regardless of the filesystem or bundler. */
export function staticHtmlPath(fileName: string, base = '/'): string {
	const path = fileName.split('/').map(encodeURIComponent).join('/');
	return new URL(path, new URL(base, STATIC_ORIGIN)).pathname;
}

/** Keep the existing flat map when a build has one policy. */
export function staticHeaders(pages: ReadonlyMap<string, Headers>): StaticHeaders | undefined {
	if (pages.size === 0) return undefined;
	if (pages.size === 1) return pages.values().next().value;
	return {
		routes: Object.fromEntries(
			[...pages].toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
		),
	};
}

/** Analyze final HTML using only fresh bytes from this build for local integrity. */
export async function processStaticHtml(
	html: string,
	pagePath: string,
	options: CSPProcessorOptions,
	readAsset: (path: string) => Promise<string | Uint8Array | undefined>,
	owner: 'vite' | 'cli',
	rejectPreservedPolicy = false,
): Promise<CSPResult> {
	const hashing = options.externalSources?.hashing;
	const pageUrl = new URL(pagePath, STATIC_ORIGIN);
	let assetBase = pageUrl;
	const resources = new Map<string, Promise<string | Uint8Array | undefined>>();
	const hashes = new Map<string, Promise<string>>();
	let readFailure: Error | undefined;
	const processor = new CSPProcessor({
		...options,
		enableNonces: false,
		metaTagOptions: {
			...options.metaTagOptions,
			attributes: { ...options.metaTagOptions?.attributes, 'data-csp-plugins': owner },
			replaceExisting: true,
		},
		developmentMode: false,
		externalSources: {
			...options.externalSources,
			noncing: {},
			hashing: {
				...hashing,
				scripts: hashing?.scripts ?? hashing?.localScriptIntegrity ?? false,
				styles: hashing?.styles ?? true,
				images: false,
				fonts: false,
				others: false,
				hashGenerator: async (source, type, integrity) => {
					if (hashing?.hashGenerator) return hashing.hashGenerator(source, type, integrity);
					const url = new URL(source, assetBase);
					if (url.origin !== pageUrl.origin) return undefined;
					const path = url.pathname;
					try {
						let resource = resources.get(path);
						if (!resource) {
							resource = readAsset(path);
							resources.set(path, resource);
						}
						const bytes = await resource;
						if (bytes === undefined) return undefined;
						const digest = (algorithm: HashAlgorithm) => {
							const key = `${algorithm}:${path}`;
							let result = hashes.get(key);
							if (!result) {
								result = generateHash(bytes, algorithm);
								hashes.set(key, result);
							}
							return result;
						};
						if (!integrity) return digest(options.hashAlgorithm ?? 'sha256');
						const pins: string[] = [];
						let strongest = 0;
						let hasValidStrongest = false;
						for (const token of integrity.trim().split(/\s+/)) {
							const pin = /^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+=*)(?:\?.*)?$/.exec(
								token,
							);
							if (!pin) continue;
							const [, algorithm, value] = pin;
							const strength = Number(algorithm.slice(3));
							const normalized = value
								.replaceAll('-', '+')
								.replaceAll('_', '/')
								.replace(/=+$/, '');
							const actual = await digest(algorithm as HashAlgorithm);
							if (strength > strongest) {
								strongest = strength;
								hasValidStrongest = false;
							}
							if (
								strength === strongest &&
								actual.replace(/=+$/, '') === `${algorithm}-${normalized}`
							) {
								hasValidStrongest = true;
							}
							pins.push(`${algorithm}-${value}`);
						}
						if (strongest > 0 && !hasValidStrongest) {
							throw new Error(`Authored integrity does not match ${path} in ${pagePath}`);
						}
						return pins.length > 0 ? pins : undefined;
					} catch (error) {
						readFailure = new Error(`Cannot verify integrity for ${path} in ${pagePath}`, {
							cause: error,
						});
						return undefined;
					}
				},
			},
		},
	});
	const document = processor.parseHTML(html);
	const base = processor.getDocumentBase(document);
	if (base !== undefined) {
		try {
			assetBase = new URL(base, pageUrl);
		} catch {
			// Browsers fall back to the document URL if the base cannot be parsed.
		}
	}
	const authored = processor.getMetaPoliciesToPreserve(
		document,
		options.injectMetaTag === false ? '' : owner,
		rejectPreservedPolicy && options.injectMetaTag !== false,
	);
	const preserve = authored.length > 0 && options.metaTagOptions?.replaceExisting !== true;
	if (preserve && rejectPreservedPolicy) {
		throw new Error(
			`An existing CSP meta policy conflicts with configured policy options for ${pagePath}. Explicitly replace the existing policy or omit the additional policy.`,
		);
	}
	const result = await processor.processDOM(document);
	if (readFailure) throw readFailure;
	if (preserve) {
		result.html = html;
		if ('Content-Security-Policy' in result.headers) {
			result.headers['Content-Security-Policy'] = authored.join(', ');
		}
	}
	return result;
}
