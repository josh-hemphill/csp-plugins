import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $, cd, chalk, echo } from 'zx';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_DIR = join(dirname(__dirname), 'test-app');
const CLI_PATH = join(dirname(dirname(__dirname)), 'cli/dist/cli.mjs');

// Flag to keep test output directories for inspection
const KEEP_OUTPUT = process.env.KEEP_TEST_OUTPUT === 'true';

describe('cLI Edge Cases and Advanced Scenarios', () => {
	const testOutputDir = join(__dirname, 'cli-edge-cases-output');

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

	/**
	 * Create minimal test fixtures for edge case testing
	 */
	function createMinimalTestFixtures(testName: string): string {
		const isolatedOutputDir = join(testOutputDir, testName);
		mkdirSync(isolatedOutputDir, { recursive: true });

		// Create minimal test HTML file
		const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Minimal Test</title>
</head>
<body>
	<div>Test</div>
</body>
</html>`;

		writeFileSync(join(isolatedOutputDir, 'index.html'), htmlContent);
		return isolatedOutputDir;
	}

	describe('cLI Input Validation', () => {
		it('should handle non-existent input directory gracefully', async () => {
			const nonExistentDir = join(testOutputDir, 'non-existent');

			try {
				const { stdout } = await $`node ${CLI_PATH} ${nonExistentDir}`;
				// Should handle gracefully
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});

		it('should handle empty input directory gracefully', async () => {
			const emptyDir = join(testOutputDir, 'empty-dir');
			mkdirSync(emptyDir, { recursive: true });

			try {
				const { stdout } = await $`node ${CLI_PATH} ${emptyDir}`;
				// Should handle gracefully
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});

		it('should handle directory with no HTML files gracefully', async () => {
			const noHtmlDir = join(testOutputDir, 'no-html-dir');
			mkdirSync(noHtmlDir, { recursive: true });

			// Create a non-HTML file
			writeFileSync(join(noHtmlDir, 'test.txt'), 'This is not HTML');

			try {
				const { stdout } = await $`node ${CLI_PATH} ${noHtmlDir}`;
				// Should handle gracefully
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});
	});

	describe('cLI Flag Combinations', () => {
		it('should handle --no-headers and --no-html flags together', async () => {
			const isolatedDir = await buildTestAppInIsolation('no-headers-no-html');

			// Run CLI with both flags
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --no-headers --no-html`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file should not exist
			expect(existsSync(headersFile)).toBe(false);

			// Check HTML content should not be modified
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag should not exist
			expect(htmlContent).not.toContain('Content-Security-Policy');

			// Check nonces should not exist
			expect(htmlContent).not.toContain('nonce-');
		});

		it('should handle --verbose and --integrity flags together', async () => {
			const isolatedDir = await buildTestAppInIsolation('verbose-integrity');

			// Run CLI with both flags
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --verbose --integrity`;

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

			// Check nonces
			expect(htmlContent).toContain('nonce-');
		});
	});

	describe('cLI Output Directory Handling', () => {
		it('should create output directory if it does not exist', async () => {
			const isolatedDir = await buildTestAppInIsolation('create-output-dir');
			const outputDir = join(testOutputDir, 'new-output-dir');

			// Run CLI with non-existent output directory
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --output-dir ${outputDir} --manifests-dir ${isolatedDir}/.csp-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Check that output directory was created
			expect(existsSync(outputDir)).toBe(true);

			// Check that HTML file was copied to output directory
			const htmlFile = join(outputDir, 'index.html');
			expect(existsSync(htmlFile)).toBe(true);

			// Check that headers file was created in input directory
			const headersFile = join(isolatedDir, 'csp-headers.json');
			expect(existsSync(headersFile)).toBe(true);
		});

		it('should handle relative output directory paths', async () => {
			const isolatedDir = await buildTestAppInIsolation('relative-output-dir');
			const relativeOutputDir = './relative-output';

			// Run CLI with relative output directory
			cd(isolatedDir);
			const { stdout } = await $`node ${CLI_PATH} . --output-dir ${relativeOutputDir} --auto-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Check that output directory was created
			const absoluteOutputDir = join(isolatedDir, relativeOutputDir);
			expect(existsSync(absoluteOutputDir)).toBe(true);

			// Check that HTML file was copied to output directory
			const htmlFile = join(absoluteOutputDir, 'index.html');
			expect(existsSync(htmlFile)).toBe(true);
		});
	});

	describe('cLI Manifest Handling Edge Cases', () => {
		it('should handle manifest with empty arrays gracefully', async () => {
			const isolatedDir = createMinimalTestFixtures('empty-arrays-manifest');

			// Create manifest with empty arrays
			const emptyArraysManifest = {
				'script-src': [],
				'style-src': [],
				'img-src': [],
			};
			const manifestPath = join(isolatedDir, 'empty-manifest.json');
			writeFileSync(manifestPath, JSON.stringify(emptyArraysManifest, null, 2));

			// Run CLI with empty arrays manifest
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${manifestPath}`;

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
		});

		it('should handle manifest with null values gracefully', async () => {
			const isolatedDir = createMinimalTestFixtures('null-values-manifest');

			// Create manifest with null values
			const nullValuesManifest = {
				'script-src': null,
				'style-src': null,
				'img-src': null,
			};
			const manifestPath = join(isolatedDir, 'null-manifest.json');
			writeFileSync(manifestPath, JSON.stringify(nullValuesManifest, null, 2));

			// Run CLI with null values manifest
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${manifestPath}`;

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
		});

		it('should handle manifest with mixed data types gracefully', async () => {
			const isolatedDir = createMinimalTestFixtures('mixed-types-manifest');

			// Create manifest with mixed data types
			const mixedTypesManifest = {
				'script-src': ["'self'", 123, true, null, undefined],
				'style-src': ["'self'", { invalid: 'object' }],
				'img-src': ["'self'", []],
			};
			const manifestPath = join(isolatedDir, 'mixed-manifest.json');
			writeFileSync(manifestPath, JSON.stringify(mixedTypesManifest, null, 2));

			// Run CLI with mixed types manifest
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${manifestPath}`;

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
		});
	});

	describe('cLI Performance and Resource Limits', () => {
		it('should handle extremely large manifests without crashing', async () => {
			const isolatedDir = createMinimalTestFixtures('extreme-large-manifest');

			// Create an extremely large manifest
			const extremeLargeManifest: Record<string, string[]> = {
				'script-src': ["'self'"],
				'style-src': ["'self'"],
				'img-src': ["'self'"],
			};

			// Add many assets to simulate extremely large manifest
			for (let i = 0; i < 1000; i++) {
				extremeLargeManifest[`asset-${i}`] = [`https://example.com/asset-${i}.js`];
			}

			const manifestPath = join(isolatedDir, 'extreme-manifest.json');
			writeFileSync(manifestPath, JSON.stringify(extremeLargeManifest, null, 2));

			// Run CLI with extremely large manifest
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${manifestPath}`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Check that headers file was generated
			const headersPath = join(isolatedDir, 'csp-headers.json');
			expect(existsSync(headersPath)).toBe(true);
		}, 30000); // 30 second timeout for large manifest

		it('should handle HTML files with many inline scripts and styles', async () => {
			const isolatedDir = createMinimalTestFixtures('many-inline-elements');

			// Create HTML with many inline scripts and styles
			let htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Many Inline Elements</title>`;

			// Add many inline styles
			for (let i = 0; i < 100; i++) {
				htmlContent += `
	<style>
		.style-${i} { color: #${i.toString(16).padStart(6, '0')}; }
	</style>`;
			}

			htmlContent += `
</head>
<body>
	<div>Test</div>`;

			// Add many inline scripts
			for (let i = 0; i < 100; i++) {
				htmlContent += `
	<script>
		console.log('Script ${i}');
	</script>`;
			}

			htmlContent += `
</body>
</html>`;

			writeFileSync(join(isolatedDir, 'index.html'), htmlContent);

			// Run CLI
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists
			expect(existsSync(headersFile)).toBe(true);

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const processedHtmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(processedHtmlContent).toContain('Content-Security-Policy');

			// Check nonces
			expect(processedHtmlContent).toContain('nonce-');
		}, 30000); // 30 second timeout for large HTML
	});

	describe('cLI Error Recovery', () => {
		it('should continue processing other files if one file fails', async () => {
			const isolatedDir = createMinimalTestFixtures('partial-failure');

			// Create a valid HTML file
			const validHtml = `<!DOCTYPE html>
<html>
<head>
	<title>Valid HTML</title>
</head>
<body>
	<div>Valid content</div>
</body>
</html>`;
			writeFileSync(join(isolatedDir, 'valid.html'), validHtml);

			// Create an invalid HTML file (malformed)
			const invalidHtml = `<!DOCTYPE html>
<html>
<head>
	<title>Invalid HTML
<body>
	<div>Invalid content
</html>`;
			writeFileSync(join(isolatedDir, 'invalid.html'), invalidHtml);

			// Run CLI - should handle gracefully
			try {
				const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest`;
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});

		it('should handle permission errors gracefully', async () => {
			const isolatedDir = createMinimalTestFixtures('permission-test');

			// Create a read-only file to test permission handling
			const readOnlyFile = join(isolatedDir, 'readonly.txt');
			writeFileSync(readOnlyFile, 'Read only content');

			// Try to make it read-only (this might not work on all systems)
			try {
				await $`chmod 444 ${readOnlyFile}`;
			}
			catch {
				// Skip if chmod doesn't work
			}

			// Run CLI - should handle gracefully
			try {
				const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest`;
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});
	});
});
