import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { PluginOption, ViteDevServer } from 'vite';

/**
 * Vite plugin for CSP asset tracking and dev server integration
 */
export default function cspVitePlugin(options: CspPluginOptions = {}): PluginOption {
	const tracker = new CommonAssetTracker('vite', options);
	let devServer: ViteDevServer | undefined;
	let manifestWriter: ManifestWriter | undefined;

	return {
		name: 'csp-vite',
		enforce: 'post',

		// Track assets during build
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

			// Create manifest writer with output directory if not specified
			const finalManifestDir = options.manifestDir ?? '.csp-manifest';
			manifestWriter = new ManifestWriter(finalManifestDir);

			// Track all generated assets
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

		// Dev server integration
		configureServer(server) {
			if (!tracker.getOptions().devServer) {
				return;
			}

			devServer = server;

			// Track assets served by dev server
			server.middlewares.use((req, res, next) => {
				const url = req.url;
				if (url === null || url === undefined) {
					return next();
				}

				// Track static assets
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

			// Track transformed modules
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

		// Cleanup
		closeBundle() {
			if (devServer) {
				devServer = undefined;
			}

			// Clean up old manifests to prevent accumulation
			manifestWriter
				?.cleanupBeforeConsolidation()
				.catch((error: unknown) => console.error('Failed to cleanup manifests:', error));
		},
	};
}
