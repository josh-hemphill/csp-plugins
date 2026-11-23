import { mkdir, writeFile } from 'node:fs/promises';
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

export default function cspVitePlugin(options: CspPluginOptions = {}): Plugin {
	const settings = new CommonAssetTracker('vite', options).getOptions();
	const devProcessor = new CSPProcessor({
		...settings.cspProcessorOptions,
		developmentMode: true,
		enableNonces: false,
	});
	let config: ResolvedConfig;

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
				return (await devProcessor.processHTML(html)).html ?? html;
			},
		},
		generateBundle: {
			order: 'post',
			async handler(output, bundle, isWrite) {
				const base = config.base === './' || config.base === '' ? '/' : config.base;
				const files = Object.values(bundle);
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
								return asset?.type === 'chunk' ? asset.code : asset?.source;
							},
						);
						file.source = result.html ?? html;
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
					if (isAbsolute(fileName)) {
						if (isWrite) {
							await mkdir(dirname(fileName), { recursive: true });
							await writeFile(fileName, source, 'utf8');
						}
					} else {
						if (Object.hasOwn(bundle, fileName))
							this.error(`CSP header output conflicts with ${fileName}`);
						this.emitFile({ type: 'asset', fileName, source });
					}
				}

				if (!settings.trackAssets || !isWrite) return;
				const tracker = new CommonAssetTracker('vite', options);
				for (const file of files) {
					const content = file.type === 'chunk' ? file.code : file.source;
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
				const writer = new ManifestWriter(resolve(config.root, settings.manifestDir));
				await writer.writeManifest(
					await tracker.generateManifest(
						relative(config.root, output.dir ?? resolve(config.root, config.build.outDir))
							.split(sep)
							.join('/') || '.',
					),
				);
			},
		},
	};
}
