#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	getAdapter,
	mergeStaticHeaders,
	mergeStructuredStaticHeaders,
	parseAdapterIds,
	type AdapterId,
	type StaticHeaderArtifact,
	type StructuredHeaderOwnership,
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

interface CliOptions {
	/** Input directory containing built assets */
	inputDir: string;
	/** Output directory for processed assets */
	outputDir?: string;
	/** Directory holding platform project configuration */
	projectDir?: string;
	/** Public URL prefix for the static output. */
	base?: string;
	/** Cache directory for filesystem cache */
	cacheDir?: string;
	/** CSP manifests directory path */
	manifestsDir?: string;
	/** CSP processor options */
	cspOptions?: CSPProcessorOptions;
	/** Whether to process HTML files */
	processHTML?: boolean;
	/** Replace an existing enforcing meta policy. */
	replaceExisting?: boolean;
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

	/** Load policy options only from manifests that describe this publish input. */
	async loadManifest(): Promise<void> {
		const manifestsDir = resolve(this.options.manifestsDir ?? '.csp-manifest');
		const matches = (await this.manifestWriter.readManifests()).filter(
			(manifest) =>
				resolve(dirname(manifestsDir), manifest.outputPath ?? manifest.outputDir) ===
				this.options.inputDir,
		);
		if (matches.length === 0) {
			log.debug(`No manifest for ${this.options.inputDir} in ${manifestsDir}`);
			if (this.options.autoManifest) await this.generateAutoManifest();
			return;
		}

		const configured = matches.filter(
			(manifest) => Object.keys(manifest.cspProcessorOptions).length > 0,
		);
		const selected = configured[0] ?? matches[0];
		if (
			configured.some(
				(manifest) =>
					JSON.stringify(manifest.cspProcessorOptions) !==
					JSON.stringify(selected.cspProcessorOptions),
			)
		) {
			throw new Error(
				'Several manifests for this build define different CSP options. Select a specific --manifests-dir.',
			);
		}
		this.manifest = selected;
		this.mergeManifestOptions();
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
		const base = await this.resolvePublicBase(files);
		if (inputDir !== outputDir) {
			await this.checkPublishDirectory(outputDir, files);
		}

		const pages = new Map<string, string>();
		for (const [dest, source] of files) {
			if ((processHTML !== false || collectHeaders) && /\.html?$/i.test(source)) {
				const html = await this.processHTMLFile(
					source,
					base,
					processHTML !== false,
					collectHeaders,
				);
				if (html !== undefined) pages.set(dest, html);
			}
		}
		const artifacts = collectHeaders
			? await this.planHeaderOutputs(files)
			: new Map<string, string>();
		for (const path of artifacts.keys()) {
			if (
				pages.has(path) ||
				(files.has(path) && path === this.options.headersOutput && !path.endsWith('.json'))
			) {
				throw new Error(`CSP output would overwrite an input file: ${path}`);
			}
		}
		await this.checkWriteDestinations([
			...artifacts.keys(),
			...pages.keys(),
			...Array.from(files)
				.filter(([dest, source]) => dest !== source)
				.map(([dest]) => dest),
		]);
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
				source === join(this.options.inputDir, 'csp-headers.json') ||
				source === join(this.options.inputDir, '.csp-headers-state.json') ||
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

	private async resolvePublicBase(files: ReadonlyMap<string, string>): Promise<string> {
		const explicit = this.options.base ?? this.manifest?.publicBase;
		if (explicit !== undefined) {
			if (!explicit.startsWith('/') || explicit.startsWith('//') || /[?#\\]/.test(explicit)) {
				throw new Error('The deployment base must be a URL path such as / or /site/.');
			}
			return staticHtmlPath('', explicit.endsWith('/') ? explicit : explicit + '/');
		}
		const artifact = join(this.options.inputDir, 'csp-headers.json');
		if (!existsSync(artifact)) return '/';
		const previous: unknown = JSON.parse(await readFile(artifact, 'utf8'));
		if (!previous || typeof previous !== 'object' || !('routes' in previous)) return '/';
		if (
			!previous.routes ||
			typeof previous.routes !== 'object' ||
			Array.isArray(previous.routes)
		) {
			throw new Error('Existing csp-headers.json contains a malformed route map.');
		}
		const paths = [...files.values()]
			.filter((file) => /\.html?$/i.test(file))
			.map((file) => staticHtmlPath(relative(this.options.inputDir, file).split(sep).join('/')));
		const savedPaths = new Set(Object.keys(previous.routes));
		const candidates = new Set<string>();
		for (const path of savedPaths) {
			for (const page of paths) {
				if (path.endsWith(page)) candidates.add(path.slice(0, -page.length) + '/');
			}
		}
		const matches = [...candidates]
			.map((prefix) => ({
				prefix,
				count: paths.filter((page) => savedPaths.has(prefix.slice(0, -1) + page)).length,
			}))
			.toSorted(
				(left, right) => right.count - left.count || left.prefix.length - right.prefix.length,
			);
		const best = matches[0];
		if (
			best &&
			matches.every(({ count, prefix }) => count < best.count || prefix.startsWith(best.prefix))
		) {
			return best.prefix;
		}
		throw new Error(
			'Could not infer a deployment base from the existing CSP route map. Set --base explicitly.',
		);
	}

	private async checkWriteDestinations(paths: Iterable<string>): Promise<void> {
		const checkedDirectories = new Set<string>();
		const destinations = new Set(paths);
		for (const path of destinations) {
			if (existsSync(path) && !(await lstat(path)).isFile()) {
				throw new Error(`Cannot write to ${path}. The destination must be a regular file.`);
			}
			let parent = dirname(path);
			while (!checkedDirectories.has(parent)) {
				checkedDirectories.add(parent);
				if (destinations.has(parent)) {
					throw new Error(
						`Cannot generate both a file at ${parent} and another file inside it.`,
					);
				}
				if (existsSync(parent)) {
					if (!(await lstat(parent)).isDirectory())
						throw new Error(`Cannot write to ${path}. ${parent} is not a directory.`);
					break;
				}
				parent = dirname(parent);
			}
		}
	}

	private async processHTMLFile(
		source: string,
		base: string,
		writeHtml: boolean,
		collectHeaders: boolean,
	): Promise<string | undefined> {
		const inputDir = this.options.inputDir;
		const sourceRoot = await realpath(inputDir);
		const path = staticHtmlPath(relative(inputDir, source).split(sep).join('/'), base);
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
				metaTagOptions: {
					...this.options.cspOptions.metaTagOptions,
					replaceExisting:
						writeHtml &&
						(this.options.replaceExisting ??
							this.options.cspOptions.metaTagOptions?.replaceExisting) === true,
				},
			},
			async (assetPath) => {
				try {
					if (!assetPath.startsWith(base)) return undefined;
					const asset = await realpath(
						resolve(sourceRoot, './' + decodeURIComponent(assetPath.slice(base.length))),
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
			'cli',
			Boolean(this.options.cspPolicyFile),
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
						Record<AdapterId, StructuredHeaderOwnership | StaticHeaderArtifact>
					>)
				: {};
		const next = { ...previous };
		if (headersOutput && (generateHeaders !== false || emit.includes('json'))) {
			const generatedInput =
				headersOutput === join(outputDir, 'csp-headers.json')
					? join(this.options.inputDir, 'csp-headers.json')
					: files.get(headersOutput);
			const existing = existsSync(headersOutput) ? headersOutput : generatedInput;
			const config = existing && existsSync(existing) ? await readFile(existing, 'utf8') : '';
			writes.set(headersOutput, mergeStaticHeaders('json', config, headers));
		}
		for (const id of emit) {
			if (id === 'json' || (id === 'netlify' && emit.includes('cloudflare-pages'))) continue;
			const adapter = getAdapter(id);
			const base = id === 'vercel' || id === 'firebase' ? (projectDir ?? outputDir) : outputDir;
			const dest = join(base, adapter.fileName);
			if (writes.has(dest)) {
				throw new Error(`Two generated outputs are configured for ${dest}`);
			}
			const source = files.get(dest);
			const fromInput = source && source !== dest ? await readFile(source, 'utf8') : '';
			const onDisk = existsSync(dest) ? await readFile(dest, 'utf8') : '';
			if (
				fromInput.trim() &&
				onDisk.trim() &&
				!onDisk
					.replace(/\r\n/g, '\n')
					.trim()
					.startsWith(fromInput.replace(/\r\n/g, '\n').trim())
			) {
				throw new Error(
					`Both ${source} and ${dest} contain different configuration. Reconcile them before generating headers.`,
				);
			}
			const existing = onDisk || fromInput;
			try {
				if (id === 'vercel' || id === 'firebase') {
					const result = mergeStructuredStaticHeaders(
						id,
						existing,
						headers,
						{
							publicDir: relative(base, outputDir).split(sep).join('/') || '.',
						},
						previous[id],
					);
					writes.set(dest, result.body);
					next[id] = result.ownership;
				} else {
					writes.set(dest, mergeStaticHeaders(id, existing, headers));
				}
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
  --base <path>             Deploy URL prefix (for example /site/)
  --project-dir <dir>       Directory containing vercel.json or firebase.json (default: cwd)
  --manifests-dir <dir>     Directory containing CSP manifest files (default: .csp-manifest)
  --cache-dir <dir>         Cache directory for filesystem cache (default: .csp-cache)
  --no-html                 Analyze HTML without rewriting it
  --replace-existing        Replace an authored or Vite-generated CSP meta policy
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
		base: 'base',
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
			else if (name === 'replace-existing') options.replaceExisting = true;
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
	if (options.processHTML === false && (options.localScriptIntegrity || options.replaceExisting)) {
		throw new Error(
			'--no-html cannot be combined with --local-script-integrity or --replace-existing.',
		);
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
