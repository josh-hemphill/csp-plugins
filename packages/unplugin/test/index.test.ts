import { CommonAssetTracker, PostBuildDetector } from '@csp-plugins/shared';
import { describe, expect, it, vi } from 'vitest';
import cspVitePlugin from '../src/vite';

describe('csp unplugin', () => {
	describe('common asset tracker', () => {
		it('should track assets correctly', () => {
			const tracker = new CommonAssetTracker('test');

			tracker.trackAsset({
				id: 'test.js',
				path: 'test.js',
				type: 'script',
				inline: false,
			});

			const assets = tracker.getAssets();
			expect(assets).toHaveLength(1);
			expect(assets[0].id).toBe('test.js');
			expect(assets[0].buildTool).toBe('test');
		});

		it('should respect include/exclude patterns', () => {
			const tracker = new CommonAssetTracker('test', {
				includePatterns: [/\.js$/],
				excludePatterns: [/excluded/],
			});

			tracker.trackAsset({
				id: 'included.js',
				path: 'included.js',
				type: 'script',
				inline: false,
			});

			tracker.trackAsset({
				id: 'excluded.js',
				path: 'excluded.js',
				type: 'script',
				inline: false,
			});

			const assets = tracker.getAssets();
			expect(assets).toHaveLength(1);
			expect(assets[0].id).toBe('included.js');
		});
	});

	describe('post build detector', () => {
		it('should detect untracked assets', () => {
			const detector = new PostBuildDetector();

			// Add a build manifest
			detector.addBuildManifests([{
				buildTool: 'test',
				buildTime: Date.now(),
				outputDir: 'dist',
				assets: [{
					id: 'tracked.js',
					path: 'tracked.js',
					type: 'script',
					inline: false,
					buildTool: 'test',
					timestamp: Date.now(),
				}],
				cspProcessorOptions: {},
			}]);

			expect(detector.getDetectedAssets()).toHaveLength(0);
		});
	});
});
