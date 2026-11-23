#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	getAdapter,
	mergeStaticHeaders,
	parseAdapterIds,
	type AdapterId,
	type StaticHeaderArtifact,
} from '@csp-plugins/adapters';
import { SimpleFilesystemCache } from '@csp-plugins/basic-fscache';
import type { CSPProcessorOptions } from '@csp-plugins/core';
import { CSPProcessor, deepMerge, generateHash } from '@csp-plugins/core';
import { processStaticHtml, staticHeaders, staticHtmlPath } from '@csp-plugins/shared';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { AssetManifest } from '@csp-plugins/shared/types';
import type { CspDirectiveHeaders, CspDirectives } from '@csp-plugins/typed-directives';
import log from 'loglevel';

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
	/** Directory holding platform project configuration */
	projectDir?: string;
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
	/** Header adapters to emit (`netlify,vercel`, …) */
	emit?: AdapterId[];
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
	private options: CliOptions & { cspOptions: CSPProcessorOptions; outputDir: string };
	private cspProcessor: CSPProcessor;
	private manifest: AssetManifest | null = null;
	private manifestWriter: ManifestWriter;
	private pageHeaders = new Map<string, CspDirectiveHeaders>();

	constructor(options: CliOptions) {
		const cacheDir = options.cacheDir ?? '.csp-cache';
		const manifestsDir = options.manifestsDir ?? '.csp-manifest';

		const inputDir = resolve(options.inputDir);
		const outputDir = options.outputDir ? resolve(options.outputDir) : inputDir;

		this.options = {
			processHTML: true,
			generateHeaders: true,
			logLevel: 'info',
			...options,
			inputDir,
			outputDir,
			cacheDir,
			manifestsDir,
			projectDir: resolve(options.projectDir ?? '.'),
			headersOutput: resolve(options.headersOutput ?? join(outputDir, 'csp-headers.json')),
			cspOptions: {
				enableHashes: true,
				baseDirectives: {},
				...options.cspOptions,
				externalSources: {
					...options.cspOptions?.externalSources,
					hashing: {
						scripts: true,
						styles: true,
						integrity: true,
						localScriptIntegrity: options.localScriptIntegrity ?? false,
						localStyleIntegrity: true,
						...options.cspOptions?.externalSources?.hashing,
					},
					resourceManager: {
						...options.cspOptions?.externalSources?.resourceManager,
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

		// Recreate the CSP processor with merged options
		this.cspProcessor = new CSPProcessor(this.options.cspOptions);

		log.debug('Merged manifest CSP options into CLI options');
	}

	private async applyPolicyFile(): Promise<void> {
		const file = this.options.cspPolicyFile;
		if (!file) return;
		const policy: unknown = JSON.parse(await readFile(file, 'utf8'));
		if (!policy || Array.isArray(policy) || typeof policy !== 'object') {
			throw new Error(`Expected a CSP policy object in ${file}`);
		}
		const base =
			'CSP' in policy ||
			'ReportTo' in policy ||
			'ReportOnly' in policy ||
			'ReferrerHeader' in policy
				? policy
				: { CSP: policy };
		if ('CSP' in base && (!base.CSP || Array.isArray(base.CSP) || typeof base.CSP !== 'object')) {
			throw new Error(`Expected CSP directives in ${file}`);
		}
		this.options.cspOptions.baseDirectives = base as Partial<CspDirectives>;
	}

	/** Auto-discover assets when requested, without guessing script or style sources. */
	private async generateAutoManifest(): Promise<void> {
		const tracker = new CommonAssetTracker('cli-auto');
		const root = this.options.inputDir;
		const scan = async (directory: string): Promise<void> => {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const path = join(directory, entry.name);
				if (path === this.options.outputDir && path !== root) continue;
				if (
					entry.isDirectory() &&
					!entry.name.startsWith('.') &&
					entry.name !== 'node_modules'
				) {
					await scan(path);
				} else if (
					entry.isFile() &&
					!entry.name.startsWith('.') &&
					entry.name !== 'csp-headers.json'
				) {
					const name = relative(root, path).split(sep).join('/');
					tracker.trackAsset({
						id: name,
						path: name,
						type: tracker.getOptions().assetTypeDetector(name),
						inline: false,
						hash: await generateHash(await readFile(path), 'sha256'),
					});
				}
			}
		};
		await scan(root);
		this.manifest = await tracker.generateManifest(root);
		log.info(`Generated auto-manifest with ${this.manifest.assets.length} assets`);
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
		const { inputDir, outputDir, processHTML, generateHeaders, emit = [] } = this.options;
		log.info(`Processing directory: ${inputDir}`);
		this.pageHeaders.clear();
		await this.applyPolicyFile();
		const collectHeaders = generateHeaders !== false || emit.length > 0;
		const files = new Map<string, string>();
		await this.collectFiles(inputDir, outputDir, files);
		if (inputDir !== outputDir) {
			await this.checkPublishDirectory(outputDir, files);
		}

		const pages = new Map<string, string>();
		for (const [dest, source] of files) {
			if ((processHTML !== false || collectHeaders) && /\.html?$/i.test(source)) {
				const html = await this.processHTMLFile(source, processHTML !== false, collectHeaders);
				if (html !== undefined) pages.set(dest, html);
			}
		}
		const artifacts = collectHeaders
			? await this.planHeaderOutputs(files)
			: new Map<string, string>();
		for (const path of artifacts.keys()) {
			if (pages.has(path) || (files.has(path) && path === this.options.headersOutput)) {
				throw new Error(`CSP output would overwrite an input file: ${path}`);
			}
		}
		if (inputDir !== outputDir) await mkdir(outputDir, { recursive: true });
		for (const [dest, source] of files) {
			if (dest !== source && !pages.has(dest) && !artifacts.has(dest)) {
				await mkdir(dirname(dest), { recursive: true });
				await copyFile(source, dest);
			}
		}
		for (const [path, body] of [...pages, ...artifacts]) {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, body, 'utf8');
		}
		for (const path of artifacts.keys()) log.info(`Generated CSP headers: ${path}`);
		log.info('CSP processing complete');
	}

	private async collectFiles(
		input: string,
		output: string,
		files: Map<string, string>,
	): Promise<void> {
		for (const entry of await readdir(input, { withFileTypes: true })) {
			const source = join(input, entry.name);
			const dest = join(output, entry.name);
			if (
				(source === this.options.outputDir && input !== output) ||
				entry.name === 'csp-headers.json' ||
				entry.name === '.csp-headers-state.json' ||
				entry.name === '.csp-manifest' ||
				entry.name === '.csp-cache' ||
				entry.name === 'node_modules' ||
				entry.name === '.git'
			)
				continue;

			if (entry.isDirectory()) await this.collectFiles(source, dest, files);
			else if (entry.isFile()) files.set(dest, source);
		}
	}

	private async checkPublishDirectory(
		output: string,
		files: ReadonlyMap<string, string>,
	): Promise<void> {
		if (!existsSync(output)) return;
		for (const entry of await readdir(output, { withFileTypes: true })) {
			const path = join(output, entry.name);
			if (entry.isDirectory()) await this.checkPublishDirectory(path, files);
			else if (/\.html?$/i.test(entry.name) && !files.has(path)) {
				throw new Error(
					`The publish directory contains an old HTML page (${path}). Use a clean output directory.`,
				);
			}
		}
	}

	private async processHTMLFile(
		source: string,
		writeHtml: boolean,
		collectHeaders: boolean,
	): Promise<string | undefined> {
		const inputDir = this.options.inputDir;
		const sourceRoot = await realpath(inputDir);
		const path = staticHtmlPath(relative(inputDir, source).split(sep).join('/'));
		const html = await readFile(source, 'utf8');
		const result = await processStaticHtml(
			html,
			path,
			{
				...this.options.cspOptions,
				generateHeaders: collectHeaders,
				externalSources: writeHtml
					? this.options.cspOptions.externalSources
					: { hashing: { scripts: false, styles: false } },
				injectMetaTag: writeHtml && this.options.cspOptions.injectMetaTag !== false,
			},
			async (assetPath) => {
				try {
					const asset = await realpath(
						resolve(sourceRoot, '.' + decodeURIComponent(assetPath)),
					);
					const contained = relative(sourceRoot, asset);
					if (contained === '..' || contained.startsWith('..' + sep) || isAbsolute(contained))
						return undefined;
					return await readFile(asset);
				} catch (error) {
					if (error instanceof URIError || (error as NodeJS.ErrnoException).code === 'ENOENT')
						return undefined;
					throw error;
				}
			},
		);
		if (collectHeaders && 'Content-Security-Policy' in result.headers)
			this.pageHeaders.set(path, result.headers);
		return writeHtml ? (result.html ?? html) : undefined;
	}

	private async planHeaderOutputs(
		files: ReadonlyMap<string, string>,
	): Promise<Map<string, string>> {
		const { emit = [], generateHeaders, headersOutput, outputDir, projectDir } = this.options;
		const headers = staticHeaders(this.pageHeaders);
		const writes = new Map<string, string>();
		if (headers === undefined) {
			if (emit.length > 0 || (headersOutput && existsSync(headersOutput)))
				throw new Error(
					'No HTML pages found. Header adapters require a static build directory.',
				);
			return writes;
		}
		const statePath = join(projectDir ?? outputDir, '.csp-headers-state.json');
		const remember = emit.some((id) => id === 'vercel' || id === 'firebase');
		const previous =
			remember && existsSync(statePath)
				? (JSON.parse(await readFile(statePath, 'utf8')) as Partial<
						Record<AdapterId, StaticHeaderArtifact>
					>)
				: {};
		const next = { ...previous };
		if (headersOutput && (generateHeaders !== false || emit.includes('json'))) {
			writes.set(headersOutput, `${JSON.stringify(headers, null, 2)}\n`);
		}
		for (const id of emit) {
			if (id === 'json' || (id === 'netlify' && emit.includes('cloudflare-pages'))) continue;
			const adapter = getAdapter(id);
			const base = id === 'vercel' || id === 'firebase' ? (projectDir ?? outputDir) : outputDir;
			const dest = join(base, adapter.fileName);
			if (writes.has(dest)) {
				throw new Error(`Two generated outputs are configured for ${dest}`);
			}
			const source = files.get(dest) ?? dest;
			const existing = existsSync(source) ? await readFile(source, 'utf8') : '';
			try {
				writes.set(
					dest,
					mergeStaticHeaders(
						id,
						existing,
						headers,
						{
							publicDir: relative(base, outputDir).split(sep).join('/') || '.',
						},
						previous[id],
					),
				);
				if (id === 'vercel' || id === 'firebase') next[id] = headers;
			} catch (error) {
				throw new Error(`Cannot generate ${id} headers in ${dest}: ${String(error)}`);
			}
		}
		if (remember && writes.has(statePath))
			throw new Error(`Two generated outputs are configured for ${statePath}`);
		if (remember) writes.set(statePath, `${JSON.stringify(next, null, 2)}\n`);
		return writes;
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

Usage: csp-cli [options] <input-directory>

Options:
  --output-dir <dir>        Output directory for processed files
  --project-dir <dir>       Directory containing vercel.json or firebase.json (default: cwd)
  --manifests-dir <dir>     Directory containing CSP manifest files (default: .csp-manifest)
  --cache-dir <dir>         Cache directory for filesystem cache (default: .csp-cache)
  --no-html                 Skip HTML file processing
  --no-headers              Skip CSP headers generation
  --headers-output <file>   Output file for CSP headers (default: csp-headers.json)
  --local-script-integrity  Enable integrity attributes for local scripts (advanced security)
  --auto-manifest           Automatically generate manifest if none found
  --csp-policy-file <file>  JSON file containing CSP policies for auto-manifest
  --emit <adapters>         Write host files: json,netlify,cloudflare-pages,vercel,firebase,nginx,apache,caddy,express
  --log-level <level>       Set log level: trace, debug, info, warn, error, or silent (default: info)
  --cache-stats             Show cache statistics
  --clear-cache             Clear the resource cache
  --cleanup-manifests      Manually clean up old manifest files
  --help, -h                Show this help message

Examples:
  csp-cli dist/
  csp-cli --output-dir dist-csp/ dist/
  csp-cli --manifests-dir .csp-manifest dist/
  csp-cli --auto-manifest dist/
  csp-cli --auto-manifest --csp-policy-file policies.json dist/
  csp-cli --emit netlify,vercel dist/
  csp-cli --log-level silent dist/
  csp-cli --cache-stats dist/
  csp-cli --clear-cache dist/
  csp-cli --cleanup-manifests dist/
`);
		return;
	}

	const valueOptions = {
		'output-dir': 'outputDir',
		'project-dir': 'projectDir',
		'manifests-dir': 'manifestsDir',
		'headers-output': 'headersOutput',
		'cache-dir': 'cacheDir',
		'csp-policy-file': 'cspPolicyFile',
		'log-level': 'logLevel',
	} as const;
	const options: CliOptions = {
		inputDir: '',
		processHTML: true,
		generateHeaders: true,
	};
	const actions = new Set<string>();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const name = arg.slice(2);
			if (name === 'emit' || Object.hasOwn(valueOptions, name)) {
				const value = args[++i];
				if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
				if (name === 'emit') options.emit = parseAdapterIds(value);
				else options[valueOptions[name as keyof typeof valueOptions]] = value;
			} else if (name === 'no-html') options.processHTML = false;
			else if (name === 'no-headers') options.generateHeaders = false;
			else if (name === 'local-script-integrity' || name === 'integrity')
				options.localScriptIntegrity = true;
			else if (name === 'verbose') options.logLevel = 'debug';
			else if (name === 'auto-manifest') options.autoManifest = true;
			else if (['cache-stats', 'clear-cache', 'cleanup-manifests'].includes(name))
				actions.add(arg);
			else throw new Error(`Unknown option: ${arg}`);
		} else {
			if (arg.startsWith('-') || options.inputDir)
				throw new Error(`Unexpected argument: ${arg}`);
			options.inputDir = arg;
		}
	}
	if (!options.inputDir) {
		if (actions.size === 0) throw new Error('Specify the static build directory to process.');
		options.inputDir = '.';
	}

	try {
		const processor = new CliProcessor(options);

		// Handle cache management commands
		if (actions.has('--cache-stats')) {
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

		if (actions.has('--clear-cache')) {
			await processor.clearCache();
			return;
		}

		if (actions.has('--cleanup-manifests')) {
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
if (
	process.argv[1] &&
	(await realpath(process.argv[1]).catch(() => undefined)) === fileURLToPath(import.meta.url)
) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
