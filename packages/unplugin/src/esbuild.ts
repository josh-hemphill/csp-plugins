import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Plugin } from 'esbuild';

/**
 * esbuild plugin for CSP asset tracking
 */
export default function cspEsbuildPlugin(options: CspPluginOptions = {}): Plugin {
	const tracker = new CommonAssetTracker('esbuild', options);

	return {
		name: 'csp-esbuild',

		setup(build) {
			if (!tracker.getOptions().trackAssets) return;

			// Track source files
			build.onLoad({ filter: /\.(js|ts|jsx|tsx|css|scss|sass|less)$/ }, (args) => {
				tracker.trackAsset({
					id: args.path,
					path: args.path,
					type: tracker.getOptions().assetTypeDetector(args.path),
					inline: true,
				});
				return null;
			});

			// Track output files
			build.onEnd(async (result) => {
				if (result.outputFiles) {
					const outputDir = (build.initialOptions.outdir ?? '') || 'dist';

					// Create manifest writer with output directory if not specified
					const finalManifestDir = options.manifestDir ?? '.csp-manifest';
					const manifestWriter = new ManifestWriter(finalManifestDir);

					for (const outputFile of result.outputFiles) {
						const fileName = (outputFile.path.split('/').pop() ?? '') || outputFile.path;

						tracker.trackAsset({
							id: fileName,
							path: fileName,
							type: tracker.getOptions().assetTypeDetector(fileName, outputFile.text),
							inline: false,
							source: outputFile.text,
						});
					}

					const manifest = await tracker.generateManifest(outputDir);
					await manifestWriter.writeManifest(manifest);
				}
			});

			// Cleanup
			build.onDispose(() => {
				// Optional: cleanup old manifests
				const outputDir = (build.initialOptions.outdir ?? '') || 'dist';
				const finalManifestDir = options.manifestDir ?? `${outputDir}/.csp-manifest`;
				const manifestWriter = new ManifestWriter(finalManifestDir);
				manifestWriter.cleanupOldManifests().catch(console.error);
			});
		},
	};
}
