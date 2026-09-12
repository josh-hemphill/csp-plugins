import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $, cd, chalk, echo } from 'zx';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_DIR = join(dirname(__dirname), 'test-app');

// Flag to keep test output directories for inspection
const KEEP_OUTPUT = process.env.KEEP_TEST_OUTPUT === 'true';

describe('vite Plugin Integration Tests', () => {
	const testOutputDir = join(__dirname, 'vite-plugin-integration-output');

	beforeAll(async () => {
		// Clean up previous test outputs
		if (existsSync(testOutputDir)) {
			rmSync(testOutputDir, { recursive: true, force: true });
		}
		mkdirSync(testOutputDir, { recursive: true });
	});

	afterAll(async () => {
		// Clean up test outputs unless KEEP_OUTPUT is set
		if (!KEEP_OUTPUT && existsSync(testOutputDir)) {
			rmSync(testOutputDir, { recursive: true, force: true });
		}
	});

	async function buildTestAppInIsolation(testName: string): Promise<string> {
		const isolatedOutputDir = join(testOutputDir, testName);
		mkdirSync(isolatedOutputDir, { recursive: true });

		// Copy test app to isolated directory
		const isolatedTestAppDir = join(isolatedOutputDir, 'test-app');
		cpSync(TEST_APP_DIR, isolatedTestAppDir, { recursive: true });

		// Build the isolated test app
		echo(`🔨 Building isolated test app for ${testName}...`);
		await $`cd ${isolatedTestAppDir} && pnpm run build`;

		// Verify build succeeded
		const distDir = join(isolatedTestAppDir, 'dist');
		if (!existsSync(distDir)) {
			throw new Error(`Build failed - dist directory not found`);
		}

		const distContents = readdirSync(distDir);
		if (distContents.length === 0) {
			throw new Error(`Build failed - dist directory is empty`);
		}

		echo(`✅ Build successful for ${testName}`);
		return isolatedTestAppDir;
	}

	describe('build Output', () => {
		it('should build successfully with CSP plugin', async () => {
			const isolatedDir = await buildTestAppInIsolation('build-success');

			// Verify build output exists in the dist subdirectory
			expect(existsSync(join(isolatedDir, 'dist', 'index.html'))).toBe(true);
			expect(existsSync(join(isolatedDir, 'dist', 'assets'))).toBe(true);

			// Check that assets directory has files
			const assetsDir = join(isolatedDir, 'dist', 'assets');
			const assetFiles = readdirSync(assetsDir);
			expect(assetFiles.length).toBeGreaterThan(0);
		});

		it('should generate expected asset files', async () => {
			const isolatedDir = await buildTestAppInIsolation('asset-generation');

			const distDir = join(isolatedDir, 'dist');
			const distFiles = readdirSync(distDir, { recursive: true });

			// Should have assets directory
			expect(distFiles).toContain('assets');
		});
	});

	describe('cSP Manifest Generation', () => {
		it('should generate manifest during build', async () => {
			const isolatedDir = await buildTestAppInIsolation('manifest-generation');

			const manifestDir = join(isolatedDir, '.csp-manifest');
			expect(existsSync(manifestDir)).toBe(true);

			const manifestFiles = readdirSync(manifestDir);
			const jsonFiles = manifestFiles.filter((f: string) => f.endsWith('.json'));
			expect(jsonFiles.length).toBeGreaterThan(0);

			// Validate manifest content
			const manifestPath = join(manifestDir, jsonFiles[0]);
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;

			expect(manifest.buildTool).toBe('vite');
			expect(manifest.outputDir).toBe('dist');
			expect(Array.isArray(manifest.assets)).toBe(true);
			expect((manifest.assets as any[]).length).toBeGreaterThan(0);
		});

		it('should validate manifest structure and content', async () => {
			const isolatedDir = await buildTestAppInIsolation('manifest-validation');

			const manifestDir = join(isolatedDir, '.csp-manifest');
			expect(existsSync(manifestDir)).toBe(true);

			const manifestFiles = readdirSync(manifestDir);
			const jsonFiles = manifestFiles.filter((f: string) => f.endsWith('.json'));
			expect(jsonFiles.length).toBeGreaterThan(0);

			// Validate each manifest file
			for (const jsonFile of jsonFiles) {
				const manifestPath = join(manifestDir, jsonFile);
				const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;

				// Required fields
				expect(manifest).toHaveProperty('buildTool');
				expect(manifest).toHaveProperty('outputDir');
				expect(manifest).toHaveProperty('assets');

				// Type validation
				expect(typeof manifest.buildTool).toBe('string');
				expect(typeof manifest.outputDir).toBe('string');
				expect(Array.isArray(manifest.assets)).toBe(true);

				// Asset validation
				const assets = manifest.assets as Array<{ path: string; type: string }>;
				expect(assets.length).toBeGreaterThan(0);
				for (const asset of assets) {
					expect(asset).toHaveProperty('path');
					expect(asset).toHaveProperty('type');
					expect(typeof asset.path).toBe('string');
					expect(typeof asset.type).toBe('string');
				}
			}
		});
	});

	describe('build Tool Integration', () => {
		it('should integrate with Vite build process', async () => {
			const isolatedDir = await buildTestAppInIsolation('vite-integration');

			// Verify that the CSP plugin was active during build
			const manifestDir = join(isolatedDir, '.csp-manifest');
			expect(existsSync(manifestDir)).toBe(true);

			// Check that HTML was processed during build
			const htmlFile = join(isolatedDir, 'index.html');
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Should have basic HTML structure
			expect(htmlContent).toContain('<!DOCTYPE html>');
			expect(htmlContent).toContain('<html');
		});

		it('should handle CSP configuration correctly', async () => {
			const isolatedDir = await buildTestAppInIsolation('config-test');

			// Test that manifest was generated
			const manifestDir = join(isolatedDir, '.csp-manifest');
			expect(existsSync(manifestDir)).toBe(true);

			// Verify manifest content
			const manifestFiles = readdirSync(manifestDir);
			const jsonFiles = manifestFiles.filter((f: string) => f.endsWith('.json'));
			expect(jsonFiles.length).toBeGreaterThan(0);

			const manifestPath = join(manifestDir, jsonFiles[0]);
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;

			// Should have expected structure
			expect(manifest.buildTool).toBe('vite');
			expect(manifest.outputDir).toBe('dist');
			expect(Array.isArray(manifest.assets)).toBe(true);
		});
	});
});
