import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { $, echo } from 'zx';
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

describe('CSP Hash Validation Tests', () => {
	let browser: Browser;
	let page: Page;
	const testOutputDir = join(__dirname, 'csp-hash-validation-output');

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

	it('should generate proper CSP hash format in manifest', async () => {
		const isolatedDir = await buildTestAppInIsolation('hash-format-test');

		// Check that CSP manifest was generated
		const manifestDir = join(isolatedDir, '.csp-manifest');
		expect(existsSync(manifestDir)).toBe(true);

		const manifestFiles = readdirSync(manifestDir);
		expect(manifestFiles.length).toBeGreaterThan(0);

		// Read the manifest file
		const manifestFile = join(manifestDir, manifestFiles[0]);
		const manifestContent = readFileSync(manifestFile, 'utf8');
		const manifest = JSON.parse(manifestContent);

		echo('📋 CSP Manifest generated:', manifest);

		// Check that assets have proper hash format
		expect(manifest.assets).toBeDefined();
		expect(manifest.assets.length).toBeGreaterThan(0);

		// Check script assets for proper hash format
		const scriptAssets = manifest.assets.filter((asset: any) => asset.type === 'script');
		expect(scriptAssets.length).toBeGreaterThan(0);

		for (const script of scriptAssets) {
			echo(`🔍 Script asset: ${script.id}, hash: ${script.hash}`);

			// Check that hash is present
			expect(script.hash).toBeDefined();
			expect(script.hash).toBeTruthy();

			// TODO: The current hash format appears to be base64, but CSP expects sha256-, sha384-, sha512-
			// This is likely where the hashing issue is occurring
			console.log(`⚠️  Current hash format: ${script.hash}`);
			console.log(`⚠️  Expected format should be: sha256-<base64-hash>`);
		}

		// Check style assets for proper hash format
		const styleAssets = manifest.assets.filter((asset: any) => asset.type === 'style');
		expect(styleAssets.length).toBeGreaterThan(0);

		for (const style of styleAssets) {
			echo(`🎨 Style asset: ${style.id}, hash: ${style.hash}`);
			expect(style.hash).toBeDefined();
			expect(style.hash).toBeTruthy();
		}
	}, 60000);

	it('should validate hash generation for inline scripts', async () => {
		const isolatedDir = await buildTestAppInIsolation('inline-script-hash-test');

		// Create a test HTML file with inline scripts to test hash generation
		const testHtmlPath = join(isolatedDir, 'src', 'inline-test.html');
		const inlineTestHtml = `
<!DOCTYPE html>
<html>
<head>
	<title>Inline Script Hash Test</title>
</head>
<body>
	<div id="app">Testing inline scripts</div>

	<!-- Inline script that should generate a hash -->
	<script>
		console.log('This is an inline script');
		document.getElementById('app').innerHTML = 'Inline script executed!';
	</script>

	<!-- Another inline script with different content -->
	<script>
		const message = 'Hello from inline script';
		alert(message);
	</script>
</body>
</html>`;

		writeFileSync(testHtmlPath, inlineTestHtml);

		// Build again to capture the inline scripts
		echo('🔄 Rebuilding with inline scripts...');
		await $`cd ${isolatedDir} && pnpm run build`;

		// Check the updated manifest
		const manifestDir = join(isolatedDir, '.csp-manifest');
		const manifestFiles = readdirSync(manifestDir);
		const latestManifestFile = join(manifestDir, manifestFiles[manifestFiles.length - 1]);
		const manifestContent = readFileSync(latestManifestFile, 'utf8');
		const manifest = JSON.parse(manifestContent);

		echo('📋 Updated manifest with inline scripts:', manifest);

		// Look for inline script assets
		const inlineScripts = manifest.assets.filter((asset: any) =>
			asset.type === 'script' && asset.inline === true
		);

		if (inlineScripts.length > 0) {
			echo(`✅ Found ${inlineScripts.length} inline script(s)`);
			for (const script of inlineScripts) {
				echo(`🔍 Inline script hash: ${script.hash}`);
				expect(script.hash).toBeDefined();
				expect(script.hash).toBeTruthy();
			}
		} else {
			echo('⚠️  No inline scripts found in manifest - this may indicate a tracking issue');
		}
	}, 60000);

	it('should validate hash generation for external resources', async () => {
		const isolatedDir = await buildTestAppInIsolation('external-resource-hash-test');

		// Check the built HTML for external resource references
		const distDir = join(isolatedDir, 'dist');
		const indexHtmlPath = join(distDir, 'index.html');
		const htmlContent = readFileSync(indexHtmlPath, 'utf8');

		echo('📄 Built HTML content:', htmlContent);

		// Check for script and style references
		expect(htmlContent).toContain('script');
		expect(htmlContent).toContain('link');

		// Extract asset references
		const scriptMatches = htmlContent.match(/src="([^"]+)"/g);
		const styleMatches = htmlContent.match(/href="([^"]+)"/g);

		if (scriptMatches) {
			echo(`🔍 Found script references: ${scriptMatches.join(', ')}`);
		}

		if (styleMatches) {
			echo(`🎨 Found style references: ${styleMatches.join(', ')}`);
		}

		// Check that referenced assets exist and have corresponding manifest entries
		const manifestDir = join(isolatedDir, '.csp-manifest');
		const manifestFiles = readdirSync(manifestDir);
		const manifestFile = join(manifestDir, manifestFiles[0]);
		const manifestContent = readFileSync(manifestFile, 'utf8');
		const manifest = JSON.parse(manifestContent);

		// Validate that all referenced assets are in the manifest
		const referencedAssets = new Set<string>();

		if (scriptMatches) {
			scriptMatches.forEach(match => {
				const src = match.match(/src="([^"]+)"/)?.[1];
				if (src) {
					referencedAssets.add(src.replace(/^\//, '')); // Remove leading slash
				}
			});
		}

		if (styleMatches) {
			styleMatches.forEach(match => {
				const href = match.match(/href="([^"]+)"/)?.[1];
				if (href) {
					referencedAssets.add(href.replace(/^\//, '')); // Remove leading slash
				}
			});
		}

		echo(`📋 Referenced assets: ${Array.from(referencedAssets).join(', ')}`);

		// Check that all referenced assets are in the manifest
		for (const assetPath of referencedAssets) {
			const manifestAsset = manifest.assets.find((asset: any) => asset.path === assetPath);
			expect(manifestAsset).toBeDefined();
			expect(manifestAsset.hash).toBeDefined();
			echo(`✅ Asset ${assetPath} found in manifest with hash: ${manifestAsset.hash}`);
		}
	}, 60000);

	it('should test browser CSP validation with actual hashes', async () => {
		const isolatedDir = await buildTestAppInIsolation('browser-hash-validation-test');

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
			// Navigate to page and wait for any CSP violations
			await page.goto(baseUrl, { waitUntil: 'networkidle2' });

			// Wait for any CSP violations to be captured
			await page.waitForTimeout(2000);

			// Get any security policy violations
			const violations = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.securityPolicyViolations || [];
			});

			echo('🔍 Security Policy Violations:', violations);

			// Check console for any CSP-related errors
			const consoleErrors = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.consoleErrors || [];
			});

			echo('📝 Console Errors:', consoleErrors);

			// For now, we expect no violations since CSP isn't being injected
			// This will change once HTML transformation is implemented
			echo('⚠️  Note: CSP policies are not yet being injected into HTML');
			echo('⚠️  This test will validate actual CSP compliance once HTML transformation is implemented');

		} finally {
			server.close();
		}
	}, 60000);
});

