#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';

import { SimpleFilesystemCache } from '@csp-plugins/basic-fscache';
import type { CSPProcessorOptions } from '@csp-plugins/core';
import { CSPProcessor, deepMerge, generateHash } from '@csp-plugins/core';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { AssetManifest } from '@csp-plugins/shared/types';
import type { CspDirectives } from '@csp-plugins/typed-directives';
import log from 'loglevel';

import { firstLengthyString } from './cli-utils.ts';

/**
 * Consolidated manifest structure that combines multiple manifests
 */
interface ConsolidatedManifest extends AssetManifest {
	consolidated: true;
	consolidationTime: number;
	buildTools: string[];
	outputDirs: string[];
}

interface CliOptions {
	/** Input directory containing built assets */
	inputDir: string;
	/** Output directory for processed assets */
	outputDir?: string;
	/** Cache directory for filesystem cache */
	cacheDir?: string;
	/** CSP manifests directory path */
	manifestsDir?: string;
	/** CSP processor options */
	cspOptions?: CSPProcessorOptions;
	/** Whether to process HTML files */
	processHTML?: boolean;
	/** Whether to generate CSP headers file */
	generateHeaders?: boolean;
	/** Output file for CSP headers */
	headersOutput?: string;
	/** Enable local script integrity (advanced security feature) */
	localScriptIntegrity?: boolean;
	/** Automatically generate manifest if none found */
	autoManifest?: boolean;
	/** Path to JSON file containing CSP policies */
	cspPolicyFile?: string;
	/** Log level: trace, debug, info, warn, error, or silent */
	logLevel?: string;
}

/**
 * CLI for post-build CSP processing
 *
 * Features:
 * - Processes HTML files and adds CSP meta tags
 * - Generates CSP headers from manifest
 * - Uses filesystem cache to avoid refetching resources between runs
 * - Supports local script/style integrity for enhanced security
 * - Combines multiple manifests from a manifests directory
 */
export class CliProcessor {
	private options: CliOptions & { cspOptions: CSPProcessorOptions };
	private cspProcessor: CSPProcessor;
	private manifest: AssetManifest | null = null;
	private manifestWriter: ManifestWriter;
	private collectedCspBuilder: CspDirectives | null = null;

	constructor(options: CliOptions) {
		const cacheDir = options.cacheDir ?? '.csp-cache';
		const manifestsDir = options.manifestsDir ?? '.csp-manifest';

		// Resolve outputDir to absolute path if it's relative
		// Always resolve relative to the input directory to avoid path issues
		let resolvedOutputDir: string | undefined;
		if (
			options.outputDir !== undefined &&
			options.outputDir !== null &&
			options.outputDir.trim() !== ''
		) {
			if (
				options.outputDir.startsWith('./') ||
				options.outputDir.startsWith('../') ||
				!options.outputDir.startsWith('/')
			) {
				// Relative path - resolve relative to input directory
				// If input directory is '.', resolve relative to current working directory
				if (options.inputDir === '.') {
					resolvedOutputDir = resolve(options.outputDir);
				} else {
					resolvedOutputDir = resolve(options.inputDir, options.outputDir);
				}

				// Debug logging
				log.debug(`Current working directory: ${process.cwd()}`);
				log.debug(`Input directory: ${options.inputDir}`);
				log.debug(`Output directory: ${options.outputDir}`);
				log.debug(`Resolved output directory: ${resolvedOutputDir}`);
			} else {
				// Absolute path - use as is
				resolvedOutputDir = options.outputDir;
			}
		}

		this.options = {
			outputDir: resolvedOutputDir ?? options.inputDir,
			cacheDir,
			manifestsDir,
			processHTML: true,
			generateHeaders: true,
			headersOutput:
				options.generateHeaders !== false
					? (options.headersOutput ?? join(options.inputDir, 'csp-headers.json'))
					: undefined,
			logLevel: options.logLevel ?? 'info', // Default to info level
			...options,
			cspOptions: {
				// When headers generation is disabled, prefer hashes over nonces for better security
				// When headers generation is enabled, use both for maximum compatibility
				enableNonces: options.generateHeaders !== false, // Only enable nonces if headers generation is enabled
				enableHashes: true, // Always enable hashes for HTML processing
				injectMetaTag: true, // Always inject meta tags for HTML processing
				generateHeaders: options.generateHeaders !== false, // Respect the headers generation option
				baseDirectives: {},
				...options.cspOptions,
				externalSources: {
					...options.cspOptions?.externalSources,
					hashing: {
						scripts: true, // Enable hashing for external scripts
						styles: true, // Enable hashing for external styles
						images: true, // Enable hashing for external images
						fonts: true, // Enable hashing for external fonts
						integrity: true, // Add integrity attributes
						fetchExternal: false, // Don't fetch remote resources
						// Advanced options for high-security environments
						localScriptIntegrity: options.localScriptIntegrity ?? false, // Enable integrity for local scripts (advanced use case)
						localStyleIntegrity: true, // Enable integrity for local styles (common use case)
						...options.cspOptions?.externalSources?.hashing,
					},
					resourceManager: {
						...options.cspOptions?.externalSources?.resourceManager,
						// Enable filesystem cache for persistent caching between runs
						filesystemCache: new SimpleFilesystemCache(cacheDir),
					},
				},
			},
		};

		// Set log level
		log.setLevel(this.options.logLevel as log.LogLevelDesc);

		this.cspProcessor = new CSPProcessor(this.options.cspOptions);
		this.manifestWriter = new ManifestWriter(this.options.manifestsDir);
	}

	/**
	 * Load and combine CSP manifests from manifests directory
	 */
	async loadManifest(): Promise<void> {
		try {
			const manifestsDir = this.options.manifestsDir;
			if (manifestsDir === undefined || manifestsDir === null || manifestsDir === '') {
				log.warn('No manifests directory specified');
				return;
			}

			// Read all manifests from the directory
			const manifests = await this.manifestWriter.readManifests();

			if (manifests.length === 0) {
				log.warn(`No manifest files found in ${manifestsDir}`);

				// If auto-manifest is enabled, generate one automatically
				if (this.options.autoManifest === true) {
					await this.generateAutoManifest();
					return;
				}

				return;
			}

			// Only log manifest info in verbose mode or when there are issues
			if (manifests.length > 1) {
				log.info(`Found ${manifests.length} manifest files in ${manifestsDir}`);
			}

			// Create consolidated manifest
			const consolidatedPath = await this.manifestWriter.writeConsolidatedManifest(manifests);

			// Only log consolidation info in verbose mode
			if (manifests.length > 1) {
				log.info(`Created consolidated manifest: ${consolidatedPath}`);
			}

			// Load the consolidated manifest
			const consolidatedContent = await readFile(consolidatedPath, 'utf-8');
			const consolidatedManifest = JSON.parse(consolidatedContent) as ConsolidatedManifest;

			// Convert consolidated manifest to standard AssetManifest format
			this.manifest = {
				buildTool: consolidatedManifest.buildTools.join('+'),
				buildTime: consolidatedManifest.consolidationTime,
				outputDir: consolidatedManifest.outputDirs[0] || this.options.inputDir,
				assets: consolidatedManifest.assets,
				cspProcessorOptions: consolidatedManifest.cspProcessorOptions,
			};

			// Merge manifest's CSP processor options into CLI options
			this.mergeManifestOptions();

			// Only log detailed manifest info in verbose mode
			if (manifests.length > 1) {
				log.info(
					`Loaded consolidated CSP manifest with ${this.manifest.assets.length} total assets from ${manifests.length} build tools`,
				);
			}

			// Copy consolidated manifest to output directory as manifest.json
			// await this.copyManifestToOutput();
		} catch (error) {
			log.warn(`Could not load CSP manifests: ${String(error)}`);

			// If auto-manifest is enabled, try to generate one as fallback
			if (this.options.autoManifest === true) {
				await this.generateAutoManifest();
				return;
			}

			this.manifest = null;
		}
	}

	/**
	 * Merge manifest's CSP processor options into CLI options
	 */
	private mergeManifestOptions(): void {
		if (!this.manifest?.cspProcessorOptions) {
			return;
		}

		// Merge manifest options with CLI options using deep merge
		// This ensures nested objects are properly merged while preserving CLI defaults

		this.options.cspOptions = deepMerge(
			this.options.cspOptions as Record<string, unknown>,
			this.manifest.cspProcessorOptions as Record<string, unknown>,
		) as CSPProcessorOptions;

		// Update generateHeaders flag from manifest if specified
		if (this.manifest.cspProcessorOptions.generateHeaders !== undefined) {
			this.options.generateHeaders = this.manifest.cspProcessorOptions.generateHeaders;
		}

		// Recreate the CSP processor with merged options
		this.cspProcessor = new CSPProcessor(this.options.cspOptions);

		log.debug('Merged manifest CSP options into CLI options');
	}

	/**
	 * Load CSP policies from a JSON file
	 */
	private async loadCspPoliciesFromFile(
		filePath: string,
	): Promise<Partial<CspDirectives> | undefined> {
		try {
			const content = await readFile(filePath, 'utf-8');
			const policies = JSON.parse(content) as unknown;

			// Validate that it has the expected structure
			if (policies !== undefined && typeof policies === 'object') {
				console.log(`Loaded CSP policies from: ${filePath}`);
				return policies as Partial<CspDirectives>;
			}

			console.warn(`Invalid CSP policy file format in: ${filePath}`);
			return undefined;
		} catch (error) {
			console.warn(`Could not load CSP policies from ${filePath}: ${String(error)}`);
			return undefined;
		}
	}

	/**
	 * Automatically generate a manifest by scanning the input directory
	 */
	private async generateAutoManifest(): Promise<void> {
		log.info('No manifest found, generating manifest automatically...');

		try {
			// Create a basic asset tracker for scanning
			const assetTracker = new CommonAssetTracker('cli-auto', {
				trackAssets: true,
				assetTypeDetector: (fileName: string, _source?: string) => {
					const ext = fileName.toLowerCase().split('.').pop();
					switch (ext) {
						case 'js':
						case 'mjs':
						case 'cjs':
							return 'script';
						case 'css':
							return 'style';
						case 'png':
						case 'jpg':
						case 'jpeg':
						case 'gif':
						case 'svg':
						case 'webp':
						case 'avif':
							return 'image';
						case 'woff':
						case 'woff2':
						case 'ttf':
						case 'otf':
						case 'eot':
							return 'font';
						case 'mp4':
						case 'webm':
						case 'ogg':
						case 'mp3':
						case 'wav':
							return 'media';
						case undefined:
							return 'other';
						default:
							return 'other';
					}
				},
			});

			// Scan the input directory for assets
			await this.scanDirectoryForAssets(this.options.inputDir, assetTracker);

			// Generate the manifest
			const manifest = assetTracker.generateManifest(this.options.inputDir);

			// Load CSP policies from file if specified, otherwise use defaults
			let baseDirectives: Partial<CspDirectives> | undefined;

			if (
				this.options.cspPolicyFile !== undefined &&
				this.options.cspPolicyFile !== null &&
				this.options.cspPolicyFile !== ''
			) {
				baseDirectives = await this.loadCspPoliciesFromFile(this.options.cspPolicyFile);
			}

			// Use loaded policies or fall back to defaults
			if (!baseDirectives) {
				baseDirectives = {
					CSP: {
						'script-src': ['self', 'unsafe-inline'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'https:'],
						'font-src': ['self', 'data:', 'https:'],
						'connect-src': ['self'],
					},
				};
			}

			// Set the baseDirectives in the manifest
			manifest.cspProcessorOptions.baseDirectives = baseDirectives;

			this.manifest = manifest;

			// Merge manifest's CSP processor options into CLI options
			this.mergeManifestOptions();

			log.info(`Generated auto-manifest with ${manifest.assets.length} assets`);
		} catch (error) {
			log.warn(`Could not generate auto-manifest: ${String(error)}`);
			this.manifest = null;
		}
	}

	/**
	 * Recursively scan directory for assets (used for auto-manifest generation)
	 */
	private async scanDirectoryForAssets(
		dirPath: string,
		assetTracker: CommonAssetTracker,
	): Promise<void> {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dirPath, entry.name);
				const relativePath = fullPath.replace(this.options.inputDir, '').replace(/^\/+/, '');

				if (entry.isDirectory()) {
					// Skip hidden directories and common asset directories
					if (
						entry.name.startsWith('.') ||
						entry.name === 'node_modules' ||
						entry.name === '.git'
					) {
						continue;
					}
					await this.scanDirectoryForAssets(fullPath, assetTracker);
				} else if (entry.isFile()) {
					// Track the asset
					const ext = entry.name.toLowerCase().split('.').pop() ?? '';
					try {
						// Read file as bytes for hashing (works for both text and binary files)
						const fileBuffer = await readFile(fullPath);
						const source = fileBuffer.toString('utf-8');

						// Generate hash for the asset content (using the raw bytes for accurate hashing)
						const hash = await generateHash(fileBuffer.toString('base64'), 'sha256');

						// For HTML files, use CSPProcessor to discover resources and build a complete manifest
						if (ext === 'html' || ext === 'htm') {
							// Use CSPProcessor to analyze the HTML and discover all resources
							const analysis = await this.cspProcessor.processHTML(source);

							// Add discovered external resources to the asset tracker
							for (const scriptSrc of analysis.analysis.scriptSources) {
								if (
									scriptSrc.src &&
									!scriptSrc.src.startsWith('data:') &&
									!scriptSrc.src.startsWith('blob:')
								) {
									assetTracker.trackAsset({
										id: scriptSrc.src,
										path: scriptSrc.src,
										type: 'script',
										inline: false,
										hash: scriptSrc.hash,
										mimeType: 'application/javascript',
										source: '',
									});
								}
							}

							for (const styleSrc of analysis.analysis.styleSources) {
								if (
									styleSrc.src &&
									!styleSrc.src.startsWith('data:') &&
									!styleSrc.src.startsWith('blob:')
								) {
									assetTracker.trackAsset({
										id: styleSrc.src,
										path: styleSrc.src,
										type: 'style',
										inline: false,
										hash: styleSrc.hash,
										mimeType: 'text/css',
										source: '',
									});
								}
							}

							for (const imgSrc of analysis.analysis.imageSources) {
								if (
									imgSrc.src &&
									!imgSrc.src.startsWith('data:') &&
									!imgSrc.src.startsWith('blob:')
								) {
									assetTracker.trackAsset({
										id: imgSrc.src,
										path: imgSrc.src,
										type: 'image',
										inline: false,
										hash: imgSrc.hash,
										mimeType: 'image/png',
										source: '',
									});
								}
							}
						}

						// Track the main file
						assetTracker.trackAsset({
							id: relativePath,
							path: relativePath,
							type: assetTracker.getOptions().assetTypeDetector(entry.name, source),
							inline: false,
							hash,
							mimeType: this.getMimeType(ext),
							source,
						});
					} catch {
						// Skip files that can't be read
						assetTracker.trackAsset({
							id: relativePath,
							path: relativePath,
							type: assetTracker.getOptions().assetTypeDetector(entry.name),
							inline: false,
							hash: undefined,
							mimeType: this.getMimeType(ext),
							source: '',
						});
					}
				}
			}
		} catch (error) {
			console.warn(`Error scanning directory ${dirPath}:`, error);
		}
	}

	/**
	 * Get MIME type for file extension
	 */
	private getMimeType(ext: string): string {
		const mimeTypes: Record<string, string> = {
			html: 'text/html',
			htm: 'text/html',
			js: 'application/javascript',
			mjs: 'application/javascript',
			cjs: 'application/javascript',
			css: 'text/css',
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			svg: 'image/svg+xml',
			webp: 'image/webp',
			avif: 'image/avif',
			woff: 'font/woff',
			woff2: 'font/woff2',
			ttf: 'font/ttf',
			otf: 'font/otf',
			eot: 'application/vnd.ms-fontobject',
			mp4: 'video/mp4',
			webm: 'video/webm',
			ogg: 'video/ogg',
			mp3: 'audio/mpeg',
			wav: 'audio/wav',
		};
		return mimeTypes[ext] || 'application/octet-stream';
	}

	/**
	 * Copy consolidated manifest to output directory as manifest.json
	 */
	private async copyManifestToOutput(): Promise<void> {
		if (this.manifest === null) {
			return;
		}

		const outputDir = this.options.outputDir;
		if (outputDir === undefined || outputDir === null || outputDir === '') {
			// No output directory, manifest is already in the right place
			return;
		}

		try {
			const outputManifestPath = join(outputDir, 'manifest.json');

			// Ensure the directory exists
			await this.ensureDirectoryExists(outputDir);

			// Write the consolidated manifest to the output directory as manifest.json
			await writeFile(outputManifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
			console.log(`Copied consolidated manifest to output directory: ${outputManifestPath}`);
		} catch (error) {
			console.warn(`Could not copy manifest to output directory: ${String(error)}`);
		}
	}

	/**
	 * Ensure directory exists, creating it if necessary
	 */
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await readdir(dirPath);
		} catch {
			// Directory doesn't exist, create it
			await mkdir(dirPath, { recursive: true });
		}
	}

	/**
	 * Get cache statistics
	 */
	async getCacheStats(): Promise<{
		size: number;
		entries: Array<{ url: string; timestamp: number; sourceType: string }>;
	}> {
		return this.cspProcessor.getCacheStats();
	}

	/**
	 * Clear the resource cache (both memory and filesystem)
	 */
	async clearCache(): Promise<void> {
		await this.cspProcessor.clearCache();
		log.info('Cache cleared successfully');
	}

	/**
	 * Process all files in the input directory
	 */
	async processDirectory(): Promise<void> {
		log.info(`Processing directory: ${this.options.inputDir}`);

		// Always respect the --no-html flag first
		if (this.options.processHTML === false) {
			log.info('HTML processing disabled by --no-html flag');
		}

		// Only process HTML files if we have a valid manifest AND HTML processing is enabled
		if (this.manifest === null && this.options.processHTML === true) {
			log.info('No manifest loaded, skipping HTML processing');
			this.options.processHTML = false;
		}

		const outputDir = this.options.outputDir;
		if (
			outputDir !== undefined &&
			outputDir !== null &&
			outputDir !== '' &&
			outputDir !== this.options.inputDir
		) {
			// Copy and process files to output directory
			await this.copyAndProcessDirectory(this.options.inputDir, outputDir);

			// Copy the generated headers file to output directory only if headers generation is enabled
			if (this.options.generateHeaders === true) {
				try {
					const srcHeadersPath = this.options.headersOutput;
					const destHeadersPath = join(outputDir, 'csp-headers.json');
					if (
						srcHeadersPath !== undefined &&
						srcHeadersPath !== null &&
						srcHeadersPath !== '' &&
						existsSync(srcHeadersPath)
					) {
						await copyFile(srcHeadersPath, destHeadersPath);
						log.debug(`Copied CSP headers to output directory: ${destHeadersPath}`);
					}
				} catch (error) {
					log.warn(`Could not copy CSP headers to output directory: ${String(error)}`);
				}
			}
		} else {
			// Process files in place
			await this.processDirectoryRecursive(this.options.inputDir);
		}

		// Generate CSP headers first if requested
		if (this.options.generateHeaders === true) {
			await this.generateCspHeaders();
		}

		log.info('CSP processing complete');
	}

	/**
	 * Copy and process directory recursively
	 */
	private async copyAndProcessDirectory(srcDir: string, destDir: string): Promise<void> {
		try {
			log.trace(`Copying directory: ${srcDir} -> ${destDir}`);

			// Ensure the destination directory exists
			await this.ensureDirectoryExists(destDir);

			const entries = await readdir(srcDir, { withFileTypes: true });

			// Get the basename of the destination directory to avoid copying it into itself
			const destDirName = firstLengthyString(
				destDir.split('/').pop(),
				destDir.split('\\').pop(),
			);

			for (const entry of entries) {
				const srcPath = join(srcDir, entry.name);
				const destPath = join(destDir, entry.name);

				// Skip generated files that will be copied separately
				if (entry.name === 'manifest.json') {
					continue;
				}
				// Skip headers file if headers generation is disabled
				if (
					this.options.generateHeaders === false &&
					this.options.headersOutput !== undefined &&
					this.options.headersOutput !== null &&
					this.options.headersOutput !== '' &&
					entry.name === this.options.headersOutput
				) {
					continue;
				}

				if (entry.isDirectory()) {
					// Skip manifests directory
					if (entry.name === this.options.manifestsDir) {
						continue;
					}
					// Skip the destination directory itself to prevent infinite recursion
					if (entry.name === destDirName) {
						log.trace(`Skipping destination directory: ${entry.name}`);
						continue;
					}
					// Create destination directory and copy recursively
					await this.ensureDirectoryExists(destPath);
					await this.copyAndProcessDirectory(srcPath, destPath);
				} else if (entry.isFile()) {
					// Copy file to destination
					await copyFile(srcPath, destPath);
					// Process the copied file
					await this.processFile(destPath);
				}
			}
		} catch (error) {
			log.warn(`Error copying directory ${srcDir} to ${destDir}: ${String(error)}`);
		}
	}

	/**
	 * Process directory recursively
	 */
	private async processDirectoryRecursive(dirPath: string): Promise<void> {
		try {
			log.trace(`Processing directory recursively: ${dirPath}`);
			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dirPath, entry.name);

				if (entry.isDirectory()) {
					// Skip manifests directory
					if (entry.name === '.csp-manifest' || entry.name === 'manifests') {
						continue;
					}
					await this.processDirectoryRecursive(fullPath);
				} else if (entry.isFile()) {
					await this.processFile(fullPath);
				}
			}
		} catch (error) {
			log.warn(`Error processing directory ${dirPath}: ${String(error)}`);
		}
	}

	/**
	 * Process individual file
	 */
	private async processFile(filePath: string): Promise<void> {
		const ext = extname(filePath).toLowerCase();

		// Process HTML files if enabled
		if (this.options.processHTML === true && (ext === '.html' || ext === '.htm')) {
			await this.processHTMLFile(filePath);
		}
	}

	/**
	 * Process HTML file and inject CSP
	 */
	private async processHTMLFile(filePath: string): Promise<void> {
		try {
			const html = await readFile(filePath, 'utf-8');

			// Use the CSP processor that has already been configured with merged options
			const processedHtml = await this.cspProcessor.processHTML(html);

			if (this.collectedCspBuilder === null) {
				this.collectedCspBuilder = processedHtml.builder;
			} else {
				this.collectedCspBuilder.CSP = deepMerge(
					this.collectedCspBuilder.CSP as Record<string, unknown>,
					processedHtml.builder.CSP as Record<string, unknown>,
				);
			}

			const processedHtmlContent = processedHtml.html;
			if (
				processedHtmlContent !== undefined &&
				processedHtmlContent !== null &&
				processedHtmlContent !== '' &&
				processedHtmlContent !== html
			) {
				await writeFile(filePath, processedHtmlContent, 'utf-8');
				log.debug(`Processed HTML file: ${filePath}`);
			}
		} catch (error) {
			log.warn(`Error processing HTML file ${filePath}: ${String(error)}`);
		}
	}

	/**
	 * Generate CSP headers file
	 */
	private async generateCspHeaders(): Promise<void> {
		if (this.manifest === null) {
			log.warn('No manifest loaded, skipping headers generation');
			return;
		}

		try {
			const headersOutput = this.options.headersOutput;
			if (headersOutput === undefined || headersOutput === null || headersOutput === '') {
				log.warn('No headers output path specified');
				return;
			}

			await writeFile(
				headersOutput,
				JSON.stringify(this.collectedCspBuilder?.getHeaders(), null, 2),
				'utf-8',
			);
			log.info(`Generated CSP headers: ${headersOutput}`);
		} catch (error) {
			log.warn(`Error generating CSP headers: ${String(error)}`);
		}
	}

	/**
	 * Cleanup resources
	 */
	cleanup(): void {
		this.manifest = null;
	}

	/**
	 * Clean up old manifest files
	 */
	async cleanupManifests(): Promise<void> {
		try {
			console.log('Cleaning up old manifest files...');
			await this.manifestWriter.cleanupOldManifests();
			console.log('Manifest cleanup completed successfully');
		} catch (error) {
			console.error('Failed to cleanup manifests:', error);
		}
	}
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`
CSP Post-Build Processor

Usage: csp-process [options] <input-directory>

Options:
  --output-dir <dir>        Output directory for processed files
  --manifests-dir <dir>     Directory containing CSP manifest files (default: .csp-manifest)
  --cache-dir <dir>         Cache directory for filesystem cache (default: .csp-cache)
  --no-html                 Skip HTML file processing
  --no-headers              Skip CSP headers generation
  --headers-output <file>   Output file for CSP headers (default: csp-headers.json)
  --local-script-integrity  Enable integrity attributes for local scripts (advanced security)
  --auto-manifest           Automatically generate manifest if none found
  --csp-policy-file <file>  JSON file containing CSP policies for auto-manifest
  --log-level <level>       Set log level: trace, debug, info, warn, error, or silent (default: info)
  --cache-stats             Show cache statistics
  --clear-cache             Clear the resource cache
  --cleanup-manifests      Manually clean up old manifest files
  --help, -h                Show this help message

Examples:
  csp-process dist/
  csp-process --output-dir dist-csp/ dist/
  csp-process --manifests-dir .csp-manifest dist/
  csp-process --auto-manifest dist/
  csp-process --auto-manifest --csp-policy-file policies.json dist/
  csp-process --log-level silent dist/
  csp-process --cache-stats dist/
  csp-process --clear-cache dist/
  csp-process --cleanup-manifests dist/
`);
		return;
	}

	const inputDir = args[args.length - 1];

	// Parse options
	const options: CliOptions = {
		inputDir,
		processHTML: !args.includes('--no-html'),
		generateHeaders: !args.includes('--no-headers'),
		localScriptIntegrity: args.includes('--local-script-integrity'),
		autoManifest: args.includes('--auto-manifest'),
	};

	// Parse other options
	for (let i = 0; i < args.length - 1; i++) {
		const arg = args[i];
		const nextArg = args[i + 1];

		switch (arg) {
			case '--output-dir':
				if (nextArg) {
					options.outputDir = nextArg;
					i++;
				}
				break;
			case '--manifests-dir':
				if (nextArg) {
					options.manifestsDir = nextArg;
					i++;
				}
				break;
			case '--headers-output':
				if (nextArg) {
					options.headersOutput = nextArg;
					i++;
				}
				break;
			case '--cache-dir':
				if (nextArg) {
					options.cacheDir = nextArg;
					i++;
				}
				break;
			case '--csp-policy-file':
				if (nextArg) {
					options.cspPolicyFile = nextArg;
					i++;
				}
				break;
			case '--log-level':
				if (nextArg) {
					options.logLevel = nextArg;
					i++;
				}
				break;
		}
	}

	// Find the actual input directory (last non-flag argument)
	let actualInputDir = inputDir;
	for (let i = args.length - 1; i >= 0; i--) {
		const arg = args[i];
		// Skip if this is a flag or a value for a flag
		if (
			arg.startsWith('-') ||
			arg === '--no-html' ||
			arg === '--no-headers' ||
			(i > 0 &&
				(args[i - 1] === '--output-dir' ||
					args[i - 1] === '--manifests-dir' ||
					args[i - 1] === '--headers-output' ||
					args[i - 1] === '--csp-policy-file' ||
					args[i - 1] === '--log-level'))
		) {
			continue;
		}
		actualInputDir = arg;
		break;
	}
	options.inputDir = actualInputDir;

	try {
		const processor = new CliProcessor(options);

		// Handle cache management commands
		if (args.includes('--cache-stats')) {
			const stats = await processor.getCacheStats();
			console.log(`Cache Statistics:`);
			console.log(`  Total entries: ${stats.size}`);
			console.log(`  Memory entries: ${stats.entries.length}`);
			console.log(`  Filesystem entries: ${stats.size - stats.entries.length}`);
			if (stats.entries.length > 0) {
				console.log(`  Sample entries:`);
				stats.entries.slice(0, 5).forEach((entry) => {
					const date = new Date(entry.timestamp).toISOString();
					console.log(`    ${entry.url} (${entry.sourceType}) - ${date}`);
				});
			}
			return;
		}

		if (args.includes('--clear-cache')) {
			await processor.clearCache();
			return;
		}

		if (args.includes('--cleanup-manifests')) {
			await processor.cleanupManifests();
			return;
		}

		// Normal processing
		await processor.loadManifest();
		await processor.processDirectory();
		processor.cleanup();
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
}

// Run CLI if this file is executed directly
if (import.meta.url.endsWith('cli.mjs') || import.meta.url.endsWith('cli.ts')) {
	main().catch(console.error);
}
