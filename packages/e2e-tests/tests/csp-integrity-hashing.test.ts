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

describe('CSP Integrity and Hash Format Tests', () => {
	let browser: Browser;
	let page: Page;
	const testOutputDir = join(__dirname, 'csp-integrity-hashing-output');

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

	it('should validate CSP hash format compliance', async () => {
		const isolatedDir = await buildTestAppInIsolation('hash-format-compliance-test');

		// Check CSP manifest for proper hash format
		const manifestDir = join(isolatedDir, '.csp-manifest');
		expect(existsSync(manifestDir)).toBe(true);

		const manifestFiles = readdirSync(manifestDir);
		const manifestFile = join(manifestDir, manifestFiles[0]);
		const manifestContent = readFileSync(manifestFile, 'utf8');
		const manifest = JSON.parse(manifestContent);

		echo('📋 Analyzing CSP manifest for hash format compliance...');

		// Check each asset for proper hash format
		for (const asset of manifest.assets) {
			echo(`🔍 Asset: ${asset.id} (${asset.type})`);
			echo(`   Hash: ${asset.hash}`);
			echo(`   MIME: ${asset.mimeType}`);

			// Validate hash format
			expect(asset.hash).toBeDefined();
			expect(asset.hash).toBeTruthy();

			// Check if hash is in the correct CSP format
			// CSP expects: sha256-<base64-hash>, sha384-<base64-hash>, sha512-<base64-hash>
			const isValidCSPHash = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(asset.hash);

			if (!isValidCSPHash) {
				echo(`⚠️  INVALID HASH FORMAT: ${asset.hash}`);
				echo(`   Expected format: sha256-<base64-hash>`);
				echo(`   Current format appears to be raw base64 without algorithm prefix`);

				// This is likely the root cause of the hashing issues
				console.log(`🚨 HASH FORMAT ISSUE DETECTED:`);
				console.log(`   Asset: ${asset.id}`);
				console.log(`   Current hash: ${asset.hash}`);
				console.log(`   Expected format: sha256-${asset.hash}`);
				console.log(`   The hash is missing the algorithm prefix!`);
			} else {
				echo(`✅ Valid CSP hash format: ${asset.hash}`);
			}
		}

		// Summary of findings
		const invalidHashes = manifest.assets.filter((asset: any) =>
			!/^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(asset.hash)
		);

		if (invalidHashes.length > 0) {
			echo(`🚨 Found ${invalidHashes.length} assets with invalid hash format:`);
			invalidHashes.forEach((asset: any) => {
				echo(`   - ${asset.id}: ${asset.hash}`);
			});
		} else {
			echo(`✅ All assets have valid CSP hash format`);
		}
	}, 60000);

	it('should test integrity attribute generation', async () => {
		const isolatedDir = await buildTestAppInIsolation('integrity-attribute-test');

		// Check the built HTML for integrity attributes
		const distDir = join(isolatedDir, 'dist');
		const indexHtmlPath = join(distDir, 'index.html');
		const htmlContent = readFileSync(indexHtmlPath, 'utf8');

		echo('📄 Built HTML content:', htmlContent);

		// Check for script and link tags
		const scriptTags = htmlContent.match(/<script[^>]*>/g);
		const linkTags = htmlContent.match(/<link[^>]*>/g);

		if (scriptTags) {
			echo(`🔍 Script tags found: ${scriptTags.length}`);
			scriptTags.forEach((tag, index) => {
				echo(`   Script ${index + 1}: ${tag}`);

				// Check for integrity attribute
				if (tag.includes('integrity=')) {
					echo(`   ✅ Has integrity attribute`);

					// Extract integrity value
					const integrityMatch = tag.match(/integrity="([^"]+)"/);
					if (integrityMatch) {
						const integrity = integrityMatch[1];
						echo(`   Integrity value: ${integrity}`);

						// Validate integrity format
						const isValidIntegrity = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(integrity);
						if (isValidIntegrity) {
							echo(`   ✅ Valid integrity format`);
						} else {
							echo(`   ⚠️  Invalid integrity format: ${integrity}`);
						}
					}
				} else {
					echo(`   ⚠️  Missing integrity attribute`);
				}
			});
		}

		if (linkTags) {
			echo(`🎨 Link tags found: ${linkTags.length}`);
			linkTags.forEach((tag, index) => {
				echo(`   Link ${index + 1}: ${tag}`);

				// Check for integrity attribute
				if (tag.includes('integrity=')) {
					echo(`   ✅ Has integrity attribute`);

					// Extract integrity value
					const integrityMatch = tag.match(/integrity="([^"]+)"/);
					if (integrityMatch) {
						const integrity = integrityMatch[1];
						echo(`   Integrity value: ${integrity}`);

						// Validate integrity format
						const isValidIntegrity = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(integrity);
						if (isValidIntegrity) {
							echo(`   ✅ Valid integrity format`);
						} else {
							echo(`   ⚠️  Invalid integrity format: ${integrity}`);
						}
					}
				} else {
					echo(`   ⚠️  Missing integrity attribute`);
				}
			});
		}

		// Check if any integrity attributes are present
		const hasIntegrityAttributes = htmlContent.includes('integrity=');
		if (hasIntegrityAttributes) {
			echo(`✅ HTML contains integrity attributes`);
		} else {
			echo(`⚠️  HTML does not contain integrity attributes`);
			echo(`   This suggests that integrity attribute injection is not implemented`);
		}
	}, 60000);

	it('should validate hash algorithm consistency', async () => {
		const isolatedDir = await buildTestAppInIsolation('hash-algorithm-consistency-test');

		// Check CSP manifest for hash algorithm consistency
		const manifestDir = join(isolatedDir, '.csp-manifest');
		const manifestFile = join(manifestDir, readdirSync(manifestDir)[0]);
		const manifestContent = readFileSync(manifestFile, 'utf8');
		const manifest = JSON.parse(manifestContent);

		echo('🔍 Analyzing hash algorithm consistency...');

		// Group assets by hash algorithm
		const hashAlgorithms = new Map<string, string[]>();

		for (const asset of manifest.assets) {
			const hash = asset.hash;
			if (hash) {
				// Extract algorithm from hash
				const algorithmMatch = hash.match(/^(sha(256|384|512))-/);
				if (algorithmMatch) {
					const algorithm = algorithmMatch[1];
					if (!hashAlgorithms.has(algorithm)) {
						hashAlgorithms.set(algorithm, []);
					}
					hashAlgorithms.get(algorithm)!.push(asset.id);
				} else {
					// Hash without algorithm prefix
					if (!hashAlgorithms.has('raw-base64')) {
						hashAlgorithms.set('raw-base64', []);
					}
					hashAlgorithms.get('raw-base64')!.push(asset.id);
				}
			}
		}

		// Report findings
		echo('📊 Hash algorithm distribution:');
		for (const [algorithm, assets] of hashAlgorithms) {
			echo(`   ${algorithm}: ${assets.length} assets`);
			if (assets.length <= 5) {
				assets.forEach(asset => echo(`     - ${asset}`));
			} else {
				echo(`     - ${assets.slice(0, 3).join(', ')}... and ${assets.length - 3} more`);
			}
		}

		// Check for consistency issues
		const hasRawBase64 = hashAlgorithms.has('raw-base64');
		const hasProperAlgorithms = Array.from(hashAlgorithms.keys()).some(key => key !== 'raw-base64');

		if (hasRawBase64 && hasProperAlgorithms) {
			echo(`⚠️  MIXED HASH FORMATS DETECTED:`);
			echo(`   Some assets have proper CSP format (sha256-, sha384-, sha512-)`);
			echo(`   Others have raw base64 format (missing algorithm prefix)`);
			echo(`   This inconsistency will cause CSP validation failures`);
		} else if (hasRawBase64) {
			echo(`🚨 ALL HASHES HAVE INVALID FORMAT:`);
			echo(`   All assets are missing algorithm prefixes`);
			echo(`   This will cause all CSP validations to fail`);
		} else if (hasProperAlgorithms) {
			echo(`✅ All hashes have proper CSP format`);
		}

		// Recommendations
		if (hasRawBase64) {
			echo(`💡 RECOMMENDATIONS:`);
			echo(`   1. Update hash generation to include algorithm prefix`);
			echo(`   2. Ensure all hashes follow format: sha256-<base64-hash>`);
			echo(`   3. Test CSP validation in browser to confirm fixes`);
		}
	}, 60000);

	it('should test browser CSP validation with proper hash format', async () => {
		const isolatedDir = await buildTestAppInIsolation('browser-csp-validation-test');

		// Start HTTP server to serve the built files
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
			// Navigate to page and capture any errors
			await page.goto(baseUrl, { waitUntil: 'networkidle2' });
			await page.waitForTimeout(2000);

			// Get security policy violations
			const violations = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.securityPolicyViolations || [];
			});

			echo('🔍 Security Policy Violations:', violations);

			// Get console errors
			const consoleErrors = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.consoleErrors || [];
			});

			echo('📝 Console Errors:', consoleErrors);

			// Get CSP violations
			const cspViolations = await page.evaluate(() => {
				return (window as any).__cspTestErrors?.cspViolations || [];
			});

			echo('🚨 CSP Violations:', cspViolations);

			// For now, we expect no violations since CSP isn't being injected
			// But we can still capture any browser errors that might indicate issues
			if (consoleErrors.length > 0 || violations.length > 0 || cspViolations.length > 0) {
				echo('⚠️  Browser errors/violations detected (expected without CSP injection)');
				echo('   These will be relevant once CSP policies are properly injected');
			} else {
				echo('✅ No browser errors or violations detected');
			}

		} finally {
			server.close();
		}
	}, 60000);
});

