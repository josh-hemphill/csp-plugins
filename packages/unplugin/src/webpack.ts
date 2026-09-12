import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';

export default function cspWebpackPlugin(options: CspPluginOptions = {}): WebpackPluginInstance {
	return new CspWebpackPlugin(options);
}

/**
 * Webpack plugin for CSP asset tracking and dev server integration
 */
export class CspWebpackPlugin implements WebpackPluginInstance {
	private tracker: CommonAssetTracker;
	private options: CspPluginOptions;

	constructor(options: CspPluginOptions = {}) {
		this.options = options;
		this.tracker = new CommonAssetTracker('webpack', options);
	}

	apply(compiler: Compiler): void {
		// Track assets during build
		compiler.hooks.afterEmit.tap('CspWebpackPlugin', (compilation: Compilation) => {
			if (!this.tracker.getOptions().trackAssets) {
				return;
			}

			const outputPath = compilation.outputOptions.path ?? 'dist';

			// Create manifest writer with output directory if not specified
			const finalManifestDir = this.options.manifestDir ?? '.csp-manifest';
			const manifestWriter = new ManifestWriter(finalManifestDir);

			// Track emitted assets
			for (const fileName of Object.keys(compilation.assets)) {
				const asset = compilation.assets[fileName];
				const source = asset.source();
				const sourceString = typeof source === 'string' ? source : source.toString();

				this.tracker.trackAsset({
					id: fileName,
					path: fileName,
					type: this.tracker.getOptions().assetTypeDetector(fileName, sourceString),
					inline: false,
					hash: typeof compilation.hash === 'string' ? compilation.hash : undefined,
					mimeType: this.getMimeType(fileName),
					source: sourceString,
				});
			}

			// Track chunks
			for (const chunk of compilation.chunks) {
				if (chunk.files !== undefined && chunk.files !== null && Array.from(chunk.files).length > 0) {
					for (const file of chunk.files) {
						this.tracker.trackAsset({
							id: file,
							path: file,
							type: 'script',
							inline: false,
							hash: typeof compilation.hash === 'string' ? compilation.hash : undefined,
							mimeType: 'application/javascript',
						});
					}
				}
			}

			// Write manifest
			const manifest = this.tracker.generateManifest(outputPath);
			manifestWriter.writeManifest(manifest).catch((error: unknown) => console.error('Failed to write manifest:', error));
		});

		// Dev server integration
		if (this.options.devServer) {
			compiler.hooks.watchRun.tap('CspWebpackPlugin', () => {
				// Track files that changed during watch mode
				if (compiler.watchFileSystem) {
					const watchFileSystem = compiler.watchFileSystem as { watcher?: { mtimes?: Record<string, unknown> } };
					const watcher = watchFileSystem.watcher;
					if (watcher?.mtimes) {
						for (const [file] of Object.entries(watcher.mtimes)) {
							if (file.endsWith('.js') || file.endsWith('.css')) {
								this.tracker.trackAsset({
									id: file,
									path: file,
									type: this.tracker.getOptions().assetTypeDetector(file),
									inline: false,
								});
							}
						}
					}
				}
			});
		}

		// Cleanup
		compiler.hooks.done.tap('CspWebpackPlugin', () => {
			// Optional: cleanup old manifests
			const outputPath = compiler.options.output?.path ?? 'dist';
			const finalManifestDir = this.options.manifestDir ?? `${outputPath}/.csp-manifest`;
			const manifestWriter = new ManifestWriter(finalManifestDir);
			manifestWriter.cleanupOldManifests().catch((error: unknown) => console.error('Failed to cleanup manifests:', error));
		});
	}

	/**
	 * Get MIME type based on file extension
	 */
	private getMimeType(fileName: string): string {
		const ext = fileName.split('.').pop()?.toLowerCase();

		switch (ext) {
			case 'js':
			case 'mjs':
			case 'cjs':
				return 'application/javascript';
			case 'css':
				return 'text/css';
			case 'html':
			case 'htm':
				return 'text/html';
			case 'png':
				return 'image/png';
			case 'jpg':
			case 'jpeg':
				return 'image/jpeg';
			case 'gif':
				return 'image/gif';
			case 'svg':
				return 'image/svg+xml';
			case 'woff':
				return 'font/woff';
			case 'woff2':
				return 'font/woff2';
			case 'ttf':
				return 'font/ttf';
			case 'otf':
				return 'font/otf';
			case 'mp4':
				return 'video/mp4';
			case 'webm':
				return 'video/webm';
			case 'ogg':
				return 'audio/ogg';
			case 'mp3':
				return 'audio/mpeg';
			case 'wav':
				return 'audio/wav';
			case undefined:
			default:
				return 'application/octet-stream';
		}
	}
}
