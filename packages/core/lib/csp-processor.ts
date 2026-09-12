import { CspDirectives, type CspDirectiveHeaders } from '@csp-plugins/typed-directives';
import type { ActionSource, Sources, ValidHashes } from '@csp-plugins/typed-directives/csp.types';
import type { DomSerializerOptions } from 'dom-serializer';
import serialize from 'dom-serializer';
import type { ChildNode, Document, Element } from 'domhandler';
import { Element as DomElement, DomHandler } from 'domhandler';
import {
	append,
	appendChild,
	findAll,
	findOne,
	prepend,
	prependChild,
	removeElement,
	replaceElement,
} from 'domutils';
import { ElementType, Parser } from 'htmlparser2';

import { generateHash, generateNonce, toHashSource, type HashSource } from './crypto.ts';
import type { ExternalResourceOptions } from './external-resource-manager.ts';
import { ExternalResourceManager } from './external-resource-manager.ts';

const serializeOptions: DomSerializerOptions = {
	decodeEntities: false,
	emptyAttrs: true,
	selfClosingTags: true,
	encodeEntities: false,
};

const STRICT_FETCH_DEFAULT = 'self' as const;

/** Flatten an optional CSP source list, dropping empty entries. */
function listSources<T>(base: T | T[] | undefined): T[] {
	if (base === undefined) {
		return [];
	}
	return Array.isArray(base) ? [...base] : [base];
}

/** Append sources without duplicating existing entries. */
function appendSources<T extends string>(base: T | T[] | undefined, extra: T[]): T[] {
	const merged = [...listSources(base), ...extra];
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of merged) {
		if (typeof item !== 'string' || item.length === 0) {
			continue;
		}
		if (seen.has(item)) {
			continue;
		}
		seen.add(item);
		result.push(item);
	}
	return result;
}

export type ExternalSourceType = 'script' | 'style' | 'image' | 'font' | 'other';
export type CryptoGenerator = (src: string, type: ExternalSourceType) => PromiseLike<string>;
export interface ExternalSourceGeneralOptions {
	/**
	 * Enable for external script sources
	 */
	scripts?: boolean;

	/**
	 * Enable for external style sources
	 */
	styles?: boolean;

	/**
	 * Enable for external image sources
	 */
	images?: boolean;

	/**
	 * Enable for external font sources
	 */
	fonts?: boolean;

	/**
	 * Enable for other external sources
	 */
	others?: boolean;

	/**
	 * Pattern matching for which external sources to apply
	 * If provided, only sources matching these patterns will be applied
	 */
	includePatterns?: Array<string | RegExp>;

	/**
	 * Pattern matching for which external sources to exclude from applying
	 * If provided, sources matching these patterns will not be applied
	 */
	excludePatterns?: Array<string | RegExp>;
}

/**
 * Configuration options for CSP processing
 */
export interface CSPProcessorOptions {
	/**
	 * Enable/disable nonce generation for inline scripts and styles
	 */
	enableNonces?: boolean;

	/**
	 * Custom nonce generator function
	 */
	nonceGenerator?: () => PromiseLike<string>;

	/**
	 * Enable/disable hash generation for inline scripts and styles
	 */
	enableHashes?: boolean;

	/**
	 * Hash algorithm to use ('sha256' | 'sha384' | 'sha512')
	 */
	hashAlgorithm?: ValidHashes;

	/**
	 * Custom base CSP directives to extend
	 */
	baseDirectives?: Partial<CspDirectives>;

	/**
	 * Enable automatic meta tag insertion
	 */
	injectMetaTag?: boolean;

	/**
	 * Meta tag injection options
	 */
	metaTagOptions?: {
		/**
		 * Whether to replace existing CSP meta tags
		 */
		replaceExisting?: boolean;

		/**
		 * Custom meta tag attributes
		 */
		attributes?: Record<string, string>;

		/**
		 * Position in head: 'first', 'last', or 'after-title'
		 */
		position?:
			| 'first'
			| 'last'
			| 'after-title'
			| ((head: Element) => ['prepend' | 'append' | 'prepend-child' | 'append-child', Element]);
	};

	/**
	 * Enable automatic header generation
	 */
	generateHeaders?: boolean;

	/**
	 * External source options
	 */
	externalSources?: {
		noncing?: ExternalSourceGeneralOptions & {
			nonceGenerator?: CryptoGenerator;
		};
		hashing?: ExternalSourceGeneralOptions & {
			hashGenerator?: CryptoGenerator;
			/**
			 * Enable adding the Integrity attribute to external sources
			 * @default true
			 */
			integrity?: boolean;
			/**
			 * Enable fetching external resources
			 * @default false
			 */
			fetchExternal?: boolean | ((src: string) => string);
			/**
			 * Enable integrity attributes for local scripts (advanced security feature)
			 * @default false
			 */
			localScriptIntegrity?: boolean;
			/**
			 * Enable integrity attributes for local styles (common security feature)
			 * @default true
			 */
			localStyleIntegrity?: boolean;
		};
		resourceManager?: ExternalResourceOptions;
	};

	/**
	 * Is development mode enabled?
	 */
	developmentMode?: boolean;

	/**
	 * Development mode settings
	 */
	development?: {
		/**
		 * Allow unsafe-eval in development
		 * @default false
		 */
		allowUnsafeEval?: boolean;

		/**
		 * Allow unsafe-inline in development
		 * @default false
		 */
		allowUnsafeInline?: boolean;

		/**
		 * Additional development-only sources
		 * @default ['localhost', '127.0.0.1']
		 * @note '::1' is not included by default because
		 *  the CSP spec does not allow it. Though there is a
		 *  proposal to allow it.
		 */
		additionalSources?: string[];

		/**
		 * Attempt dev server headers
		 * @default true
		 */
		attemptDevServerHeaders?: boolean | ((src: string) => boolean);
	};
}

export type AnalysisNode<Inline> = {
	nonce?: string;
	element: ChildNode;
	hash?: HashSource;
} & (Inline extends true
	? {
			content: string;
		}
	: {
			src: string;
		});

/**
 * Result of HTML analysis
 */
export interface HTMLAnalysisResult {
	/**
	 * Inline scripts found in the HTML
	 */
	inlineScripts: Array<AnalysisNode<true>>;

	/**
	 * Inline styles found in the HTML
	 */
	inlineStyles: Array<AnalysisNode<true>>;

	/**
	 * External script sources
	 */
	scriptSources: Array<AnalysisNode<false>>;

	/**
	 * External style sources
	 */
	styleSources: Array<AnalysisNode<false>>;

	/**
	 * Image sources
	 */
	imageSources: Array<AnalysisNode<false>>;

	/**
	 * Font sources
	 */
	fontSources: Array<AnalysisNode<false>>;

	/**
	 * Other resource sources grouped by type
	 */
	otherSources: Record<string, Array<AnalysisNode<false>>>;

	/**
	 * Document object
	 */
	document: Document | undefined;
	/**
	 * Head element
	 */
	head: Element | undefined;
}

/**
 * CSP generation result
 */
export interface CSPResult {
	/**
	 * CSP builder
	 */
	builder: CspDirectives;

	/**
	 * Generated headers. Empty when `generateHeaders` is false.
	 */
	headers: CspDirectiveHeaders | Record<string, never>;

	/**
	 * Generated nonces for this request
	 */
	nonces: {
		script?: string;
		style?: string;
	};

	/**
	 * Analysis results
	 */
	analysis: HTMLAnalysisResult;

	/**
	 * Modified HTML (if nonces were injected)
	 */
	html?: string;
}

/**
 * Core CSP processor class
 */
export class CSPProcessor {
	private options: Required<CSPProcessorOptions>;
	private externalResourceManager: ExternalResourceManager;

	constructor(options: CSPProcessorOptions = {}) {
		this.options = {
			enableNonces: true,
			enableHashes: true,
			nonceGenerator: generateNonce,
			hashAlgorithm: 'sha256',
			baseDirectives: {},
			injectMetaTag: true,
			metaTagOptions: {
				replaceExisting: true,
				attributes: {},
				position: 'first',
				...options.metaTagOptions,
			},
			generateHeaders: true,
			externalSources: {
				noncing: {
					scripts: false,
					styles: false,
					images: false,
					fonts: false,
					others: false,
					includePatterns: [],
					excludePatterns: [],
					...options.externalSources?.noncing,
				},
				hashing: {
					scripts: false,
					styles: false,
					images: false,
					fonts: false,
					others: false,
					includePatterns: [],
					excludePatterns: [],
					integrity: true,
					fetchExternal: false,
					localScriptIntegrity: false, // Disabled by default (advanced use case)
					localStyleIntegrity: true, // Enabled by default (common use case)
					...options.externalSources?.hashing,
				},
				resourceManager: options.externalSources?.resourceManager ?? {},
			},
			developmentMode: false,
			development: {
				allowUnsafeEval: false,
				allowUnsafeInline: false,
				// '::1' is not included by default because
				//  the CSP spec does not allow it. Though there is a
				//  proposal to allow it.
				additionalSources: ['localhost', '127.0.0.1'],
				attemptDevServerHeaders: true,
				...options.development,
			},
			...options,
		};

		this.externalResourceManager = new ExternalResourceManager(
			this.options.externalSources?.resourceManager,
		);
	}

	/**
	 * Get cache statistics
	 */
	async getCacheStats(): Promise<{
		size: number;
		entries: Array<{ url: string; timestamp: number; sourceType: string }>;
	}> {
		return this.externalResourceManager.getCacheStats();
	}

	/**
	 * Clear the resource cache (both memory and filesystem)
	 */
	async clearCache(): Promise<void> {
		await this.externalResourceManager.clearCache();
	}

	/**
	 * Parse HTML string into a DOM document
	 */
	parseHTML(html: string): Document {
		const handler = new DomHandler(undefined, {
			withStartIndices: true,
			withEndIndices: true,
		});
		const parser = new Parser(handler);
		parser.write(html);
		parser.end();

		const document = handler.root;

		return document;
	}

	/**
	 * Get the text content of an element's children
	 */
	private sourceTextFromElementChildren(element: Element): string {
		return serialize(element.children, serializeOptions);
	}

	private tryPushSource<T extends AnalysisNode<false> | AnalysisNode<true>>(
		result: Array<T>,
		source: T,
	): void {
		if ('content' in source) {
			const R = result as Array<AnalysisNode<true>>;
			if (R.find((s) => s.content === source.content) === undefined) {
				R.push(source);
			}
		} else {
			const R = result as Array<AnalysisNode<false>>;
			if (R.find((s) => s.src === source.src) === undefined) {
				R.push(source);
			}
		}
	}

	/**
	 * Analyze DOM structure and extract CSP-relevant information
	 */
	async analyzeDOM(document: Document): Promise<HTMLAnalysisResult> {
		const result: HTMLAnalysisResult = {
			inlineScripts: [],
			inlineStyles: [],
			scriptSources: [],
			styleSources: [],
			imageSources: [],
			fontSources: [],
			otherSources: {},
			document,
			head: undefined,
		};

		const elements = document.children;

		const elementSubset = findAll(
			(element) =>
				[ElementType.Script, ElementType.Style, ElementType.Tag].includes(element.type) &&
				['script', 'style', 'link', 'img', 'head'].includes(element.name),
			elements,
		);

		// Process all elements
		for (const ele of elementSubset) {
			if (ele.type === ElementType.Script) {
				const element = ele;
				const src = element.attribs.src;
				if (src) {
					this.tryPushSource(result.scriptSources, {
						src,
						element,
					} as AnalysisNode<false>);
				} else {
					// Inline script
					const content = this.sourceTextFromElementChildren(element) || '';
					if (content.trim()) {
						this.tryPushSource(result.inlineScripts, {
							content,
							element,
						} as AnalysisNode<true>);
					}
				}
			} else if (ele.type === ElementType.Style) {
				const element = ele;
				const src = element.attribs.src;
				if (src) {
					this.tryPushSource(result.styleSources, {
						src,
						element,
					} as AnalysisNode<false>);
				} else {
					// Inline style
					const content = this.sourceTextFromElementChildren(element) || '';
					if (content.trim()) {
						this.tryPushSource(result.inlineStyles, {
							content,
							element,
						} as AnalysisNode<true>);
					}
				}
			} else if (ele.type === ElementType.Tag && ele.name === 'link') {
				const element = ele;
				const rel = element.attribs.rel;
				const href = element.attribs.href;
				if (href) {
					if (rel === 'stylesheet') {
						this.tryPushSource(result.styleSources, {
							src: href,
							element,
						} as AnalysisNode<false>);
					} else if (rel === 'preload' || rel === 'prefetch') {
						const as = element.attribs.as;
						if (as === 'font') {
							this.tryPushSource(result.fontSources, {
								src: href,
								element,
							} as AnalysisNode<false>);
						} else if (as) {
							if (result.otherSources?.[as] === undefined) {
								result.otherSources[as] = [];
							}
							this.tryPushSource(result.otherSources[as], {
								src: href,
								element,
							} as AnalysisNode<false>);
						}
					}
				}
			} else if (ele.type === ElementType.Tag && ele.name === 'img') {
				const element = ele;
				const src = element.attribs.src;
				if (src) {
					this.tryPushSource(result.imageSources, {
						src,
						element,
					} as AnalysisNode<false>);
				}
			} else if (ele.type === ElementType.Tag && ele.name === 'head') {
				result.head = ele;
			}
		}

		return result;
	}

	/**
	 * Analyze HTML string (parses and then analyzes)
	 */
	async analyzeHTML(html: string): Promise<HTMLAnalysisResult> {
		const document = this.parseHTML(html);
		return this.analyzeDOM(document);
	}

	/**
	 * Inject CSP meta tag into document head
	 */
	private injectCSPMetaTag(
		document: Document,
		cspDirectives: CspDirectives,
		headElement?: Element,
	): void {
		const head = headElement ?? this.createHead(document);

		// If injectMetaTag is false, remove any existing CSP meta tags
		if (!this.options.injectMetaTag) {
			const existingCSPMetaTags = this.findExistingCSPMetaTags(head);
			existingCSPMetaTags.forEach(removeElement);
			return;
		}

		const headers = cspDirectives.getHeaders();
		const cspValue = headers['Content-Security-Policy'];

		// Create new CSP meta tag
		const newMetaTag = this.createCSPMetaTag(cspValue);
		// Find existing CSP meta tags
		const existingCSPMetaTags = this.findExistingCSPMetaTags(head);

		// Remove existing CSP meta tags if replaceExisting is true
		if (this.options.metaTagOptions.replaceExisting && existingCSPMetaTags.length > 0) {
			replaceElement(existingCSPMetaTags.shift()!, newMetaTag);
			existingCSPMetaTags.forEach(removeElement);
		} else {
			this.insertMetaTagAtPosition(head, newMetaTag);
		}
	}

	/**
	 * Find or create head element
	 */
	private createHead(document: Document): Element {
		const head = new DomElement('head', {});

		// Insert head at the beginning of the document
		prependChild(document, head);
		return head;
	}

	/**
	 * Find existing CSP meta tags
	 */
	private findExistingCSPMetaTags(head: Element): Element[] {
		return findAll((child) => {
			if (child.type === ElementType.Tag && child.name === 'meta') {
				const meta = child;
				const httpEquiv = meta.attribs['http-equiv'] || meta.attribs.httpEquiv;
				return httpEquiv?.toLowerCase() === 'content-security-policy';
			}
			return false;
		}, head.children);
	}

	/**
	 * Create CSP meta tag element
	 */
	private createCSPMetaTag(cspValue: string): Element {
		const metaTag = new DomElement('meta', {
			'http-equiv': 'Content-Security-Policy',
			content: cspValue,
			...this.options.metaTagOptions.attributes,
		});

		return metaTag;
	}

	/**
	 * Insert meta tag at specified position in head
	 */
	private insertMetaTagAtPosition(head: Element, metaTag: Element): void {
		const position = this.options.metaTagOptions.position;

		if (typeof position === 'function') {
			const [resolvedPosition, resolvedElement] = position(head);
			if (resolvedPosition === 'prepend') return prepend(resolvedElement, metaTag);

			if (resolvedPosition === 'append') return append(resolvedElement, metaTag);

			if (resolvedPosition === 'prepend-child') return prependChild(resolvedElement, metaTag);

			if (resolvedPosition === 'append-child') return appendChild(resolvedElement, metaTag);
		} else if (typeof position === 'string') {
			if (position === 'first') return prependChild(head, metaTag);

			if (position === 'last') return appendChild(head, metaTag);

			if (position === 'after-title') {
				const title = findOne(
					(child) => child.type === ElementType.Tag && child.name === 'title',
					head.children,
				);
				if (title) {
					return append(title, metaTag);
				}
			}
		}

		return prependChild(head, metaTag);
	}

	/**
	 * Process DOM and generate CSP
	 */
	async processDOM(
		document: Document,
		requestNonces?: { script?: string; style?: string },
	): Promise<CSPResult> {
		const analysis = await this.analyzeDOM(document);

		// Generate nonces if enabled and not provided
		const nonces = {
			script: this.options.enableNonces
				? (requestNonces?.script ?? (await this.options.nonceGenerator()))
				: undefined,
			style: this.options.enableNonces
				? (requestNonces?.style ?? (await this.options.nonceGenerator()))
				: undefined,
		};

		// Build CSP directives based on analysis
		const cspBuilder = new CspDirectives(this.options.baseDirectives.CSP);

		// Ensure base directives are preserved by merging them with any existing CSP directives
		/* if (this.options.baseDirectives.CSP) {
			cspBuilder.CSP['script-src'] = [...(cspBuilder.CSP['script-src'] ?? []), ...(this.options.baseDirectives.CSP['script-src'] ?? [])] as Sources;
			cspBuilder.CSP['style-src'] = [...(cspBuilder.CSP['style-src'] ?? []), ...(this.options.baseDirectives.CSP['style-src'] ?? [])] as Sources;
			cspBuilder.CSP['img-src'] = [...(cspBuilder.CSP['img-src'] ?? []), ...(this.options.baseDirectives.CSP['img-src'] ?? [])] as Sources;
			cspBuilder.CSP['font-src'] = [...(cspBuilder.CSP['font-src'] ?? []), ...(this.options.baseDirectives.CSP['font-src'] ?? [])] as Sources;
			cspBuilder.CSP['default-src'] = [...(cspBuilder.CSP['default-src'] ?? []), ...(this.options.baseDirectives.CSP['default-src'] ?? [])] as Sources;
		} */

		// Add script sources. Strict default is `'self'` plus hashes/nonces.
		const scriptSrc: ActionSource[] = [STRICT_FETCH_DEFAULT];
		if (this.options.enableHashes) {
			for (const script of analysis.inlineScripts) {
				const hash = await generateHash(script.content, this.options.hashAlgorithm);
				script.hash = hash;
				scriptSrc.push(hash);
			}
		}
		if (this.options.enableNonces && nonces.script !== undefined) {
			scriptSrc.push(`nonce-${nonces.script}`);
		}

		for (const scriptSource of analysis.scriptSources) {
			// Add external script nonces
			if (this.shouldNonceExternalSource(scriptSource.src, 'script')) {
				const externalNonce = await this.generateExternalNonce(scriptSource.src, 'script');
				scriptSource.nonce = externalNonce;
				scriptSrc.push(`nonce-${externalNonce}`);
			}
			// Add external script hashes
			if (this.shouldHashExternalSource(scriptSource.src, 'script')) {
				const result = await this.processExternalSourceForHashing(scriptSource.src, 'script');
				if (result.hash !== undefined) {
					scriptSource.hash = result.hash;
					scriptSrc.push(result.hash);

					// Add integrity attribute if enabled
					if (this.options.externalSources.hashing?.integrity && result.hash) {
						this.addIntegrityAttribute(scriptSource.element, result.hash);
					}
				}
			}
		}

		// Add style sources. Strict default is `'self'` plus hashes/nonces.
		const styleSrc: Sources = [STRICT_FETCH_DEFAULT];
		if (this.options.enableHashes) {
			for (const style of analysis.inlineStyles) {
				const hash = await generateHash(style.content, this.options.hashAlgorithm);
				style.hash = hash;
				styleSrc.push(hash);
			}
		}
		if (this.options.enableNonces && nonces.style !== undefined) {
			styleSrc.push(`nonce-${nonces.style}`);
		}

		for (const styleSource of analysis.styleSources) {
			// Add external style nonces
			if (this.shouldNonceExternalSource(styleSource.src, 'style')) {
				const externalNonce = await this.generateExternalNonce(styleSource.src, 'style');
				styleSource.nonce = externalNonce;
				styleSrc.push(`nonce-${externalNonce}`);
			}
			// Add external style hashes
			if (this.shouldHashExternalSource(styleSource.src, 'style')) {
				const result = await this.processExternalSourceForHashing(styleSource.src, 'style');
				if (result.hash !== undefined) {
					styleSource.hash = result.hash;
					styleSrc.push(result.hash);

					// Add integrity attribute if enabled
					if (this.options.externalSources.hashing?.integrity && result.hash) {
						this.addIntegrityAttribute(styleSource.element, result.hash);
					}
				}
			}
		}

		// Add image sources with potential nonces
		const imgSrc: Sources = [];
		for (const imageSource of analysis.imageSources) {
			if (this.shouldNonceExternalSource(imageSource.src, 'image')) {
				const externalNonce = await this.generateExternalNonce(imageSource.src, 'image');
				imageSource.nonce = externalNonce;
				imgSrc.push(`nonce-${externalNonce}`);
			}
			// Add external image hashes
			if (this.shouldHashExternalSource(imageSource.src, 'image')) {
				const result = await this.processExternalSourceForHashing(imageSource.src, 'image');
				if (result.hash !== undefined) {
					imageSource.hash = result.hash;
					imgSrc.push(result.hash);

					// Add integrity attribute if enabled
					if (this.options.externalSources.hashing?.integrity && result.hash) {
						this.addIntegrityAttribute(imageSource.element, result.hash);
					}
				}
			}
		}

		// Add font sources with potential nonces
		const fontSrc: Sources = [];
		for (const fontSource of analysis.fontSources) {
			if (this.shouldNonceExternalSource(fontSource.src, 'font')) {
				const externalNonce = await this.generateExternalNonce(fontSource.src, 'font');
				fontSource.nonce = externalNonce;
				fontSrc.push(`nonce-${externalNonce}`);
			}
			// Add external font hashes
			if (this.shouldHashExternalSource(fontSource.src, 'font')) {
				const result = await this.processExternalSourceForHashing(fontSource.src, 'font');
				if (result.hash !== undefined) {
					fontSource.hash = result.hash;
					fontSrc.push(result.hash);

					// Add integrity attribute if enabled
					if (this.options.externalSources.hashing?.integrity && result.hash) {
						this.addIntegrityAttribute(fontSource.element, result.hash);
					}
				}
			}
		}
		if (this.options.developmentMode) {
			if (this.options.development?.allowUnsafeInline) {
				styleSrc.push('unsafe-inline');
				scriptSrc.push('unsafe-inline');
			}
			if (this.options.development?.allowUnsafeEval) {
				scriptSrc.push('unsafe-eval');
			}
		}

		// Update CSP directives
		cspBuilder.CSP['script-src'] = appendSources(
			cspBuilder.CSP['script-src'] as ActionSource | ActionSource[] | undefined,
			scriptSrc,
		);
		cspBuilder.CSP['style-src'] = appendSources(
			cspBuilder.CSP['style-src'] as Sources | undefined,
			styleSrc,
		);
		if (imgSrc.length > 0) {
			cspBuilder.CSP['img-src'] = appendSources(
				cspBuilder.CSP['img-src'] as Sources | undefined,
				imgSrc,
			);
		}
		if (fontSrc.length > 0) {
			cspBuilder.CSP['font-src'] = appendSources(
				cspBuilder.CSP['font-src'] as Sources | undefined,
				fontSrc,
			);
		}

		if (this.options.developmentMode) {
			const additionalSources = this.options.development?.additionalSources ?? [];
			if (additionalSources.length > 0) {
				const defaultSrc = cspBuilder.CSP['default-src'] ?? [];
				cspBuilder.CSP = {
					...cspBuilder.CSP,
					'default-src': [
						...(Array.isArray(defaultSrc) ? defaultSrc : [defaultSrc]),
						...additionalSources,
					] as ActionSource[],
				};
			}
		}
		// Inject nonces into DOM if enabled
		if (
			this.options.enableNonces &&
			(nonces.script !== undefined || nonces.style !== undefined)
		) {
			// Add nonces to inline scripts and styles
			if (nonces.script !== undefined) {
				for (const inlineScript of analysis.inlineScripts) {
					inlineScript.nonce = nonces.script;
					// Add nonce attribute to the DOM element
					if (inlineScript.element !== undefined && 'attribs' in inlineScript.element) {
						inlineScript.element.attribs.nonce = nonces.script;
					}
				}
			}

			if (nonces.style !== undefined) {
				for (const inlineStyle of analysis.inlineStyles) {
					inlineStyle.nonce = nonces.style;
					// Add nonce attribute to the DOM element
					if (inlineStyle.element !== undefined && 'attribs' in inlineStyle.element) {
						inlineStyle.element.attribs.nonce = nonces.style;
					}
				}
			}
		}

		// Inject CSP meta tag if enabled
		if (this.options.injectMetaTag) {
			this.injectCSPMetaTag(document, cspBuilder, analysis.head);
		}

		// Serialize modified HTML
		const modifiedHtml = serialize(document.children, serializeOptions);

		return {
			builder: cspBuilder,
			headers: this.options.generateHeaders ? cspBuilder.getHeaders() : {},
			nonces,
			analysis,
			html: modifiedHtml,
		};
	}

	/**
	 * Process HTML string (parses and then processes)
	 */
	async processHTML(
		html: string,
		requestNonces?: { script?: string; style?: string },
	): Promise<CSPResult> {
		const document = this.parseHTML(html);
		return this.processDOM(document, requestNonces);
	}

	/**
	 * Check if a source should be nonced based on external noncing options
	 */
	private shouldNonceExternalSource(
		source: string,
		type: 'script' | 'style' | 'image' | 'font' | 'other',
	): boolean {
		const externalNoncing = this.options.externalSources?.noncing ?? {};

		// Check if noncing is enabled for this type
		const typeEnabled = externalNoncing[`${type}s` as keyof typeof externalNoncing] as boolean;
		if (!typeEnabled) {
			return false;
		}

		// Check exclude patterns first
		const excludePatterns = externalNoncing.excludePatterns || [];
		for (const pattern of excludePatterns) {
			if (typeof pattern === 'string') {
				if (source.includes(pattern)) {
					return false;
				}
			} else {
				if (pattern.test(source)) {
					return false;
				}
			}
		}

		// If include patterns are specified, check them
		const includePatterns = externalNoncing.includePatterns || [];
		if (includePatterns.length > 0) {
			for (const pattern of includePatterns) {
				if (typeof pattern === 'string') {
					if (source.includes(pattern)) {
						return true;
					}
				} else {
					if (pattern.test(source)) {
						return true;
					}
				}
			}
			return false; // No patterns matched
		}

		return true; // No include patterns specified, so nonce all of this type
	}

	/**
	 * Generate nonce for external sources
	 */
	private async generateExternalNonce(
		src: string,
		type: 'script' | 'style' | 'image' | 'font' | 'other',
	): Promise<string> {
		const externalNoncing = this.options.externalSources?.noncing;
		const generator = externalNoncing?.nonceGenerator || this.options.nonceGenerator;
		return generator(src, type);
	}

	/**
	 * Check if a source should be hashed based on external hashing options
	 */
	private shouldHashExternalSource(
		source: string,
		type: 'script' | 'style' | 'image' | 'font' | 'other',
	): boolean {
		const externalHashing = this.options.externalSources?.hashing ?? {};

		// Check if hashing is enabled for this type
		const typeEnabled = externalHashing[`${type}s` as keyof typeof externalHashing] as boolean;
		if (!typeEnabled) {
			return false;
		}

		// Check local integrity flags for local resources
		if (type === 'script' && !externalHashing.localScriptIntegrity) {
			// Skip local scripts if localScriptIntegrity is disabled
			if (this.isLocalResource(source)) {
				return false;
			}
		}

		if (type === 'style' && !externalHashing.localStyleIntegrity) {
			// Skip local styles if localStyleIntegrity is disabled
			if (this.isLocalResource(source)) {
				return false;
			}
		}

		// Check exclude patterns first
		const excludePatterns = externalHashing.excludePatterns || [];
		for (const pattern of excludePatterns) {
			if (typeof pattern === 'string') {
				if (source.includes(pattern)) {
					return false;
				}
			} else {
				if (pattern.test(source)) {
					return false;
				}
			}
		}

		// If include patterns are specified, check them
		const includePatterns = externalHashing.includePatterns || [];
		if (includePatterns.length > 0) {
			for (const pattern of includePatterns) {
				if (typeof pattern === 'string') {
					if (source.includes(pattern)) {
						return true;
					}
				} else {
					if (pattern.test(source)) {
						return true;
					}
				}
			}
			return false; // No patterns matched
		}

		return true; // No include patterns specified, so hash all of this type
	}

	/**
	 * Process external source for hashing
	 */
	private async processExternalSourceForHashing(
		src: string,
		type: 'script' | 'style' | 'image' | 'font' | 'other',
	): Promise<{ hash?: HashSource }> {
		const externalHashing = this.options.externalSources?.hashing ?? {};

		// Use custom hash generator if provided
		if (externalHashing.hashGenerator) {
			try {
				const hash = await externalHashing.hashGenerator(src, type);
				return { hash: toHashSource(hash, this.options.hashAlgorithm) };
			} catch {
				return {};
			}
		}

		// Use external resource manager for fetching and hashing
		const result = await this.externalResourceManager.processExternalResource(
			src,
			type,
			externalHashing.fetchExternal,
		);

		// If we have content, generate hash from it
		if (result.content !== undefined) {
			try {
				const hash = await generateHash(result.content, this.options.hashAlgorithm);
				return { hash };
			} catch {
				return {};
			}
		}

		// Fallback: generate hash from the URL itself
		try {
			const hash = await generateHash(src, this.options.hashAlgorithm);
			return { hash };
		} catch {
			return {};
		}
	}

	/**
	 * Check if a resource is local (not external)
	 */
	private isLocalResource(source: string): boolean {
		// Simple check for local resources
		// This could be enhanced with more sophisticated local resource detection
		return (
			source.startsWith('/') ||
			source.startsWith('./') ||
			source.startsWith('../') ||
			!source.includes('://')
		);
	}

	/**
	 * Add integrity attribute to external source
	 */
	private addIntegrityAttribute(element: ChildNode, hash: string): void {
		if (
			(element.type === ElementType.Tag ||
				element.type === ElementType.Script ||
				element.type === ElementType.Style) &&
			'attribs' in element
		) {
			const tagElement = element;
			if (
				tagElement.name === 'script' ||
				tagElement.name === 'style' ||
				tagElement.name === 'img' ||
				tagElement.name === 'link'
			) {
				tagElement.attribs.integrity = toHashSource(hash, this.options.hashAlgorithm);
			}
		}
	}
}
