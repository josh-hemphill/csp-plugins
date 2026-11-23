import { dirname, resolve } from 'node:path';

import { generateHash } from '@csp-plugins/core';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Plugin } from 'rollup';

/**
 * Rollup plugin for CSP asset tracking
 */
export default function cspRollupPlugin(options: CspPluginOptions = {}): Plugin {
	const manifestWriter = new ManifestWriter(options.manifestDir);

	return {
		name: 'csp-rollup',

		generateBundle: {
			order: 'post',
			async handler(output, bundle, isWrite) {
				const tracker = new CommonAssetTracker('rollup', options);
				const settings = tracker.getOptions();
				if (!settings.trackAssets || !isWrite) return;
				for (const file of Object.values(bundle)) {
					const content = file.type === 'chunk' ? file.code : file.source;
					tracker.trackAsset({
						id: file.fileName,
						path: file.fileName,
						type:
							file.type === 'chunk' ? 'script' : settings.assetTypeDetector(file.fileName),
						inline: false,
						hash: await generateHash(content, 'sha256'),
						source: typeof content === 'string' ? content : undefined,
					});
				}
				const outputDir = output.dir ?? (output.file ? dirname(output.file) : resolve('dist'));
				const manifest = await tracker.generateManifest(outputDir);
				await manifestWriter.writeManifest({ ...manifest, outputPath: resolve(outputDir) });
			},
		},
	};
}
