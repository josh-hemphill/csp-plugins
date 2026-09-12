import { describe, expect, it } from 'vitest';

import { CommonAssetTracker } from '../src/asset-tracker.ts';

describe('CommonAssetTracker hash contract', () => {
	it('defaults generateCsp to true and emitHeadersFile to csp-headers.json', () => {
		const options = new CommonAssetTracker('vite').getOptions();
		expect(options.generateCsp).toBe(true);
		expect(options.emitHeadersFile).toBe('csp-headers.json');
	});

	it('awaits hashes before generateManifest and stores sha256-<base64>', async () => {
		const tracker = new CommonAssetTracker('test');
		tracker.trackAsset({
			id: 'app.js',
			path: 'app.js',
			type: 'script',
			inline: false,
			source: 'console.log(1)',
		});

		const manifest = await tracker.generateManifest('dist');
		expect(manifest.assets).toHaveLength(1);
		expect(manifest.assets[0]?.hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
		expect(manifest.assets[0]?.hash?.startsWith('sha256-sha256-')).toBe(false);
	});

	it('regenerates a CSP hash when a bundler hash is not a hash source', async () => {
		const tracker = new CommonAssetTracker('vite');
		tracker.trackAsset({
			id: 'chunk.js',
			path: 'chunk.js',
			type: 'script',
			inline: false,
			hash: 'a1b2c3d4',
			source: 'export default 1',
		});

		const manifest = await tracker.generateManifest('dist');
		expect(manifest.assets[0]?.hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
		expect(manifest.assets[0]?.hash).not.toBe('a1b2c3d4');
		expect(manifest.assets[0]?.hash).not.toBe('sha256-a1b2c3d4');
	});

	it('keeps an already-prefixed hash source', async () => {
		const tracker = new CommonAssetTracker('cli');
		tracker.trackAsset({
			id: 'inline.js',
			path: 'inline.js',
			type: 'script',
			inline: true,
			hash: 'sha256-abc+def=',
			source: 'unused',
		});

		const manifest = await tracker.generateManifest('dist');
		expect(manifest.assets[0]?.hash).toBe('sha256-abc+def=');
	});

	it('drops an unprefixed bundler hash when no source is available', async () => {
		const tracker = new CommonAssetTracker('vite');
		tracker.trackAsset({
			id: 'chunk.js',
			path: 'chunk.js',
			type: 'script',
			inline: false,
			hash: 'a1b2c3d4',
		});

		const manifest = await tracker.generateManifest('dist');
		expect(manifest.assets[0]?.hash).toBeUndefined();
	});

	it('does not write a racing undefined hash when many assets are tracked', async () => {
		const tracker = new CommonAssetTracker('test');
		for (let i = 0; i < 20; i += 1) {
			tracker.trackAsset({
				id: `f-${i}.js`,
				path: `f-${i}.js`,
				type: 'script',
				inline: false,
				source: `console.log(${i})`,
			});
		}

		const manifest = await tracker.generateManifest('dist');
		expect(manifest.assets).toHaveLength(20);
		for (const asset of manifest.assets) {
			expect(asset.hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
		}
	});
});
