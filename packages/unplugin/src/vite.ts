import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import { CSPProcessor } from '@csp-plugins/core';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';

const DEFAULT_HEADERS_FILE = 'csp-headers.json';

/** Resolve the headers JSON path beside `outDir`, or `undefined` when emission is disabled. */
function resolveHeadersOutput(emit: boolean | string, outDir: string): string | undefined {
	if (emit === false) {
		return undefined;
	}
	const fileName = emit === true ? DEFAULT_HEADERS_FILE : emit;
	return isAbsolute(fileName) ? fileName : join(outDir, fileName);
}

/**
 * Vite plugin for CSP asset tracking, HTML injection, and header emission.
 */
export default function cspVitePlugin(options: CspPluginOptions = {}): Plugin {
	const tracker = new CommonAssetTracker('vite', options);
	const processor = new CSPProcessor(tracker.getOptions().cspProcessorOptions);
	let devServer: ViteDevServer | undefined;
	let manifestWriter: ManifestWriter | undefined;
	let resolvedOutDir = 'dist';
	let resolvedRoot = process.cwd();
	let lastHeaders: CspDirectiveHeaders | undefined;

	return {
		name: 'csp-vite',
		enforce: 'post',

		configResolved(config: ResolvedConfig) {
			resolvedRoot = config.root;
			resolvedOutDir = isAbsolute(config.build.outDir)
				? config.build.outDir
				: join(config.root, config.build.outDir);
		},

		async generateBundle(buildOptions, bundle) {
			if (!tracker.getOptions().trackAssets) {
				return;
			}

			// Extract relative output directory name from full path
			let outputDir = 'dist';
			if (
				buildOptions.dir !== undefined &&
				typeof buildOptions.dir === 'string' &&
				buildOptions.dir.length > 0
			) {
				const parts = buildOptions.dir.split('/');
				const lastPart = parts[parts.length - 1];
				if (lastPart && lastPart.length > 0) {
					outputDir = lastPart;
				}
			}

			const configuredManifestDir = options.manifestDir ?? '.csp-manifest';
			const finalManifestDir = isAbsolute(configuredManifestDir)
				? configuredManifestDir
				: join(resolvedRoot, configuredManifestDir);
			manifestWriter = new ManifestWriter(finalManifestDir);

			for (const [fileName, asset] of Object.entries(bundle)) {
				if (asset.type === 'asset') {
					const source =
						typeof asset.source === 'string' ? asset.source : asset.source.toString();
					const hash =
						'hash' in asset && typeof asset.hash === 'string' ? asset.hash : undefined;
					tracker.trackAsset({
						id: fileName,
						path: fileName,
						type: tracker.getOptions().assetTypeDetector(fileName, source),
						inline: false,
						hash,
						mimeType: asset.type,
						source,
					});
				} else if (asset.type === 'chunk') {
					const hash =
						'hash' in asset && typeof asset.hash === 'string' ? asset.hash : undefined;
					tracker.trackAsset({
						id: fileName,
						path: fileName,
						type: 'script',
						inline: false,
						hash,
						mimeType: 'application/javascript',
						source: asset.code,
					});
				}
			}

			const manifest = await tracker.generateManifest(outputDir);
			await manifestWriter.writeManifest(manifest);
		},

		async transformIndexHtml(html) {
			if (!tracker.getOptions().generateCsp) {
				return html;
			}

			const result = await processor.processHTML(html);
			if (
				result.headers !== undefined &&
				'Content-Security-Policy' in result.headers &&
				result.headers['Content-Security-Policy'].length > 0
			) {
				lastHeaders = result.headers;
			}
			return result.html ?? html;
		},

		configureServer(server) {
			if (!tracker.getOptions().devServer) {
				return;
			}

			devServer = server;

			server.middlewares.use((req, res, next) => {
				const url = req.url;
				if (url === null || url === undefined) {
					return next();
				}

				if (
					url.match(
						/\.(?:js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|mp4|webm|ogg|mp3|wav)$/,
					)
				) {
					tracker.trackAsset({
						id: url,
						path: url,
						type: tracker.getOptions().assetTypeDetector(url),
						inline: false,
					});
				}

				next();
			});

			server.watcher.on('change', (file) => {
				if (file.endsWith('.js') || file.endsWith('.css')) {
					tracker.trackAsset({
						id: file,
						path: file,
						type: tracker.getOptions().assetTypeDetector(file),
						inline: false,
					});
				}
			});
		},

		async closeBundle() {
			if (devServer) {
				devServer = undefined;
			}

			const headersPath = resolveHeadersOutput(
				tracker.getOptions().emitHeadersFile,
				resolvedOutDir,
			);
			if (headersPath !== undefined && lastHeaders !== undefined) {
				await mkdir(dirname(headersPath), { recursive: true });
				await writeFile(headersPath, `${JSON.stringify(lastHeaders, null, 2)}\n`, 'utf8');
			}

			manifestWriter
				?.cleanupBeforeConsolidation()
				.catch((error: unknown) => console.error('Failed to cleanup manifests:', error));
		},
	};
}
