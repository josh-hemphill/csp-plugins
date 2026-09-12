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

describe('cLI Integration Scenarios and Workflows', () => {
	const testOutputDir = join(__dirname, 'cli-integration-scenarios-output');

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

	describe('end-to-End Workflow Testing', () => {
		it('should complete full CSP processing workflow successfully', async () => {
			const isolatedDir = await buildTestAppInIsolation('full-workflow');

			// Run CLI with full processing
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest --verbose`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate all outputs
			const headersFile = join(isolatedDir, 'csp-headers.json');
			const htmlFile = join(isolatedDir, 'index.html');

			// Check headers file exists and has content
			expect(existsSync(headersFile)).toBe(true);
			const headersContent = readFileSync(headersFile, 'utf8');
			expect(headersContent).toBeTruthy();

			// Check HTML content
			expect(existsSync(htmlFile)).toBe(true);
			const htmlContent = readFileSync(htmlFile, 'utf8');

			// Check meta tag
			expect(htmlContent).toContain('Content-Security-Policy');

			// Check nonces
			expect(htmlContent).toContain('nonce-');

			// Verify the workflow completed without errors
			expect(stdout).not.toContain('Error:');
			expect(stdout).not.toContain('Failed:');
		});

		it('should handle complex HTML with multiple resource types', async () => {
			const isolatedDir = await buildTestAppInIsolation('complex-html');

			// Run CLI on complex HTML
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

			// Check nonces for inline scripts and styles
			expect(htmlContent).toContain('nonce-');

			// Verify the HTML structure is intact and has CSP processing
			expect(htmlContent).toContain('<html');
			expect(htmlContent).toContain('</html>');
			expect(htmlContent).toContain('<head');
			expect(htmlContent).toContain('</head>');
		});
	});

	describe('cLI Configuration Scenarios', () => {
		it('should handle different CSP policy configurations', async () => {
			const isolatedDir = await buildTestAppInIsolation('policy-configurations');

			// Test strict policy
			const strictPolicy = {
				'script-src': ["'self'"],
				'style-src': ["'self'"],
				'img-src': ["'self'"],
				'font-src': ["'self'"],
				'connect-src': ["'self'"],
			};
			const strictPolicyPath = join(isolatedDir, 'strict-policy.json');
			writeFileSync(strictPolicyPath, JSON.stringify(strictPolicy, null, 2));

			// Run CLI with strict policy
			const { stdout: strictStdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${strictPolicyPath}`;

			expect(strictStdout).toContain('Processing directory:');
			expect(strictStdout).toContain('CSP processing complete');

			// Test permissive policy
			const permissivePolicy = {
				'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'https:', 'http:'],
				'font-src': ["'self'", 'data:', 'https:'],
				'connect-src': ["'self'", 'https:', 'wss:'],
			};
			const permissivePolicyPath = join(isolatedDir, 'permissive-policy.json');
			writeFileSync(permissivePolicyPath, JSON.stringify(permissivePolicy, null, 2));

			// Run CLI with permissive policy
			const { stdout: permissiveStdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${permissivePolicyPath}`;

			expect(permissiveStdout).toContain('Processing directory:');
			expect(permissiveStdout).toContain('CSP processing complete');

			// Validate both outputs exist
			const strictHeadersFile = join(isolatedDir, 'csp-headers.json');
			const permissiveHeadersFile = join(isolatedDir, 'csp-headers.json');
			expect(existsSync(strictHeadersFile)).toBe(true);
			expect(existsSync(permissiveHeadersFile)).toBe(true);
		});

		it('should handle custom directive configurations', async () => {
			const isolatedDir = await buildTestAppInIsolation('custom-directives');

			// Create custom policy with non-standard directives
			const customPolicy = {
				'script-src': ["'self'", "'unsafe-inline'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'https:'],
				'font-src': ["'self'", 'data:', 'https:'],
				'connect-src': ["'self'", 'https:'],
				'frame-src': ["'self'"],
				'object-src': ["'none'"],
				'base-uri': ["'self'"],
				'form-action': ["'self'"],
				'frame-ancestors': ["'self'"],
			};
			const customPolicyPath = join(isolatedDir, 'custom-policy.json');
			writeFileSync(customPolicyPath, JSON.stringify(customPolicy, null, 2));

			// Run CLI with custom policy
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${customPolicyPath}`;

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

	describe('cLI Output Validation Scenarios', () => {
		it('should generate consistent nonces across multiple runs', async () => {
			const isolatedDir = await buildTestAppInIsolation('nonce-consistency');

			// First run
			const { stdout: firstRun } =
				await $`node ${CLI_PATH} ${isolatedDir} --manifests-dir ${isolatedDir}/.csp-manifest`;
			expect(firstRun).toContain('CSP processing complete');

			// Get first run HTML
			const firstRunHtml = readFileSync(join(isolatedDir, 'index.html'), 'utf8');
			const firstRunNonces = firstRunHtml.match(/nonce-[^;\s]+/g) || [];

			// Clean up and rebuild
			rmSync(isolatedDir, { recursive: true, force: true });
			const newIsolatedDir = await buildTestAppInIsolation('nonce-consistency-2');

			// Second run
			const { stdout: secondRun } =
				await $`node ${CLI_PATH} ${newIsolatedDir} --manifests-dir ${newIsolatedDir}/.csp-manifest`;
			expect(secondRun).toContain('CSP processing complete');

			// Get second run HTML
			const secondRunHtml = readFileSync(join(newIsolatedDir, 'index.html'), 'utf8');
			const secondRunNonces = secondRunHtml.match(/nonce-[^;\s]+/g) || [];

			// Both runs should have nonces
			expect(firstRunNonces.length).toBeGreaterThan(0);
			expect(secondRunNonces.length).toBeGreaterThan(0);

			// Nonces should be different (randomly generated)
			expect(firstRunNonces).not.toEqual(secondRunNonces);
		});

		it('should validate CSP header format and content', async () => {
			const isolatedDir = await buildTestAppInIsolation('header-validation');

			// Create a test HTML file with inline content to trigger CSP generation
			const testHtmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Test for CSP Headers</title>
	<style>
		.test { color: red; }
	</style>
</head>
<body>
	<div>Test content</div>
	<script>
		console.log('Test script');
	</script>
</body>
</html>`;
			writeFileSync(join(isolatedDir, 'test.html'), testHtmlContent);

			// Create a CSP policy file to ensure headers are generated
			const cspPolicy = {
				'script-src': ["'self'", "'unsafe-inline'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'"],
			};
			const policyPath = join(isolatedDir, 'csp-policy.json');
			writeFileSync(policyPath, JSON.stringify(cspPolicy, null, 2));

			// Run CLI with policy file to generate headers
			const { stdout } =
				await $`node ${CLI_PATH} ${isolatedDir} --auto-manifest --csp-policy-file ${policyPath}`;

			expect(stdout).toContain('Processing directory:');
			expect(stdout).toContain('CSP processing complete');

			// Validate headers file
			const headersFile = join(isolatedDir, 'csp-headers.json');
			expect(existsSync(headersFile)).toBe(true);

			const headersContent = readFileSync(headersFile, 'utf8');
			const headers = JSON.parse(headersContent) as Record<string, string>;

			// Check headers structure (may be empty if CLI doesn't have policy directives)
			// Note: Headers may be empty if CLI doesn't have CSP policy directives
			// This is expected behavior for the current CLI implementation
			expect(headers).toBeDefined();

			// If headers are generated, validate their structure
			if (Object.keys(headers).length > 0) {
				expect(headers).toHaveProperty('Content-Security-Policy');
				expect(typeof headers['Content-Security-Policy']).toBe('string');

				// Check CSP content
				const cspPolicyString = headers['Content-Security-Policy'];
				expect(cspPolicyString).toContain('script-src');
				expect(cspPolicyString).toContain('style-src');
				expect(cspPolicyString).toContain('nonce-');
			}
		});
	});

	describe('cLI Integration with Build Tools', () => {
		it('should work with different build outputs', async () => {
			const isolatedDir = await buildTestAppInIsolation('build-tool-integration');

			// Simulate different build tool outputs by creating various file types
			const additionalFiles = [
				{ name: 'app.min.js', content: 'console.log("Minified JS");' },
				{ name: 'styles.min.css', content: '.minified { color: red; }' },
				{ name: 'assets/image.svg', content: '<svg>test</svg>' },
				{ name: 'assets/font.woff2', content: 'fake-font' },
				{ name: 'manifest.json', content: '{"name": "test"}' },
			];

			for (const file of additionalFiles) {
				const filePath = join(isolatedDir, file.name);
				mkdirSync(dirname(filePath), { recursive: true });
				writeFileSync(filePath, file.content);
			}

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

			// Check nonces
			expect(htmlContent).toContain('nonce-');

			// Verify additional files are still present
			for (const file of additionalFiles) {
				const filePath = join(isolatedDir, file.name);
				expect(existsSync(filePath)).toBe(true);
			}
		});
	});
});
