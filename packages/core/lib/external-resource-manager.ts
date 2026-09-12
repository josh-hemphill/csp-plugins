import type { ExternalSourceType } from './csp-processor.ts';
import { cwd } from 'node:process';
import { generateHash } from './crypto.ts';

const DEFAULT_USER_AGENT = `CSP-Plugin/${VERSION}`;

/**
 * Filesystem cache interface for persistent resource caching
 */
export interface FilesystemCache {
	/**
	 * Read cached resource from filesystem
	 */
	read: (key: string) => Promise<{ content: string; hash: string; timestamp: number; sourceType: SourceType } | null>;

	/**
	 * Write resource to filesystem cache
	 */
	write: (key: string, data: { content: string; hash: string; timestamp: number; sourceType: SourceType }) => Promise<void>;

	/**
	 * Check if a cached resource exists
	 */
	exists: (key: string) => Promise<boolean>;

	/**
	 * Clear the filesystem cache
	 */
	clear: () => Promise<void>;

	/**
	 * Get cache statistics
	 */
	getStats: () => Promise<{ size: number; entries: Array<{ key: string; timestamp: number; sourceType: SourceType }> }>;
}

/**
 * Source type classification
 */
export type SourceType = 'local' | 'remote' | 'data' | 'unknown';

/**
 * Local resource resolution options
 */
export interface LocalResourceOptions {
	/**
	 * Base directory for resolving relative paths
	 * @default process.cwd()
	 */
	baseDir?: string;

	/**
	 * Custom function to resolve local resource paths
	 * Useful for build plugins that have asset collections or caches
	 */
	resolver?: (src: string, baseDir: string) => string | Promise<string>;

	/**
	 * Custom function to check if a path exists
	 * Useful for build plugins that need to verify file existence
	 */
	exists?: (path: string) => boolean | Promise<boolean>;

	/**
	 * Custom function to read local file content
	 * Useful for build plugins that have their own file reading mechanisms
	 */
	reader?: (path: string) => string | Promise<string>;
}

export interface RemoteResourceOptions {
	/**
	 * Timeout for fetch requests in milliseconds
	 * @default 10000
	 */
	timeout?: number;

	/**
	 * Maximum content size to fetch in bytes
	 * @default 1048576 (1MB)
	 */
	maxSize?: number;

	/**
	 * User agent string for fetch requests
	 * @default 'CSP-Plugin/{VERSION}'
	 */
	userAgent?: string;

	/**
	 * Additional headers to include in fetch requests
	 */
	headers?: Record<string, string>;

	/**
	 * Retry configuration
	 */
	retry?: {
		/**
		 * Number of retry attempts
		 * @default 3
		 */
		attempts?: number;

		/**
		 * Delay between retries in milliseconds
		 * @default 1000
		 */
		delay?: number;
	};

	/**
	 * Patterns to include in the fetch request
	 */
	includePatterns?: Array<string | RegExp>;

	/**
	 * Patterns to exclude from the fetch request
	 */
	excludePatterns?: Array<string | RegExp>;
}

/**
 * Options for external resource fetching
 */
export interface ExternalResourceOptions {
	remote?: RemoteResourceOptions;

	/**
	 * Local resource handling options
	 */
	local?: LocalResourceOptions;

	/**
	 * Patterns to identify local resources
	 * @default ['^/', '^\\./', '^[a-zA-Z]:\\\\', '^file://']
	 */
	localPatterns?: Array<string | RegExp>;

	/**
	 * Patterns to identify remote resources
	 * @default ['^https?://', '^//']
	 */
	remotePatterns?: Array<string | RegExp>;

	/**
	 * Patterns to identify data URLs
	 * @default ['^data:']
	 */
	dataPatterns?: Array<string | RegExp>;

	/**
	 * Filesystem cache options for persistent caching
	 */
	filesystemCache?: FilesystemCache | null;
}

/**
 * Internal options with compiled patterns
 */
interface InternalExternalResourceOptions extends Omit<ExternalResourceOptions, 'localPatterns' | 'remotePatterns' | 'dataPatterns'> {
	localPatterns: RegExp[];
	remotePatterns: RegExp[];
	dataPatterns: RegExp[];
	filesystemCache?: FilesystemCache | null;
}

/**
 * Result of source classification
 */
export interface SourceClassification {
	/**
	 * The type of source
	 */
	type: SourceType;

	/**
	 * The resolved path/URL
	 */
	resolvedPath: string;

	/**
	 * Whether the source is accessible
	 */
	accessible: boolean;

	/**
	 * Error message if not accessible
	 */
	error?: string;
}

/**
 * Result of external resource resolution
 */
export interface ExternalResourceResult {
	/**
	 * The resolved URL
	 */
	url: string;

	/**
	 * The source type classification
	 */
	sourceType: SourceType;

	/**
	 * The fetched content (if fetchExternal is enabled)
	 */
	content?: string;

	/**
	 * Whether the resource was successfully fetched
	 */
	fetched: boolean;

	/**
	 * Error message if fetching failed
	 */
	error?: string;
}

/**
 * Cache for external resources to avoid refetching
 */
interface ResourceCache {
	[key: string]: {
		content: string;
		hash: string;
		timestamp: number;
		sourceType: SourceType;
	};
}

type DeepRequired<T> = Required<{
	[K in keyof T]: T[K] extends Required<T[K]> ? T[K] : DeepRequired<T[K]>
}>;

/**
 * Manages external resource resolution, fetching, and hashing
 */
export class ExternalResourceManager {
	private cache: ResourceCache = {};
	private options: DeepRequired<InternalExternalResourceOptions>;

	constructor(options: ExternalResourceOptions = {}) {
		// Get current working directory safely
		let baseDir = '/';
		try {
			baseDir = cwd();
		}
		catch {
			// Fallback to root if process is not available
			baseDir = '/';
		}

		// Helper function to convert string patterns to RegExp objects
		const compilePatterns = (patterns: Array<string | RegExp>): Array<RegExp> => {
			return patterns.map((pattern) => {
				if (typeof pattern === 'string') {
					// Convert string patterns to RegExp objects
					return new RegExp(pattern);
				}
				return pattern;
			});
		};

		this.options = {
			// Ensure arrays are properly merged and converted to RegExp objects
			// Allow custom patterns to be provided, with defaults as fallback
			localPatterns: compilePatterns(options.localPatterns ?? ['^/', '^\\./', '^[a-zA-Z]:\\\\', '^file://']),
			remotePatterns: compilePatterns(options.remotePatterns ?? ['^https?://', '^//']),
			dataPatterns: compilePatterns(options.dataPatterns ?? ['^data:']),
			remote: {
				timeout: 10000,
				maxSize: 1048576, // 1MB
				userAgent: DEFAULT_USER_AGENT,
				headers: {},
				...options.remote,
				retry: {
					attempts: 3,
					delay: 1000,
					...options.remote?.retry,
				},
				includePatterns: options.remote?.includePatterns ?? [],
				excludePatterns: options.remote?.excludePatterns ?? [],
			},
			local: {
				baseDir,
				...options.local,
				resolver: options.local?.resolver ?? (async (src, baseDir) => this.resolveLocalPath(src, baseDir)),
				exists: options.local?.exists ?? (async (path) => this.checkLocalAccess(path)),
				reader: options.local?.reader ?? (async (path) => this.readLocalFile(path)),
			},
			filesystemCache: options.filesystemCache ?? null,
		} satisfies DeepRequired<InternalExternalResourceOptions>;

		// If custom local patterns are provided, add them to the local patterns
		if (options.localPatterns) {
			this.options.localPatterns = compilePatterns(options.localPatterns);
		}
	}

	/**
	 * Classify a source as local, remote, data, or unknown
	 */
	async classifySource(src: string): Promise<SourceClassification> {
		// Check for data URLs first
		for (const pattern of this.options.dataPatterns ?? []) {
			if (pattern.test(src)) {
				return {
					type: 'data',
					resolvedPath: src,
					accessible: true,
				};
			}
		}

		// Check for remote URLs
		for (const pattern of this.options.remotePatterns ?? []) {
			if (pattern.test(src)) {
				return {
					type: 'remote',
					resolvedPath: src.startsWith('//') ? `https:${src}` : src,
					accessible: true,
				};
			}
		}

		// Check for local patterns
		for (const pattern of this.options.localPatterns ?? []) {
			if (pattern.test(src)) {
				const resolvedPath = await this.options.local.resolver(src, this.options.local.baseDir);
				const accessible = await this.options.local.exists(resolvedPath);
				return {
					type: 'local',
					resolvedPath,
					accessible,
					error: accessible ? undefined : 'Local file not found or not accessible',
				};
			}
		}

		// Unknown type
		return {
			type: 'unknown',
			resolvedPath: src,
			accessible: false,
			error: 'Unable to classify source type',
		};
	}

	/**
	 * Resolve a local file path
	 */
	private async resolveLocalPath(src: string, _baseDir: string): Promise<string> {
		// Default resolution logic
		if (src.startsWith('file://')) {
			return src;
		}

		if (src.startsWith('/')) {
			// Absolute path
			return src;
		}

		if (src.startsWith('./') || src.startsWith('../')) {
			// Relative path
			return new URL(src, `file://${this.options.local.baseDir}/`).pathname;
		}

		// Assume relative to base directory
		return new URL(src, `file://${this.options.local.baseDir}/`).pathname;
	}

	/**
	 * Check if a local file is accessible
	 */
	private async checkLocalAccess(path: string): Promise<boolean> {
		// Default check using Node.js fs
		try {
			const fs = await import('node:fs/promises');
			await fs.access(path);
			return true;
		}
		catch {
			return false;
		}
	}

	/**
	 * Read local file content
	 */
	private async readLocalFile(path: string): Promise<string> {
		// Default reading using Node.js fs
		const fs = await import('node:fs/promises');
		return fs.readFile(path, 'utf-8');
	}

	/**
	 * Resolve a relative URL to absolute URL (for remote sources)
	 */
	resolveUrl(src: string, baseUrl?: string): string {
		try {
			// If it's already an absolute URL, return as is
			if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
				return src.startsWith('//') ? `https:${src}` : src;
			}

			// If no base URL provided, assume it's relative to current origin
			if (baseUrl === undefined || baseUrl === '') {
				return src;
			}

			// Resolve relative URL against base URL
			return new URL(src, baseUrl).href;
		}
		catch {
			// If URL resolution fails, return original src
			return src;
		}
	}

	/**
	 * Check if a URL should be fetched based on patterns
	 */
	shouldFetchUrl(url: string, includePatterns?: Array<string | RegExp>, excludePatterns?: Array<string | RegExp>): boolean {
		// Check exclude patterns first
		if (excludePatterns && excludePatterns.length > 0) {
			for (const pattern of excludePatterns) {
				if (typeof pattern === 'string') {
					if (url.includes(pattern)) {
						return false;
					}
				}
				else {
					if (pattern.test(url)) {
						return false;
					}
				}
			}
		}

		// If include patterns are specified, check them
		if (includePatterns && includePatterns.length > 0) {
			for (const pattern of includePatterns) {
				if (typeof pattern === 'string') {
					if (url.includes(pattern)) {
						return true;
					}
				}
				else {
					if (pattern.test(url)) {
						return true;
					}
				}
			}
			return false; // No patterns matched
		}

		return true; // No include patterns specified, so fetch all
	}

	/**
	 * Read from cache (memory or filesystem)
	 */
	private async readFromCache(key: string): Promise<{ content: string; hash: string; timestamp: number; sourceType: SourceType } | null> {
		// Check memory cache first
		const memoryEntry = this.cache[key];
		if (memoryEntry !== undefined) {
			return memoryEntry;
		}

		// Check filesystem cache if available
		if (this.options.filesystemCache) {
			try {
				const fsEntry = await this.options.filesystemCache.read(key);
				if (fsEntry) {
					// Load into memory cache
					this.cache[key] = fsEntry;
					return fsEntry;
				}
			}
			catch (error) {
				// Silently fall back to memory-only cache
				console.warn(`Failed to read from filesystem cache: ${String(error)}`);
			}
		}

		return null;
	}

	/**
	 * Write to cache (memory and filesystem if available)
	 */
	private async writeToCache(key: string, data: { content: string; hash: string; timestamp: number; sourceType: SourceType }): Promise<void> {
		// Write to memory cache
		this.cache[key] = data;

		// Write to filesystem cache if available
		if (this.options.filesystemCache) {
			try {
				await this.options.filesystemCache.write(key, data);
			}
			catch (error) {
				// Silently fall back to memory-only cache
				console.warn(`Failed to write to filesystem cache: ${String(error)}`);
			}
		}
	}

	/**
	 * Fetch external resource with retry logic
	 */
	async fetchResource(url: string): Promise<{ content: string; hash: string } | null> {
		const cacheKey = url;
		const now = Date.now();

		// Check cache (memory or filesystem)
		const cacheEntry = await this.readFromCache(cacheKey);
		if (cacheEntry !== null && (now - cacheEntry.timestamp) < 3600000) {
			return {
				content: cacheEntry.content,
				hash: cacheEntry.hash,
			};
		}

		for (let attempt = 1; attempt <= (this.options.remote?.retry?.attempts ?? 0); attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.options.remote?.timeout ?? 10000);

				const response = await fetch(url, {
					signal: controller.signal,
					headers: {
						'User-Agent': this.options.remote?.userAgent ?? DEFAULT_USER_AGENT,
						...this.options.remote?.headers,
					},
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const contentLength = response.headers.get('content-length');
				if (contentLength !== undefined && contentLength !== null && contentLength.length > 0) {
					const size = Number.parseInt(contentLength, 10);
					if (size > (this.options.remote?.maxSize ?? 1048576)) {
						throw new Error(`Content too large: ${contentLength} bytes`);
					}
				}

				const content = await response.text();

				if (content.length > (this.options.remote?.maxSize ?? 1048576)) {
					throw new Error(`Content too large: ${content.length} bytes`);
				}

				// Generate hash
				const hash = await generateHash(content, 'sha256');

				// Cache the result
				await this.writeToCache(cacheKey, {
					content,
					hash,
					timestamp: now,
					sourceType: 'remote',
				});

				return { content, hash };
			}
			catch (error) {
				// Don't retry on certain errors
				if (error instanceof Error) {
					if (error.name === 'AbortError' || error.message.includes('too large')) {
						break;
					}
				}

				// Wait before retry (except on last attempt)
				if (attempt < (this.options.remote?.retry?.attempts ?? 0)) {
					await new Promise((resolve) => setTimeout(resolve, this.options.remote?.retry?.delay ?? 1000));
				}
			}
		}

		return null;
	}

	/**
	 * Process external resource for hashing
	 */
	async processExternalResource(
		src: string,
		type: ExternalSourceType,
		fetchExternal?: boolean | ((src: string) => string),
	): Promise<ExternalResourceResult> {
		// Check cache first
		const cacheKey = src;
		const now = Date.now();

		// Check cache (memory or filesystem)
		const cacheEntry = await this.readFromCache(cacheKey);
		if (cacheEntry !== null && (now - cacheEntry.timestamp) < 3600000) {
			return {
				url: src,
				sourceType: cacheEntry.sourceType,
				content: cacheEntry.content,
				fetched: true,
			};
		}

		// First, classify the source
		const classification = await this.classifySource(src);

		// Handle data URLs
		if (classification.type === 'data') {
			try {
				const result: ExternalResourceResult = {
					url: src,
					sourceType: 'data',
					content: src,
					fetched: true,
				};

				// Cache the result
				await this.writeToCache(cacheKey, {
					content: src,
					hash: '', // Data URLs don't need hashing
					timestamp: now,
					sourceType: 'data' as SourceType,
				});

				return result;
			}
			catch (error) {
				return {
					url: src,
					sourceType: 'data',
					fetched: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				};
			}
		}

		// Handle local files
		if (classification.type === 'local') {
			if (!classification.accessible) {
				return {
					url: classification.resolvedPath,
					sourceType: 'local',
					fetched: false,
					error: classification.error,
				};
			}

			try {
				const content = await this.options.local.reader(classification.resolvedPath);
				const result: ExternalResourceResult = {
					url: classification.resolvedPath,
					sourceType: 'local',
					content,
					fetched: true,
				};

				// Cache the result
				await this.writeToCache(cacheKey, {
					content,
					hash: '', // Local files don't need hashing here
					timestamp: now,
					sourceType: 'local' as SourceType,
				});

				return result;
			}
			catch (error) {
				return {
					url: classification.resolvedPath,
					sourceType: 'local',
					fetched: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				};
			}
		}

		// Handle remote URLs
		if (classification.type === 'remote') {
			const resolvedUrl = classification.resolvedPath;
			const shouldFetch = this.shouldFetchUrl(
				resolvedUrl,
				this.options.remote?.includePatterns,
				this.options.remote?.excludePatterns,
			);

			if (!shouldFetch) {
				return {
					url: resolvedUrl,
					sourceType: 'remote',
					fetched: false,
				};
			}

			// Handle custom fetchExternal function
			if (typeof fetchExternal === 'function') {
				try {
					const customContent = fetchExternal(src);
					const result: ExternalResourceResult = {
						url: resolvedUrl,
						sourceType: 'remote',
						content: customContent,
						fetched: true,
					};

					// Cache the result
					await this.writeToCache(cacheKey, {
						content: customContent,
						hash: '', // Remote content doesn't need hashing here
						timestamp: now,
						sourceType: 'remote',
					});

					return result;
				}
				catch (error) {
					return {
						url: resolvedUrl,
						sourceType: 'remote',
						fetched: false,
						error: error instanceof Error ? error.message : 'Unknown error',
					};
				}
			}

			// Handle boolean fetchExternal
			if (fetchExternal === true) {
				const result = await this.fetchResource(resolvedUrl);

				if (result) {
					const processResult: ExternalResourceResult = {
						url: resolvedUrl,
						sourceType: 'remote',
						content: result.content,
						fetched: true,
					};

					// Cache the result
					await this.writeToCache(cacheKey, {
						content: result.content,
						hash: result.hash,
						timestamp: now,
						sourceType: 'remote',
					});

					return processResult;
				}
				else {
					return {
						url: resolvedUrl,
						sourceType: 'remote',
						fetched: false,
						error: 'Failed to fetch resource',
					};
				}
			}

			// If no fetchExternal is provided, still cache the classification
			const result: ExternalResourceResult = {
				url: resolvedUrl,
				sourceType: 'remote',
				fetched: false,
			};

			// Cache the result even if not fetched
			await this.writeToCache(cacheKey, {
				content: '', // No content when not fetched
				hash: '',
				timestamp: now,
				sourceType: 'remote',
			});

			return result;
		}

		// Unknown type or fallback
		return {
			url: classification.resolvedPath,
			sourceType: classification.type,
			fetched: false,
			error: classification.error ?? 'Unable to process resource',
		};
	}

	/**
	 * Clear the resource cache
	 */
	async clearCache(): Promise<void> {
		this.cache = {};

		// Clear filesystem cache if available
		if (this.options.filesystemCache) {
			try {
				await this.options.filesystemCache.clear();
			}
			catch (error) {
				console.warn(`Failed to clear filesystem cache: ${String(error)}`);
			}
		}
	}

	/**
	 * Get cache statistics
	 */
	async getCacheStats(): Promise<{ size: number; entries: Array<{ url: string; timestamp: number; sourceType: SourceType }> }> {
		const entries = Object.entries(this.cache).map(([url, entry]) => ({
			url,
			timestamp: entry.timestamp,
			sourceType: entry.sourceType,
		}));

		// Get filesystem cache stats if available
		if (this.options.filesystemCache) {
			try {
				const fsStats = await this.options.filesystemCache.getStats();
				return {
					size: Object.keys(this.cache).length + fsStats.size,
					entries: [...entries, ...fsStats.entries.map((entry) => ({ url: entry.key, timestamp: entry.timestamp, sourceType: entry.sourceType }))],
				};
			}
			catch (error) {
				console.warn(`Failed to get filesystem cache stats: ${String(error)}`);
			}
		}

		return {
			size: Object.keys(this.cache).length,
			entries,
		};
	}
}
