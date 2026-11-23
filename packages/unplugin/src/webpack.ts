import { resolve } from 'node:path';

import { generateHash } from '@csp-plugins/core';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';

export default function cspWebpackPlugin(options: CspPluginOptions = {}): WebpackPluginInstance {
	return new CspWebpackPlugin(options);
}

/**
 * Webpack plugin for CSP asset tracking and dev server integration
 */
export class CspWebpackPlugin implements WebpackPluginInstance {
	private options: CspPluginOptions;

	constructor(options: CspPluginOptions = {}) {
		this.options = options;
	}

	apply(compiler: Compiler): void {
		compiler.hooks.thisCompilation.tap('CspWebpackPlugin', (compilation: Compilation) => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: 'CspWebpackPlugin',
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
				},
				async () => {
					const tracker = new CommonAssetTracker('webpack', this.options);
					const settings = tracker.getOptions();
					if (!settings.trackAssets) return;

					const outputPath =
						compilation.outputOptions.path ?? resolve(compiler.context, 'dist');
					const manifestWriter = new ManifestWriter(
						resolve(compiler.context, settings.manifestDir),
					);
					for (const asset of compilation.getAssets()) {
						const bytes = asset.source.buffer();
						tracker.trackAsset({
							id: asset.name,
							path: asset.name,
							type: settings.assetTypeDetector(asset.name),
							inline: false,
							hash: await generateHash(bytes, 'sha256'),
							mimeType: this.getMimeType(asset.name),
						});
					}
					await manifestWriter.writeManifest(await tracker.generateManifest(outputPath));
				},
			);
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
