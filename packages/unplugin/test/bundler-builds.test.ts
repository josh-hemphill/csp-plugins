import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'esbuild';
import { rollup } from 'rollup';
import { expect, it } from 'vitest';
import webpack from 'webpack';

import esbuildPlugin from '../src/esbuild.ts';
import rollupPlugin from '../src/rollup.ts';
import webpackPlugin from '../src/webpack.ts';

const digest = (bytes: Uint8Array) =>
	`sha256-${createHash('sha256').update(bytes).digest('base64')}`;

it.each(['webpack', 'rollup', 'esbuild disk', 'esbuild memory'])(
	'tracks final %s bundle bytes',
	async (tool) => {
		const root = await mkdtemp(join(tmpdir(), 'csp-build-'));
		const entry = join(root, 'entry.js');
		const dir = join(root, 'dist');
		const manifestDir = join(root, 'manifests');
		const options = { manifestDir };
		const binary = Uint8Array.of(0, 255, 1, 10, 34, 60);
		await writeFile(
			entry,
			'console.log("worked"); // production builds may remove this comment\n',
		);
		try {
			let files: Record<string, Uint8Array> = {};
			if (tool === 'webpack') {
				const compiler = webpack({
					mode: 'production',
					context: root,
					entry,
					output: { path: dir },
					plugins: [webpackPlugin(options)],
				});
				try {
					await new Promise<void>((resolve, reject) =>
						compiler.run((error, stats) => {
							if (error) reject(error);
							else if (stats?.hasErrors()) reject(new Error(stats.toString()));
							else resolve();
						}),
					);
				} finally {
					await new Promise<void>((resolve) => compiler.close(() => resolve()));
				}
			} else if (tool === 'rollup') {
				const bundle = await rollup({
					input: entry,
					plugins: [
						{
							name: 'binary-fixture',
							buildStart() {
								this.emitFile({ type: 'asset', fileName: 'fixture.bin', source: binary });
							},
						},
						rollupPlugin(options),
					],
				});
				try {
					await bundle.write({ dir, format: 'es' });
				} finally {
					await bundle.close();
				}
			} else {
				const result = await build({
					absWorkingDir: root,
					entryPoints: [entry],
					outdir: dir,
					bundle: true,
					write: tool === 'esbuild disk',
					plugins: [esbuildPlugin(options)],
				});
				files = Object.fromEntries(
					result.outputFiles?.map((file) => [
						file.path.slice(dir.length + 1),
						file.contents,
					]) ?? [],
				);
			}
			if (!Object.keys(files).length) {
				files = Object.fromEntries(
					await Promise.all(
						(await readdir(dir)).map(async (name) => [name, await readFile(join(dir, name))]),
					),
				);
			}
			const [manifest] = await readdir(manifestDir);
			const { assets } = JSON.parse(await readFile(join(manifestDir, manifest), 'utf8'));
			expect(assets).toHaveLength(Object.keys(files).length);
			for (const asset of assets) {
				expect(asset.inline).toBe(false);
				expect(asset.hash).toBe(digest(files[asset.path]));
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
);
