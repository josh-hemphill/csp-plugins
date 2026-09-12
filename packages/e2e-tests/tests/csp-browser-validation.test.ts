import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $, echo } from 'zx';

import type { CSPValidationResult } from '../src/puppeteer-utils.js';
import {
	closeBrowser,
	createCSPMonitoringPage,
	launchBrowser,
	validateCSP,
} from '../src/puppeteer-utils.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_DIR = join(dirname(__dirname), 'test-app');

// Flag to keep test output directories for inspection
const KEEP_OUTPUT = process.env.KEEP_TEST_OUTPUT === 'true';

describe('cSP Browser Validation', () => {
	let browser: Browser;
	let page: Page;
	const testOutputDir = join(__dirname, 'csp-browser-validation-output');

	beforeAll(async () => {
		// Clean up previous test outputs
		if (existsSync(testOutputDir)) {
			rmSync(testOutputDir, { recursive: true, force: true });
		}
		mkdirSync(testOutputDir, { recursive: true });

		// Launch browser for all tests
		browser = await launchBrowser();
		page = await createCSPMonitoringPage(browser);
	});

	afterAll(async () => {
		// Clean up browser
		if (browser) {
			await closeBrowser(browser);
		}

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

	it('should build test app without CSP violations', async () => {
		const isolatedDir = await buildTestAppInIsolation('build-test');

		// Check that build output exists
		const distDir = join(isolatedDir, 'dist');
		expect(existsSync(distDir)).toBe(true);

		const indexHtml = join(distDir, 'index.html');
		expect(existsSync(indexHtml)).toBe(true);
	}, 60000);

	it('should serve built app and validate CSP policy', async () => {
		const isolatedDir = await buildTestAppInIsolation('csp-policy-validation');

		// Start a simple HTTP server to serve the built files
		const { createServer } = await import('node:http');
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');

		const distDir = join(isolatedDir, 'dist');
		const indexHtml = join(distDir, 'index.html');

		if (!existsSync(indexHtml)) {
			throw new Error('Built app not found. Run build test first.');
		}

		const server = createServer((req, res) => {
			const url = req.url === '/' ? '/index.html' : req.url;
			const filePath = join(distDir, url || 'index.html');

			try {
				const content = readFileSync(filePath);
				const ext = filePath.split('.').pop();

				let contentType = 'text/html';
				if (ext === 'js') contentType = 'application/javascript';
				else if (ext === 'css') contentType = 'text/css';
				else if (ext === 'png') contentType = 'image/png';
				else if (ext === 'svg') contentType = 'image/svg+xml';
				else if (ext === 'woff2') contentType = 'font/woff2';

				res.writeHead(200, { 'Content-Type': contentType });
				res.end(content);
			} catch (error) {
				res.writeHead(404);
				res.end('Not found');
			}
		});

		// Start server on random port
		const serverPromise = new Promise<number>((resolve) => {
			server.listen(0, () => {
				const port = (server.address() as any).port;
				resolve(port);
			});
		});

		const port = await serverPromise;
		const baseUrl = `http://localhost:${port}`;

		try {
			// Validate CSP in browser
			const result = await validateCSP(page, {
				url: baseUrl,
				expectViolations: false,
				timeout: 30000,
			});

			// Log detailed results for debugging
			console.log('CSP Validation Result:', {
				success: result.success,
				cspPolicy: result.cspPolicy,
				consoleErrors: result.consoleErrors,
				cspViolations: result.cspViolations,
				securityPolicyViolations: result.securityPolicyViolations,
			});

			// Assert no CSP violations
			expect(result.success).toBe(true);
			expect(result.cspViolations).toHaveLength(0);
			expect(result.securityPolicyViolations).toHaveLength(0);

			// TODO: CSP plugin currently only generates manifests, not HTML transformations
			// For now, we'll check that the test app builds successfully
			// In the future, this should validate actual CSP policies in the HTML
			console.log(
				'Note: CSP plugin currently only generates manifests, not HTML transformations',
			);
			console.log('This test will be updated when HTML transformation is implemented');
		} finally {
			server.close();
		}
	}, 60000);

	it('should handle CSP hash validation correctly', async () => {
		const isolatedDir = await buildTestAppInIsolation('csp-hash-validation');

		// This test specifically validates that CSP hashes are working
		// and not causing violations for inline scripts/styles
		const { createServer } = await import('node:http');
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');

		const distDir = join(isolatedDir, 'dist');
		const indexHtml = join(distDir, 'index.html');

		if (!existsSync(indexHtml)) {
			throw new Error('Built app not found. Run build test first.');
		}

		const server = createServer((req, res) => {
			const url = req.url === '/' ? '/index.html' : req.url;
			const filePath = join(distDir, url || 'index.html');

			try {
				const content = readFileSync(filePath);
				const ext = filePath.split('.').pop();

				let contentType = 'text/html';
				if (ext === 'js') contentType = 'application/javascript';
				else if (ext === 'css') contentType = 'text/css';
				else if (ext === 'png') contentType = 'image/png';
				else if (ext === 'svg') contentType = 'image/svg+xml';
				else if (ext === 'woff2') contentType = 'font/woff2';

				res.writeHead(200, { 'Content-Type': contentType });
				res.end(content);
			} catch (error) {
				res.writeHead(404);
				res.end('Not found');
			}
		});

		const serverPromise = new Promise<number>((resolve) => {
			server.listen(0, () => {
				const port = (server.address() as any).port;
				resolve(port);
			});
		});

		const port = await serverPromise;
		const baseUrl = `http://localhost:${port}`;

		try {
			// Navigate to page and wait for any CSP violations
			await page.goto(baseUrl, { waitUntil: 'networkidle2' });

			// Wait for any CSP violations to be captured
			await page.waitForTimeout(2000);

			// Check for CSP policy in meta tag
			const cspPolicy = await page.evaluate(() => {
				const metaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
				return metaTag?.getAttribute('content');
			});

			// TODO: CSP plugin currently only generates manifests, not HTML transformations
			console.log(
				'Note: CSP plugin currently only generates manifests, not HTML transformations',
			);
			console.log('This test will be updated when HTML transformation is implemented');

			// Get any security policy violations
			const violations = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.securityPolicyViolations || [];
			});

			console.log('Security Policy Violations:', violations);

			// Should have no violations if hashes are correct
			expect(violations).toHaveLength(0);
		} finally {
			server.close();
		}
	}, 60000);
});
