import type { CSPProcessorOptions } from '@csp-plugins/core';

/**
 * Asset information tracked during build
 */
export interface TrackedAsset {
	/** Unique identifier for the asset */
	id: string;
	/** File path or URL */
	path: string;
	/** Asset type (script, style, image, etc.) */
	type: 'script' | 'style' | 'image' | 'font' | 'media' | 'document' | 'worker' | 'other';
	/** Whether this is an inline asset */
	inline: boolean;
	/** Content hash if available */
	hash?: string;
	/** MIME type if known */
	mimeType?: string;
	/** Source code if inline or accessible */
	source?: string;
	/** Build tool that generated this asset */
	buildTool: string;
	/** Timestamp when asset was tracked */
	timestamp: number;
}

/**
 * Asset manifest containing all tracked assets
 */
export interface AssetManifest {
	/** Build tool identifier */
	buildTool: string;
	/** Build timestamp */
	buildTime: number;
	/** Output directory */
	outputDir: string;
	/** All tracked assets */
	assets: TrackedAsset[];
	/** CSP processor options */
	cspProcessorOptions: CSPProcessorOptions;
}

/**
 * Consolidated asset manifest containing all tracked assets from multiple build tools
 */
export interface ConsolidatedAssetManifest {
	consolidated: true;
	consolidationTime: number;
	buildTools: string[];
	outputDirs: string[];
	assets: TrackedAsset[];
	cspProcessorOptions: CSPProcessorOptions;
}

/**
 * Options for CSP plugin
 */
export interface CspPluginOptions {
	/** Whether to enable asset tracking */
	trackAssets?: boolean;
	/** Whether to generate CSP directives during build */
	generateCsp?: boolean;
	/** CSP processor options */
	cspProcessorOptions?: CSPProcessorOptions;
	/** Output directory for manifest files */
	manifestDir?: string;
	/** Whether to enable dev server integration */
	devServer?: boolean;
	/** Patterns to include/exclude from tracking */
	includePatterns?: Array<string | RegExp>;
	excludePatterns?: Array<string | RegExp>;
	/** Custom asset type detection */
	assetTypeDetector?: (path: string, content?: string) => TrackedAsset['type'];
}

/**
 * Asset tracker interface that all plugins implement
 */
export interface AssetTracker {
	/** Track a new asset */
	trackAsset: (asset: Omit<TrackedAsset, 'timestamp' | 'buildTool'>) => void;
	/** Get all tracked assets */
	getAssets: () => TrackedAsset[];
	/** Generate asset manifest */
	generateManifest: (outputDir: string) => AssetManifest;
	/** Clear tracked assets */
	clear: () => void;
}

/**
 * Dev server integration interface
 */
export interface DevServerIntegration {
	/** Setup dev server middleware/hooks */
	setupDevServer: () => void;
	/** Cleanup dev server integration */
	cleanup: () => void;
}
