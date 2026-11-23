import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { CSPProcessor, generateHash } from '@csp-plugins/core';
import { processStaticHtml, staticHeaders, staticHtmlPath } from '@csp-plugins/shared';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';
import type { Plugin, ResolvedConfig } from 'vite';

const DEFAULT_HEADERS_FILE = 'csp-headers.json';
const HTML_EXT = /\.html?$/i;

async function publicAssets(
	root: string,
	base: string,
): Promise<Map<string, { name: string; path: string }>> {
	const files = new Map<string, { name: string; path: string }>();
	const ancestors = new Set<string>();
	const scan = async (directory: string): Promise<void> => {
		const target = await realpath(directory);
		if (ancestors.has(target))
			throw new Error(`Circular Vite public directory link at ${directory}`);
		ancestors.add(target);
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = resolve(directory, entry.name);
			const kind = entry.isSymbolicLink() ? await stat(path) : entry;
			if (kind.isDirectory()) await scan(path);
			else if (kind.isFile()) {
				const name = relative(root, path).split(sep).join('/');
				files.set(staticHtmlPath(name, base), { name, path });
			}
		}
		ancestors.delete(target);
	};
	await scan(root);
	return files;
}

export default function cspVitePlugin(options: CspPluginOptions = {}): Plugin {
	const settings = new CommonAssetTracker('vite', options).getOptions();
	const devOptions = { ...settings.cspProcessorOptions, ...settings.devCspProcessorOptions };
	const devProcessor = new CSPProcessor({
		...devOptions,
		developmentMode: true,
		enableNonces: false,
	});
	let config: ResolvedConfig;
	const verification = new Map<string, Map<string, string | Uint8Array>>();

	return {
		name: 'csp-vite',
		enforce: 'post',
		configResolved(resolved) {
			config = resolved;
		},
		transformIndexHtml: {
			order: 'post',
			async handler(html, context) {
				if (!context.server || !settings.devServer || !settings.generateCsp) return html;
				const document = devProcessor.parseHTML(html);
				if (
					devOptions.metaTagOptions?.replaceExisting !== true &&
					devProcessor.getMetaPoliciesToPreserve(document, 'vite').length > 0
				)
					return html;
				return (await devProcessor.processDOM(document)).html ?? html;
			},
		},
		generateBundle: {
			order: 'post',
			async handler(output, bundle, isWrite) {
				const outputPath = output.dir ?? resolve(config.root, config.build.outDir);
				const expected = new Map<string, string | Uint8Array>();
				const base = config.base === './' || config.base === '' ? '/' : config.base;
				const files = Object.values(bundle);
				const publicFiles =
					config.build.copyPublicDir && config.publicDir && existsSync(config.publicDir)
						? await publicAssets(config.publicDir, base)
						: new Map<string, { name: string; path: string }>();
				const assets = new Map(
					files.map((file) => [staticHtmlPath(file.fileName, base), file]),
				);
				const pageHeaders = new Map<string, CspDirectiveHeaders>();

				if (settings.generateCsp && this.environment.config.consumer === 'client') {
					for (const file of files) {
						if (file.type !== 'asset' || !HTML_EXT.test(file.fileName)) continue;
						const path = staticHtmlPath(file.fileName, base);
						const html =
							typeof file.source === 'string'
								? file.source
								: new TextDecoder().decode(file.source);
						const result = await processStaticHtml(
							html,
							path,
							settings.cspProcessorOptions,
							async (assetPath) => {
								const asset = assets.get(assetPath);
								const copied = publicFiles.get(assetPath);
								const bytes =
									asset?.type === 'chunk'
										? asset.code
										: (asset?.source ??
											(copied ? await readFile(copied.path) : undefined));
								const name = asset?.fileName ?? copied?.name;
								if (bytes !== undefined && name !== undefined) expected.set(name, bytes);
								return bytes;
							},
							{
								owner: 'vite',
								rejectPreservedPolicy:
									Object.keys(settings.cspProcessorOptions.baseDirectives?.CSP ?? {})
										.length > 0,
							},
						);
						file.source = result.html ?? html;
						expected.set(file.fileName, file.source);
						if ('Content-Security-Policy' in result.headers)
							pageHeaders.set(path, result.headers);
					}
				}

				const headers = staticHeaders(pageHeaders);
				if (settings.emitHeadersFile !== false && headers !== undefined) {
					const fileName =
						settings.emitHeadersFile === true
							? DEFAULT_HEADERS_FILE
							: settings.emitHeadersFile;
					const source = `${JSON.stringify(headers, null, 2)}\n`;
					const destination = resolve(outputPath, fileName);
					if (
						files.some((file) => resolve(outputPath, file.fileName) === destination) ||
						[...publicFiles.values()].some(
							(file) => resolve(outputPath, file.name) === destination,
						)
					)
						this.error(`CSP header output conflicts with ${fileName}`);
					if (isAbsolute(fileName)) {
						if (isWrite) {
							await mkdir(dirname(fileName), { recursive: true });
							await writeFile(fileName, source, 'utf8');
						}
					} else {
						this.emitFile({ type: 'asset', fileName, source });
					}
					expected.set(relative(outputPath, destination), source);
				}

				if (isWrite) verification.set(outputPath, expected);
				if (!settings.trackAssets || !isWrite) return;
				const tracker = new CommonAssetTracker('vite', options);
				for (const file of files) {
					const content = file.type === 'chunk' ? file.code : file.source;
					expected.set(file.fileName, content);
					const source = typeof content === 'string' ? content : undefined;
					tracker.trackAsset({
						id: file.fileName,
						path: file.fileName,
						type:
							file.type === 'chunk'
								? 'script'
								: settings.assetTypeDetector(file.fileName, source),
						inline: false,
						source,
						hash:
							typeof content === 'string'
								? undefined
								: await generateHash(content, 'sha256'),
					});
				}
				for (const [path, file] of publicFiles) {
					if (assets.has(path)) continue;
					const contents = await readFile(file.path);
					expected.set(file.name, contents);
					tracker.trackAsset({
						id: file.name,
						path: file.name,
						type: settings.assetTypeDetector(file.name),
						inline: false,
						hash: await generateHash(contents, 'sha256'),
					});
				}

				const writer = new ManifestWriter(resolve(config.root, settings.manifestDir));
				const manifest = await tracker.generateManifest(
					relative(config.root, outputPath).split(sep).join('/') || '.',
				);
				await writer.writeManifest({
					...manifest,
					outputPath,
					publicBase: staticHtmlPath('', base),
				});
			},
		},
		writeBundle: {
			order: 'post',
			async handler(output) {
				const outputPath = output.dir ?? resolve(config.root, config.build.outDir);
				const expected = verification.get(outputPath);
				if (!expected) return;
				verification.delete(outputPath);
				for (const [name, bytes] of expected) {
					if (!Buffer.from(bytes).equals(await readFile(resolve(outputPath, name)))) {
						this.error(
							`A plugin changed ${name} after CSP processing. Register cspVitePlugin after output-modifying plugins.`,
						);
					}
				}
			},
		},
	};
}
