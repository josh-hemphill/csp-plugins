import {
	CSPProcessor,
	generateHash,
	type CSPProcessorOptions,
	type ExternalSourceType,
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

function policyBaseRestrictions(policies: string[]): string[][] {
	return policies.flatMap((policy) => {
		const directive = policy
			.split(';')
			.map((part) => part.trim().split(/\s+/))
			.find(([name]) => name.toLowerCase() === 'base-uri');
		return directive ? [directive.slice(1)] : [];
	});
}

function effectiveBase(page: URL, reference: string, restrictions: string[][]): URL {
	let candidate: URL;
	try {
		candidate = new URL(reference, page);
	} catch {
		return page;
	}
	if (!['http:', 'https:'].includes(candidate.protocol)) return page;
	const policies = restrictions.map((sources) =>
		sources.map((source) => source.replace(/^'|'$/g, '')),
	);
	if (policies.some((sources) => sources.every((source) => source === 'none'))) return page;

	// A relative reference follows a change in document origin. Using the URL
	// parser for both origins also handles whitespace and authority separators.
	const alternateOrigin = new URL(page.pathname, 'http://base-check.invalid');
	const relativeBase =
		candidate.origin === page.origin &&
		new URL(reference, alternateOrigin).origin === alternateOrigin.origin;
	if (
		policies.every(
			(sources) => sources.includes('*') || (relativeBase && sources.includes('self')),
		)
	)
		return candidate;

	throw new Error(
		`Cannot resolve the HTML base URL for ${page.pathname} without knowing the deployment origin. Use a relative base with base-uri 'self', remove the base element, or use base-uri 'none'.`,
	);
}

/** Analyze final HTML using only fresh bytes from this build for local integrity. */
export async function processStaticHtml(
	html: string,
	pagePath: string,
	options: CSPProcessorOptions,
	readAsset: (path: string) => Promise<string | Uint8Array | undefined>,
	context: { owner: 'vite' | 'cli'; rejectPreservedPolicy?: boolean; aliasPaths?: string[] },
): Promise<Pick<CSPResult, 'headers' | 'html'>> {
	const { owner, rejectPreservedPolicy, aliasPaths = [] } = context;
	const hashing = options.externalSources?.hashing;
	const pageUrl = new URL(pagePath, STATIC_ORIGIN);
	let assetBase = pageUrl;
	const resources = new Map<string, Promise<string | Uint8Array | undefined>>();
	const hashes = new Map<string, Promise<string>>();
	let readFailure: Error | undefined;
	const hashAsset = async (source: string, type: ExternalSourceType, integrity?: string) => {
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
				const pin = /^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+=*)(?:\?.*)?$/.exec(token);
				if (!pin) continue;
				const [, algorithm, value] = pin;
				const strength = Number(algorithm.slice(3));
				const normalized = value.replaceAll('-', '+').replaceAll('_', '/').replace(/=+$/, '');
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
			if (pins.length === 0)
				throw new Error(`Authored integrity for ${path} has no supported digest`);
			return pins;
		} catch (error) {
			readFailure = new Error(`Cannot verify integrity for ${path} in ${pagePath}`, {
				cause: error,
			});
			return undefined;
		}
	};
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
				hashGenerator: hashAsset,
			},
		},
	});
	const document = processor.parseHTML(html);
	const authored = processor.getMetaPoliciesToPreserve(
		document,
		options.injectMetaTag === false ? '' : owner,
		rejectPreservedPolicy && options.injectMetaTag !== false,
	);
	const preserve = authored.length > 0 && options.metaTagOptions?.replaceExisting !== true;
	const aliases = [...new Set(aliasPaths)].map((path) => new URL(path, STATIC_ORIGIN));
	const checkRoutes = (analysis: CSPResult['analysis'], base: URL, alternateBases: URL[]) => {
		for (const [index, alternate] of alternateBases.entries()) {
			for (const { src } of [...analysis.scriptSources, ...analysis.styleSources]) {
				if (new URL(src, base).href !== new URL(src, alternate).href) {
					throw new Error(
						`Relative asset ${src} resolves differently at ${aliases[index].pathname} and ${pagePath}. Use a root-relative URL or keep the original URL shape.`,
					);
				}
			}
		}
	};
	const reference = processor.getDocumentBase(document);
	if (preserve) {
		if (rejectPreservedPolicy) {
			throw new Error(
				`An existing CSP meta policy conflicts with configured policy options for ${pagePath}. Explicitly replace the existing policy or omit the additional policy.`,
			);
		}
		const beforeRestrictions =
			reference === undefined
				? []
				: policyBaseRestrictions(
						processor.getMetaPoliciesToPreserve(
							document,
							options.injectMetaTag === false ? '' : owner,
							false,
							true,
						),
					);
		const restrictions = policyBaseRestrictions(authored);
		const changedPlacement =
			reference !== undefined &&
			options.generateHeaders !== false &&
			JSON.stringify(beforeRestrictions) !== JSON.stringify(restrictions);
		const verifyPinnedScripts =
			hashing?.localScriptIntegrity === true && hashing.scripts !== false;
		if (aliases.length > 0 || changedPlacement || verifyPinnedScripts) {
			const metaBase =
				reference === undefined
					? pageUrl
					: effectiveBase(pageUrl, reference, beforeRestrictions);
			const httpPages = changedPlacement ? [...aliases, pageUrl] : aliases;
			if (changedPlacement) aliases.push(pageUrl);
			const httpBases =
				reference === undefined
					? httpPages
					: httpPages.map((page) => effectiveBase(page, reference, restrictions));
			const analysis = await processor.analyzeDOM(document);
			checkRoutes(analysis, metaBase, httpBases);
			if (verifyPinnedScripts) {
				assetBase = metaBase;
				for (const { src, element } of analysis.scriptSources) {
					const integrity = 'attribs' in element ? element.attribs.integrity : undefined;
					const hashes = await hashAsset(src, 'script', integrity);
					if (readFailure) throw readFailure;
					if (hashes && !integrity) {
						throw new Error(
							`Cannot add integrity to ${src} in ${pagePath} while preserving its CSP and markup. Add the integrity attribute or explicitly replace the existing policy.`,
						);
					}
				}
			}
		}
		return { html, headers: processor.getPreservedHeaders(authored.join(', ')) };
	}

	const directive = options.baseDirectives?.CSP?.['base-uri'];
	const position = options.metaTagOptions?.position;
	if (
		reference !== undefined &&
		directive !== undefined &&
		options.injectMetaTag !== false &&
		position !== undefined &&
		position !== 'first'
	) {
		throw new Error(
			`The CSP meta tag must precede the HTML base element in ${pagePath}. Use the first position with base-uri.`,
		);
	}
	const restrictions =
		directive === undefined ? [] : [Array.isArray(directive) ? directive : [directive]];
	const alternateBases =
		reference === undefined
			? aliases
			: aliases.map((alias) => effectiveBase(alias, reference, restrictions));
	if (reference !== undefined) assetBase = effectiveBase(pageUrl, reference, restrictions);
	const result = await processor.processDOM(document);
	if (readFailure) throw readFailure;
	checkRoutes(result.analysis, assetBase, alternateBases);
	return result;
}
