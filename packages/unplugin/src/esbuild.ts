import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { generateHash } from '@csp-plugins/core';
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import type { CspPluginOptions } from '@csp-plugins/shared/types';
import type { Plugin } from 'esbuild';

/** Track esbuild's final output files in disk and in-memory builds. */
export default function cspEsbuildPlugin(options: CspPluginOptions = {}): Plugin {
	return {
		name: 'csp-esbuild',
		setup(build) {
			const tracker = new CommonAssetTracker('esbuild', options);
			const settings = tracker.getOptions();
			if (!settings.trackAssets) return;

			const initial = build.initialOptions;
			const root = initial.absWorkingDir ?? process.cwd();
			if (!initial.outfile && !initial.outdir) return; // stdout has no output directory
			const outputDir = resolve(root, initial.outdir ?? dirname(initial.outfile!));
			const writer = new ManifestWriter(resolve(root, settings.manifestDir));
			if (initial.write !== false) initial.metafile = true;
			build.onEnd(async (result) => {
				if (result.errors.length > 0) return;
				tracker.clear();
				const files =
					result.outputFiles?.map((file) => ({ path: file.path, bytes: file.contents })) ??
					(await Promise.all(
						Object.keys(result.metafile?.outputs ?? {}).map(async (output) => {
							const path = resolve(root, output);
							return { path, bytes: await readFile(path) };
						}),
					));
				for (const file of files) {
					const name = relative(outputDir, file.path).split(sep).join('/');
					tracker.trackAsset({
						id: name,
						path: name,
						type: settings.assetTypeDetector(name),
						inline: false,
						hash: await generateHash(file.bytes, 'sha256'),
					});
				}
				await writer.writeManifest(await tracker.generateManifest(outputDir));
			});
		},
	};
}
