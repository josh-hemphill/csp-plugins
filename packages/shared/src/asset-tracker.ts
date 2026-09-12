import type { AssetManifest, CspPluginOptions, TrackedAsset } from './types.ts';
import { generateHash } from '@csp-plugins/core';

/**
 * Common asset tracker implementation used by all build plugins
 */
export class CommonAssetTracker {
	private assets: TrackedAsset[] = [];
	private options: Required<CspPluginOptions>;
	private buildTool: string;

	constructor(buildTool: string, options: CspPluginOptions = {}) {
		this.buildTool = buildTool;
		this.options = {
			trackAssets: true,
			generateCsp: false,
			cspProcessorOptions: {},
			manifestDir: '.csp-manifest',
			devServer: false,
			includePatterns: [],
			excludePatterns: [],
			assetTypeDetector: this.defaultAssetTypeDetector.bind(this),
			...options,
		};
	}

	/**
	 * Track a new asset
	 */
	trackAsset(asset: Omit<TrackedAsset, 'timestamp' | 'buildTool'>): void {
		if (!this.options.trackAssets)
			return;

		// Check include/exclude patterns
		if (!this.shouldTrackAsset(asset.path))
			return;

		const trackedAsset: TrackedAsset = {
			...asset,
			buildTool: this.buildTool,
			timestamp: Date.now(),
		};

		// Generate hash if not provided
		if (trackedAsset.source !== undefined && trackedAsset.hash === undefined) {
			generateHash(trackedAsset.source, 'sha256').then((hash: string) => {
				if (trackedAsset.hash === undefined) {
					trackedAsset.hash = hash;
				}
			}).catch((error) => {
				// Hash generation failed, continue without it
				console.error(error);
			});
		}

		this.assets.push(trackedAsset);
	}

	/**
	 * Get all tracked assets
	 */
	getAssets(): TrackedAsset[] {
		return [...this.assets];
	}

	/**
	 * Generate asset manifest
	 */
	generateManifest(outputDir: string): AssetManifest {
		return {
			buildTool: this.buildTool,
			buildTime: Date.now(),
			outputDir,
			assets: this.getAssets(),
			cspProcessorOptions: this.options.cspProcessorOptions,
		};
	}

	/**
	 * Clear tracked assets
	 */
	clear(): void {
		this.assets = [];
	}

	/**
	 * Check if an asset should be tracked based on patterns
	 */
	private shouldTrackAsset(path: string): boolean {
		// Check exclude patterns first
		for (const pattern of this.options.excludePatterns) {
			if (typeof pattern === 'string') {
				if (path.includes(pattern))
					return false;
			}
			else {
				if (pattern.test(path))
					return false;
			}
		}

		// If include patterns are specified, check them
		if (this.options.includePatterns.length > 0) {
			for (const pattern of this.options.includePatterns) {
				if (typeof pattern === 'string') {
					if (path.includes(pattern))
						return true;
				}
				else {
					if (pattern.test(path))
						return true;
				}
			}
			return false; // No patterns matched
		}

		return true; // No include patterns specified, so track all
	}

	/**
	 * Default asset type detection based on file extension and content
	 */
	private defaultAssetTypeDetector(path: string, content?: string): TrackedAsset['type'] {
		const ext = path.split('.').pop()?.toLowerCase();
		const extExists = ext !== undefined && ext.length > 0;

		// Script files
		if (extExists && ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) {
			return 'script';
		}

		// Style files
		if (extExists && ['css', 'scss', 'sass', 'less', 'styl'].includes(ext)) {
			return 'style';
		}

		// Image files
		if (extExists && ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico'].includes(ext)) {
			return 'image';
		}

		// Font files
		if (extExists && ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
			return 'font';
		}

		// Media files
		if (extExists && ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'avi', 'mov'].includes(ext)) {
			return 'media';
		}

		// Document files
		if (extExists && ['html', 'htm', 'xml', 'pdf'].includes(ext)) {
			return 'document';
		}

		// Worker files
		if (['worker.js', 'service-worker.js'].some((pattern) => path.includes(pattern))) {
			return 'worker';
		}

		// Check content for inline scripts/styles
		if (content !== undefined && content.length > 0) {
			if (content.includes('<script') || content.includes('javascript:')) {
				return 'script';
			}
			if (content.includes('<style') || content.includes('style=')) {
				return 'style';
			}
		}

		return 'other';
	}

	/**
	 * Get plugin options
	 */
	getOptions(): Required<CspPluginOptions> {
		return { ...this.options };
	}
}
