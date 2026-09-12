import type { CspPluginOptions } from '../src/types.ts';
import process from 'node:process';
import { CspDirectives } from '@csp-plugins/typed-directives';
import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import Unplugin from '../src/vite';

// Test different CSP configurations
const cspConfigs = {
	strict: {
		trackAssets: true,
		generateCsp: true,
		devServer: true,
		manifestDir: '.csp-manifest-strict',
		cspProcessorOptions: {
			baseDirectives: new CspDirectives({
				'script-src': ['strict-dynamic'],
				'style-src': ['self'],
				'img-src': ['self'],
				'font-src': ['self'],
				'connect-src': ['self'],
			}),
		},
	},
	permissive: {
		trackAssets: true,
		generateCsp: true,
		devServer: true,
		manifestDir: '.csp-manifest-permissive',
		cspProcessorOptions: {
			baseDirectives: new CspDirectives({
				'script-src': ['unsafe-inline'],
				'style-src': ['https:'],
				'img-src': ['https:'],
				'font-src': ['https:'],
				'connect-src': ['https:'],
			}),
		},
	},
	minimal: {
		trackAssets: true,
		generateCsp: false,
		devServer: false,
		manifestDir: '.csp-manifest-minimal',
	},
} satisfies Record<string, CspPluginOptions>;

// Use strict config by default for testing
const FALLBACK_CONFIG = 'strict';
const envOverride = (process.env.CSP_CONFIG as keyof typeof cspConfigs | undefined) ?? FALLBACK_CONFIG;
console.log('detected env', process.env.CSP_CONFIG ?? `fallback:${FALLBACK_CONFIG}`);
const currentConfig = envOverride in cspConfigs ? cspConfigs[envOverride] : cspConfigs.strict;

export default defineConfig({
	plugins: [
		Inspect(),
		Unplugin(currentConfig),
	],
	build: {
		// Enable source maps for better asset tracking
		sourcemap: true,
		// Ensure we get predictable hashes
		rollupOptions: {
			output: {
				entryFileNames: '[name].[hash].js',
				chunkFileNames: '[name].[hash].js',
				assetFileNames: '[name].[hash].[ext]',
			},
		},
	},
	// Add some test assets
	assetsInclude: ['**/*.txt', '**/*.json'],
});
