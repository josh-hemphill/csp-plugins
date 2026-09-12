/*
 * Descriptions and other information taken from the Mozilla developer docs
 * @ https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
 */

/**
 * Scheme sources for CSP directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export const schemeSource = [
	'http:',
	'https:',
	'data:',
	'mediastream:',
	'blob:',
	'filesystem:',
] as const;

/**
 * Valid scheme sources for CSP directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type SchemeSource = (typeof schemeSource)[number];

/**
 * Optional path component for URLs.
 */
export type OptionalPath = `${HttpDelineators}${string}` | '';

/**
 * Complete URL string combining host source and optional path.
 */
export type UrlString = `${HostSource}${OptionalPath}`;

/**
 * Protocol schemes for host sources (e.g., "https://", "http://").
 */
export type HostProtocolSchemes = `${string}://` | '';

/**
 * Port scheme for host sources (e.g., ":8080", ":*").
 */
export type PortScheme = `:${number}` | '' | ':*';

/**
 * Hostname scheme for host sources.
 * Can actually be any string, but typed more explicitly to
 * restrict the combined optional types of Source from collapsing to just being `string`.
 */
export type HostNameScheme = `${string}.${string}` | `localhost`;

/**
 * Complete host source combining protocol, hostname, and port.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type HostSource = `${HostProtocolSchemes}${HostNameScheme}${PortScheme}`;

/**
 * Valid hash algorithms for CSP crypto sources.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export const validHashes: Readonly<['sha256', 'sha384', 'sha512']> = [
	'sha256',
	'sha384',
	'sha512',
] as const;
export type ValidHashes = (typeof validHashes)[number];

/**
 * Valid crypto sources including nonce and hash algorithms.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export const validCrypto: Readonly<['nonce', ...typeof validHashes]> = [
	'nonce',
	...validHashes,
] as const;

/**
 * Valid crypto source types.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type ValidCrypto = (typeof validCrypto)[number];

/**
 * Crypto sources with their values (e.g., "nonce-abc123", "sha256-hash").
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type CryptoSources = `${ValidCrypto}-${string}`;

/**
 * HTTP delineators for URI paths.
 */
export const httpDelineators = ['/', '?', '#', '\\'] as const;

/**
 * HTTP delineator characters.
 */
export type HttpDelineators = (typeof httpDelineators)[number];

/**
 * URI path starting with an HTTP delineator.
 */
export type UriPath = `${HttpDelineators}${string}`;

/**
 * Base source directives for CSP.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export const baseSources = [
	'self',
	'unsafe-eval',
	'wasm-unsafe-eval',
	'unsafe-hashes',
	'unsafe-inline',
	'none',
] as const;

/**
 * Base source directive values.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type BaseSources = (typeof baseSources)[number];

/**
 * All possible source directives combined.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export const source = [...baseSources, ...schemeSource] as const;

/**
 * Any valid source for CSP directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type Source = BaseSources | HostSource | SchemeSource | CryptoSources;

/**
 * Single source or array of sources.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#sources}
 */
export type Sources = Source | Source[];

/**
 * Referrer header options for CSP.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/referrer}
 */
export const referrerHeaderOptions = [
	/**
	 * The Referer header will be omitted entirely. No referrer information is sent along with requests.
	 */
	'no-referrer',
	/**
	 * Send the origin, path, and querystring in Referer when the protocol security level stays the same or improves (HTTP→HTTP, HTTP→HTTPS, HTTPS→HTTPS). Don't send the Referer header for requests to less secure destinations (HTTPS→HTTP, HTTPS→file).
	 */
	'no-referrer-when-downgrade',
	/**
	 * Send the origin (only) in the Referer header.
	 * For example, a document at https://example.com/page.html will send the referrer https://example.com/.
	 */
	'origin',
	/**
	 * Send the origin, path, and query string when performing a same-origin request to the same protocol level. Send origin (only) for cross origin requests and requests to less secure destinations.
	 */
	'origin-when-cross-origin',
	/**
	 * Send the origin, path, and query string for same-origin requests. Don't send the Referer header for cross-origin requests.
	 */
	'same-origin',
	/**
	 * Send the origin (only) when the protocol security level stays the same (HTTPS→HTTPS). Don't send the Referer header to less secure destinations (HTTPS→HTTP).
	 */
	'strict-origin',
	/**
	 * Send the origin, path, and querystring when performing a same-origin request. For cross-origin requests send the origin (only) when the protocol security level stays same (HTTPS→HTTPS). Don't send the Referer header to less secure destinations (HTTPS→HTTP).
	 * NOTE
	 * This is the default policy if no policy is specified,
	 * or if the provided value is invalid (see spec revision November 2020).
	 * Previously the default was no-referrer-when-downgrade.
	 */
	'strict-origin-when-cross-origin', // default
	/**
	 * Send the origin, path, and query string when performing any request, regardless of security.
	 * Warning
	 * This policy will leak potentially-private information from HTTPS resource URLs to insecure origins.
	 * Carefully consider the impact of this setting.
	 */
	'unsafe-url',
	'none',
] as const;

/**
 * Referrer header option values.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/referrer}
 */
export type ReferrerHeaderOptions = (typeof referrerHeaderOptions)[number];

/**
 * Child frame and worker directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/child-src MDN Content-Security-Policy/child-src}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-src MDN Content-Security-Policy/frame-src}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/worker-src MDN Content-Security-Policy/worker-src}
 */
export interface ChildDirectives {
	/** Controls resources loaded by child frames and workers. */
	'child-src'?: Sources;
	/** Controls resources loaded by frames. */
	'frame-src'?: Sources;
	/** Controls resources loaded by workers. */
	'worker-src'?: Sources;
}

/**
 * Source directives for various resource types.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#source_directives}
 */
export interface SourceDirectives {
	/** Controls resources loaded via fetch, XHR, WebSocket, or EventSource. */
	'connect-src'?: Sources;
	/** Fallback for other fetch directives. */
	'default-src'?: ActionSource | ActionSource[];
	/** Controls resources loaded via @font-face. */
	'font-src'?: Sources;
	/** Controls resources loaded by frames. */
	'frame-src'?: Sources;
	/** Controls resources loaded via img, srcset, and image(). */
	'img-src'?: Sources;
	/** Controls manifest resources. */
	'manifest-src'?: Sources;
	/** Controls resources loaded via audio and video elements. */
	'media-src'?: Sources;
	/** Controls resources loaded via object, embed, and applet elements. */
	'object-src'?: Sources;
	/** Controls resources that can be prefetched or prerendered. */
	'prefetch-src'?: Sources;
	/** Controls script resources. */
	'script-src'?: ActionSource | ActionSource[];
	/** Controls script elements. */
	'script-src-elem'?: Sources;
	/** Controls inline script event handlers. */
	'script-src-attr'?: Sources;
	/** Controls stylesheet resources. */
	'style-src'?: Sources;
	/** Controls style elements. */
	'style-src-elem'?: Sources;
	/** Controls inline style attributes. */
	'style-src-attr'?: Sources;
}

/**
 * Sandbox directive options for iframe sandboxing.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox MDN Content-Security-Policy/sandbox}
 */
export const sandboxDirectives = [
	/** Allows for downloads to occur without a gesture from the user. */
	'allow-downloads-without-user-activation',
	/** Allows the page to submit forms. If this keyword is not used, this operation is not allowed. */
	'allow-forms',
	/** Allows the page to open modal windows. */
	'allow-modals',
	/** Allows the page to disable the ability to lock the screen orientation. */
	'allow-orientation-lock',
	/** Allows the page to use the Pointer Lock API. */
	'allow-pointer-lock',
	/**
	 * Allows popups (like from window.open, target="_blank", showModalDialog).
	 * If this keyword is not used, that functionality will silently fail.
	 */
	'allow-popups',
	/**
	 * Allows a sandboxed document to open new windows without forcing the sandboxing flags upon them.
	 * This will allow, for example, a third-party advertisement to be safely sandboxed without
	 * forcing the same restrictions upon a landing page.
	 */
	'allow-popups-to-escape-sandbox',
	/** Allows embedders to have control over whether an iframe can start a presentation session. */
	'allow-presentation',
	/**
	 * Allows the content to be treated as being from its normal origin.
	 * If this keyword is not used, the embedded content is treated as being from a unique origin.
	 */
	'allow-same-origin',
	/**
	 * Allows the page to run scripts (but not create pop-up windows).
	 * If this keyword is not used, this operation is not allowed.
	 */
	'allow-scripts',
	/** Lets the resource request access to the parent's storage capabilities with the Storage Access API. */
	'allow-storage-access-by-user-activation',
	/**
	 * Allows the page to navigate (load) content to the top-level browsing context.
	 * If this keyword is not used, this operation is not allowed.
	 */
	'allow-top-navigation',
	/** Lets the resource navigate the top-level browsing context, but only if initiated by a user gesture. */
	'allow-top-navigation-by-user-activation',
] as const;

/**
 * Sandbox directive option values.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox MDN Content-Security-Policy/sandbox}
 */
export type SandboxOption = (typeof sandboxDirectives)[number];

/**
 * Plugin source MIME type format.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/plugin-types MDN Content-Security-Policy/plugin-types}
 */
export type PluginSource = `${string}/${string}` | 'none';

/**
 * Document-level directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/base-uri MDN Content-Security-Policy/base-uri}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/plugin-types MDN Content-Security-Policy/plugin-types}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox MDN Content-Security-Policy/sandbox}
 */
export interface DocumentDirectives {
	/**
	 * Restricts the URLs which can be used in a document's <base> element.
	 */
	'base-uri'?: ActionSource | ActionSource[];

	/**
	 * Restricts the set of plugins that can be embedded into a document by
	 * limiting the types of resources which can be loaded.
		@deprecated */
	'plugin-types'?: PluginSource | PluginSource[];

	/**
	 * Enables a sandbox for the requested resource similar to the <iframe> sandbox attribute.
	 */
	sandbox?: SandboxOption;
}

/**
 * Action source values for script-src and default-src.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#strict-dynamic MDN Content-Security-Policy/script-src#strict-dynamic}
 */
export const actionSource = ['strict-dynamic', 'report-sample'] as const;

/**
 * Action source type including strict-dynamic and report-sample.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#strict-dynamic MDN Content-Security-Policy/script-src#strict-dynamic}
 */
export type ActionSource = Source | (typeof actionSource)[number];

/**
 * Navigation source type for navigation directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#navigation_directives MDN Content-Security-Policy#navigation_directives}
 */
export type NavigationSource = HostSource | SchemeSource | 'self' | 'none';

/**
 * Navigation directives govern to which locations a user can navigate or submit a form, for example.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#navigation_directives MDN Content-Security-Policy#navigation_directives}
 */
export interface NavigationDirectives {
	/**
	 * Restricts the URLs which can be used as the target of a form submissions from a given context.
	 */
	'form-action'?: NavigationSource | NavigationSource[];
	/**
	 * Specifies valid parents that may embed a page using <frame>, <iframe>, <object>, <embed>, or <applet>.
	 */
	'frame-ancestors'?: NavigationSource | NavigationSource[];
	/**
	 * Restricts the URLs to which a document can initiate navigation by any means,
	 * including <form> (if form-action is not specified), <a>, window.location, window.open, etc.
	 * @deprecated
	 */
	'navigate-to'?: NavigationSource | NavigationSource[];
}

/**
 * Reporting directives control the reporting process of CSP violations.
 * See also the Content-Security-Policy-Report-Only header.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#reporting_directives MDN Content-Security-Policy#reporting_directives}
 */
export interface ReportingDirectives {
	/** @deprecated */
	'report-uri'?: UriPath;
	/** @experimental */
	'report-to'?: ReportTo['group'];
}

/**
 * Require trusted types policy values.
 * Disallows using strings with DOM XSS injection sink functions,
 * and requires matching types created by Trusted Type policies.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for MDN Content-Security-Policy/require-trusted-types-for}
 */
export const requireTrustedTypePolicy = ['script'] as const;

/**
 * Require trusted types policy type.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for MDN Content-Security-Policy/require-trusted-types-for}
 */
export type RequireTrustedTypePolicy = (typeof requireTrustedTypePolicy)[number];

/**
 * Trusted types policy values.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/trusted-types MDN Content-Security-Policy/trusted-types}
 */
export const trustedTypesPolicy = ['none', 'allow-duplicates', '*'] as const;

/**
 * Trusted types policy type.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/trusted-types MDN Content-Security-Policy/trusted-types}
 */
export type TrustedTypesPolicy = (typeof trustedTypesPolicy)[number] | string;

/**
 * SRI policy values.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-sri-for MDN Content-Security-Policy/require-sri-for}
 */
export const sriPolicy = ['script', 'style', 'script style'] as const;

/**
 * SRI policy type.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-sri-for MDN Content-Security-Policy/require-sri-for}
 */
export type SriPolicy = (typeof sriPolicy)[number];

/**
 * Other miscellaneous directives.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#other_directives MDN Content-Security-Policy#other_directives}
 */
export interface OtherDirectives {
	/**
	 * Prevents loading any assets using HTTP when the page is loaded using HTTPS.
	 * @deprecated
	 */
	'block-all-mixed-content'?: boolean;

	/**
	 * Used to specify information in the Referer (sic) header for links away from a page.
	 * Use the Referrer-Policy header instead.
	 * @deprecated
	 */
	referrer?: ReferrerHeaderOptions;

	/**
	 * Requires the use of SRI for scripts or styles on the page.
	 * @deprecated
	 */
	'require-sri-for'?: SriPolicy;

	/** Enforces Trusted Types at the DOM XSS injection sinks. */
	'require-trusted-types-for'?: RequireTrustedTypePolicy;

	/**
	 * Used to specify an allow-list of Trusted Types policies.
	 * Trusted Types allows applications to lock down
	 * DOM XSS injection sinks to only accept non-spoofable,
	 * typed values in place of strings.
	 */
	'trusted-types'?: TrustedTypesPolicy | TrustedTypesPolicy[];

	/**
	 * Instructs user agents to treat all of a site's insecure URLs (those served over HTTP)
	 * as though they have been replaced with secure URLs (those served over HTTPS).
	 * This directive is intended for web sites with large numbers of insecure legacy
	 * URLs that need to be rewritten.
	 */
	'upgrade-insecure-requests'?: boolean;
}

export const directiveValuesByCategory = {
	hostSource: [
		{
			displayName: 'Hostname/URL Source',
			consumes: {
				Port: 'number',
				Hostname: 'string',
				Protocol: 'string://',
			},
			compose: (args: {
				Port?: number;
				Hostname?: string;
				Protocol?: HostProtocolSchemes;
			}): HostSource =>
				((args?.Protocol ?? '') +
					(args?.Hostname ?? '') +
					(['number', 'string'].includes(typeof args?.Port)
						? `:${args?.Port}`
						: '')) as HostSource,
		},
	],
	schemeSource,
	cryptoSource: [
		{
			displayName: 'Crypto Nonce/Hash Source',
			consumes: {
				Hash: 'string',
				Algorithm: validCrypto,
			},
			compose: (args: { Hash: string; Algorithm: ValidCrypto }): CryptoSources =>
				`${args.Algorithm}-${args.Hash}`,
		},
	],
	baseSources,
	primitiveSourceBool: [true, false],
	primitiveSourceString: [
		{
			displayName: 'Any String',
			consumes: {
				String: 'string',
			},
			compose: (args: { String: string }): string => args.String,
		},
	],
	trustedTypesPolicy,
	requireTrustedTypePolicy,
	sriPolicy,
	referrerHeaderOptions,
	uriPath: [
		{
			displayName: 'URI Source',
			consumes: {
				'Beginning Delineator': httpDelineators,
				'Remaining Path': 'string',
			},
			compose: (args: {
				'Beginning Delineator': HttpDelineators;
				'Remaining Path': string;
			}): UriPath => `${args['Beginning Delineator']}${args['Remaining Path']}`,
		},
	],
	actionSource,
	pluginSource: [
		{
			displayName: 'Plugin MIME Type Source',
			consumes: {
				'MIME Category': 'string',
				'MIME Implementation': 'string',
			},
			compose: (args: {
				'MIME Category': string;
				'MIME Implementation': string;
			}): PluginSource =>
				`${args['MIME Category']}/${args['MIME Implementation']}` as PluginSource,
		},
		'none',
	],
	navigationSource: ['self', 'none'],
	sandboxDirectives,
} as const;

export const directiveMap: Readonly<
	Record<keyof Directives, Readonly<(keyof typeof directiveValuesByCategory)[]>>
> = {
	'child-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'default-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources', 'actionSource'],
	'frame-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'worker-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'connect-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'font-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'img-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'manifest-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'media-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'object-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'prefetch-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'script-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources', 'actionSource'],
	'script-src-elem': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'script-src-attr': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'style-src': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'style-src-elem': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'style-src-attr': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources'],
	'base-uri': ['hostSource', 'schemeSource', 'cryptoSource', 'baseSources', 'actionSource'],
	'plugin-types': ['pluginSource'],
	sandbox: ['sandboxDirectives'],
	'form-action': ['hostSource', 'schemeSource', 'navigationSource'],
	'frame-ancestors': ['hostSource', 'schemeSource', 'navigationSource'],
	'navigate-to': ['hostSource', 'schemeSource', 'navigationSource'],
	'report-uri': ['uriPath'],
	'report-to': ['primitiveSourceString'],
	'block-all-mixed-content': ['primitiveSourceBool'],
	referrer: ['referrerHeaderOptions'],
	'require-sri-for': ['sriPolicy'],
	'require-trusted-types-for': ['requireTrustedTypePolicy'],
	'trusted-types': ['trustedTypesPolicy', 'primitiveSourceString'],
	'upgrade-insecure-requests': ['primitiveSourceBool'],
} as const;

/**
 * Complete CSP directives combining all directive categories.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy MDN Content-Security-Policy}
 */
export type Directives = ChildDirectives &
	SourceDirectives &
	OtherDirectives &
	ReportingDirectives &
	NavigationDirectives &
	DocumentDirectives;

/**
 * Report-to configuration for CSP violation reporting.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-to MDN Content-Security-Policy/report-to}
 */
export interface ReportTo {
	/** The name of the endpoint group to use for reporting. */
	group: string;
	/** The maximum age of the endpoint group in seconds. */
	max_age: number;
	/** Array of endpoints where violations should be reported. */
	endpoints: { url: UrlString }[];
}
