import {
	CSPProcessor,
	generateHash,
	type CSPProcessorOptions,
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
): Promise<CSPResult> {
	const hashing = options.externalSources?.hashing;
	const pageUrl = new URL(pagePath, STATIC_ORIGIN);
	let assetBase = pageUrl;
	const hashes = new Map<string, Promise<string | undefined>>();
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
				hashGenerator: async (source, type) => {
					if (hashing?.hashGenerator) return hashing.hashGenerator(source, type);
					const url = new URL(source, assetBase);
					if (url.origin !== pageUrl.origin) return undefined;
					let digest = hashes.get(url.pathname);
					if (!digest) {
						digest = readAsset(url.pathname)
							.then((bytes) =>
								bytes === undefined
									? undefined
									: generateHash(bytes, options.hashAlgorithm ?? 'sha256'),
							)
							.catch((error: unknown) => {
								readFailure = new Error(`Cannot read ${url.pathname} for ${pagePath}`, {
									cause: error,
								});
								return undefined;
							});
						hashes.set(url.pathname, digest);
					}
					return digest;
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
	const authored = processor.getMetaPoliciesToPreserve(document, owner);
	const preserve = authored.length > 0 && options.metaTagOptions?.replaceExisting !== true;
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
