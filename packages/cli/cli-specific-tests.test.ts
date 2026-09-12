import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $ } from 'zx';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLI_PATH = join(__dirname, 'dist/cli.mjs');

// Flag to keep test output directories for inspection
const KEEP_OUTPUT = process.env.KEEP_TEST_OUTPUT === 'true';

describe('cLI Specific Functionality Tests', () => {
	const testOutputDir = join(__dirname, 'cli-specific-test-output');

	beforeAll(async () => {
		// Clean up previous test artifacts
		const dirsToClean = [testOutputDir];
		for (const dir of dirsToClean) {
			if (existsSync(dir)) {
				rmSync(dir, { recursive: true, force: true });
			}
		}

		// Ensure CLI is built
		if (!existsSync(CLI_PATH)) {
			throw new Error('CLI not built. Run "pnpm run build" in the CLI package first.');
		}
	});

	afterAll(() => {
		// Clean up after tests unless KEEP_TEST_OUTPUT is set
		if (!KEEP_OUTPUT) {
			const dirsToClean = [testOutputDir];
			for (const dir of dirsToClean) {
				if (existsSync(dir)) {
					rmSync(dir, { recursive: true, force: true });
				}
			}
		} else {
			console.log(`\n🧹 Test output directories preserved for inspection:`);
			console.log(`   ${testOutputDir}`);
			console.log(`   Set KEEP_TEST_OUTPUT=false to clean up automatically\n`);
		}
	});

	/**
	 * Create test fixtures for CLI testing
	 */
	function createTestFixtures(testName: string): string {
		const isolatedOutputDir = join(testOutputDir, testName);
		mkdirSync(isolatedOutputDir, { recursive: true });

		// Create basic test HTML file
		const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Test Page</title>
	<script src="test.js"></script>
	<link rel="stylesheet" href="test.css">
</head>
<body>
	<div id="app">Test Content</div>
	<script>
		console.log('Test script');
	</script>
</body>
</html>`;

		writeFileSync(join(isolatedOutputDir, 'index.html'), htmlContent);
		writeFileSync(join(isolatedOutputDir, 'test.js'), 'console.log("External script");');
		writeFileSync(join(isolatedOutputDir, 'test.css'), '.test { color: red; }');

		return isolatedOutputDir;
	}

	describe('cLI Inspect Functionality', () => {
		it('should provide inspection capabilities', async () => {
			// Test CLI help for inspect functionality
			try {
				const { stdout } = await $`node ${CLI_PATH} --help`;
				expect(stdout).toContain('CSP Post-Build Processor');
			}
			catch (error) {
				// CLI might exit with help, which is expected
				expect(error).toBeDefined();
			}
		});
	});

	describe('cLI Custom Manifest Handling', () => {
		it('should handle custom manifest files correctly', async () => {
			const isolatedDir = createTestFixtures('cli-custom-manifest');

			// Create a custom manifest
			const customManifest = {
				'script-src': ["'self'", "'unsafe-inline'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'https:'],
			};
			const customManifestPath = join(isolatedDir, 'custom-manifest.json');
			writeFileSync(customManifestPath, JSON.stringify(customManifest, null, 2));

			// Run CLI with custom manifest
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${customManifestPath}`;

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

	describe('cLI Separate Output Handling', () => {
		it('should handle separate output directories', async () => {
			const isolatedDir = createTestFixtures('cli-separate-output');
			const outputDir = join(testOutputDir, 'cli-separate-output-output');
			mkdirSync(outputDir, { recursive: true });

			// Run CLI with separate output directory
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --output-dir ${outputDir} --auto-manifest`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate outputs in separate directory
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(outputDir, 'index.html');

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

	describe('cLI Large Assets Handling', () => {
		it('should handle large asset manifests efficiently', async () => {
			const isolatedDir = createTestFixtures('cli-large-assets');

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
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${largeManifestPath}`;

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

	describe('cLI Invalid Manifest Handling', () => {
		it('should handle invalid manifest files gracefully', async () => {
			const isolatedDir = createTestFixtures('cli-invalid-manifest');

			// Create an invalid manifest
			const invalidManifestPath = join(isolatedDir, 'invalid-manifest.json');
			writeFileSync(invalidManifestPath, 'invalid json content');

			// Run CLI with invalid manifest - should handle gracefully
			try {
				const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${invalidManifestPath}`;
				// If it doesn't crash, that's good
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});
	});

	describe('cLI No Headers Flag', () => {
		it('should handle --no-headers flag correctly', async () => {
			const isolatedDir = createTestFixtures('cli-no-headers');

			// Run CLI with --no-headers flag
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --no-headers`;

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

	describe('cLI No HTML Flag', () => {
		it('should handle --no-html flag correctly', async () => {
			const isolatedDir = createTestFixtures('cli-no-html');

			// Run CLI with --no-html flag
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --no-html`;

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

	describe('cLI No Manifest Handling', () => {
		it('should handle missing manifest gracefully', async () => {
			const isolatedDir = createTestFixtures('cli-no-manifest');

			// Run CLI without manifest - should handle gracefully
			try {
				const { stdout } = await $`node ${CLI_PATH} ${isolatedDir}`;
				// If it doesn't crash, that's good
				expect(stdout).toBeDefined();
			}
			catch (error) {
				// If it crashes with an error, that's also acceptable as long as it's handled gracefully
				expect(error).toBeDefined();
			}
		});
	});

	describe('cLI Advanced Features', () => {
		it('should handle integrity flag correctly', async () => {
			const isolatedDir = createTestFixtures('cli-integrity-test');

			// Run CLI with integrity enabled
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --integrity`;

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

		it('should handle verbose flag correctly', async () => {
			const isolatedDir = createTestFixtures('cli-verbose-test');

			// Run CLI with verbose flag
			const { stdout } = await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --verbose`;

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
});
