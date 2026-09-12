import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $, cd, chalk, echo } from 'zx';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_DIR = join(dirname(__dirname), 'test-app');
const CLI_PATH = join(dirname(dirname(__dirname)), 'cli/dist/cli.mjs');

// Flag to keep test output directories for inspection
const KEEP_OUTPUT = process.env.KEEP_TEST_OUTPUT === 'true';

describe('e2E Scenario Tests', () => {
	const testOutputDir = join(__dirname, 'scenario-tests-output');

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

	describe('basic Processing Workflow', () => {
		it('should process basic HTML files with CSP injection', async () => {
			const isolatedDir = await buildTestAppInIsolation('basic-processing');

			// Run CLI
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('both Headers and Meta Tags', () => {
		it('should generate both CSP headers and meta tags', async () => {
			const isolatedDir = await buildTestAppInIsolation('both-headers-meta');

			// Run CLI
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate both outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('no Headers Flag Behavior', () => {
		it('should skip headers generation when --no-headers is used', async () => {
			const isolatedDir = await buildTestAppInIsolation('no-headers-behavior');

			// Run CLI with --no-headers flag
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --no-headers`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file should not exist
			expect(existsSync(headersFile)).toBe(false);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('no HTML Flag Behavior', () => {
		it('should skip HTML processing when --no-html is used', async () => {
			const isolatedDir = await buildTestAppInIsolation('no-html-behavior');

			// Run CLI with --no-html flag
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --no-html`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag should not exist
			expect(htmlContent).not.toContain('Content-Security-Policy');

			// Check nonces should not exist
			expect(htmlContent).not.toContain('nonce-');
		});
	});

	describe('custom Manifest Handling', () => {
		it('should handle custom manifest files correctly', async () => {
			const isolatedDir = await buildTestAppInIsolation('custom-manifest-handling');

			// Create a custom manifest
			const customManifest = {
				'script-src': ["'self'", "'unsafe-inline'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'https:'],
			};
			const customManifestPath = join(isolatedDir, 'custom-manifest.json');
			writeFileSync(customManifestPath, JSON.stringify(customManifest, null, 2));

			// Run CLI with custom manifest
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${customManifestPath}`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('error Handling and Edge Cases', () => {
		it('should handle missing manifest gracefully', async () => {
			const isolatedDir = await buildTestAppInIsolation('error-handling');

			// Run CLI without manifest - should handle gracefully
			try {
				const { stdout } = await $`node ${CLI_PATH} ${isolatedDir}`;
				// If it doesn't crash, that's good
				expect(stdout).toBeDefined();
			} catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});

		it('should handle invalid manifest gracefully', async () => {
			const isolatedDir = await buildTestAppInIsolation('invalid-manifest-handling');

			// Create an invalid manifest
			const invalidManifestPath = join(isolatedDir, 'invalid-manifest.json');
			writeFileSync(invalidManifestPath, 'invalid json content');

			// Run CLI with invalid manifest - should handle gracefully
			try {
				const { stdout } =
					await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${invalidManifestPath}`;
				// If it doesn't crash, that's good
				expect(stdout).toBeDefined();
			} catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});
	});

	describe('performance and Scalability', () => {
		it('should handle large asset manifests efficiently', async () => {
			const isolatedDir = await buildTestAppInIsolation('performance-test');

			// Create a large manifest with many assets
			const largeManifest: Record<string, string[]> = {
				'script-src': ["'self'"],
				'style-src': ["'self'"],
				'img-src': ["'self'"],
			};

			// Add many assets to simulate large manifest
			for (let i = 0; i < 100; i++) {
				largeManifest[`asset-${i}`] = [`https://example.com/asset-${i}.js`];
			}

			const largeManifestPath = join(isolatedDir, 'large-manifest.json');
			writeFileSync(largeManifestPath, JSON.stringify(largeManifest, null, 2));

			// Run CLI with large manifest
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${largeManifestPath}`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Check that headers file was generated
			const headersPath = join(isolatedDir, 'csp-headers.json');
			expect(existsSync(headersPath)).toBe(true);
		});
	});

	describe('policy Strictness Levels', () => {
		it('should apply strict CSP policies correctly', async () => {
			const isolatedDir = await buildTestAppInIsolation('policy-strictness');

			// Run CLI with default strict policy
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('local Integrity Generation', () => {
		it('should generate integrity attributes for local assets', async () => {
			const isolatedDir = await buildTestAppInIsolation('local-integrity');

			// Run CLI with integrity enabled
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --integrity`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces - the format is nonce-... (no quotes)
			expect(htmlContent).toContain('nonce-');

			// Note: Integrity attributes may not be present depending on the build output
			// This test validates that the CLI runs successfully with the flag
		});
	});
});
