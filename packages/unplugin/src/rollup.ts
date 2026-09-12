import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Plugin } from 'rollup';

/**
 * Rollup plugin for CSP asset tracking
 */
export default function cspRollupPlugin(options: CspPluginOptions = {}): Plugin {
	const tracker = new CommonAssetTracker('rollup', options);
	const manifestWriter = new ManifestWriter(options.manifestDir);

	return {
		name: 'csp-rollup',

		// Track assets during build
		async generateBundle(options, bundle) {
			if (!tracker.getOptions().trackAssets) {
				return;
			}

			const outputDir = options.dir ?? 'dist';

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

		// Track inline assets
		transform(code, id) {
			if (!tracker.getOptions().trackAssets) {
				return null;
			}

			// Track inline scripts and styles
			if (
				id.endsWith('.js') ||
				id.endsWith('.ts') ||
				id.endsWith('.jsx') ||
				id.endsWith('.tsx')
			) {
				tracker.trackAsset({
					id,
					path: id,
					type: 'script',
					inline: true,
					source: code,
				});
			} else if (
				id.endsWith('.css') ||
				id.endsWith('.scss') ||
				id.endsWith('.sass') ||
				id.endsWith('.less')
			) {
				tracker.trackAsset({
					id,
					path: id,
					type: 'style',
					inline: true,
					source: code,
				});
			}

			return null;
		},

		// Cleanup
		closeBundle() {
			// Optional: cleanup old manifests
			manifestWriter
				.cleanupOldManifests()
				.catch((error: unknown) => console.error('Failed to cleanup manifests:', error));
		},
	};
}
