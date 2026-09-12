import { describe, expect, it } from 'vitest';

import { CSPProcessor } from '../lib/csp-processor.ts';
import { ExternalResourceManager } from '../lib/external-resource-manager.ts';

describe('external Hashing', () => {
	it('should process external sources with hashing enabled', async () => {
		const processor = new CSPProcessor({
			externalSources: {
				hashing: {
					scripts: true,
					styles: true,
					integrity: true,
					fetchExternal: false,
				},
			},
		});

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<script src="https://example.com/script.js"></script>
				<link rel="stylesheet" href="https://example.com/style.css">
			</head>
			<body>
				<img src="https://example.com/image.jpg">
			</body>
			</html>
		`;

		const result = await processor.processHTML(html);

		expect(result.analysis.scriptSources).toHaveLength(1);
		expect(result.analysis.styleSources).toHaveLength(1);
		expect(result.analysis.imageSources).toHaveLength(1);

		// Check that CSP headers include script-src and style-src
		expect(result.headers['Content-Security-Policy']).toBeDefined();
	});

	it('should handle custom hash generator', async () => {
		const customHashGenerator = async (src: string, type: string) => {
			return `custom-hash-${src.length}-${type}`;
		};

		const processor = new CSPProcessor({
			externalSources: {
				hashing: {
					scripts: true,
					hashGenerator: customHashGenerator,
				},
			},
		});

		const html = '<script src="https://example.com/script.js"></script>';
		const result = await processor.processHTML(html);

		expect(result.analysis.scriptSources[0].hash).toMatch(/^sha256-/);
		expect(result.analysis.scriptSources[0].hash?.startsWith('sha256-sha256-')).toBe(false);
	});

	it('should respect include/exclude patterns', async () => {
		const processor = new CSPProcessor({
			externalSources: {
				hashing: {
					scripts: true,
					includePatterns: ['example.com'],
					excludePatterns: ['blocked.com'],
				},
			},
		});

		const html = `
			<script src="https://example.com/script.js"></script>
			<script src="https://blocked.com/script.js"></script>
			<script src="https://other.com/script.js"></script>
		`;

		const result = await processor.processHTML(html);

		// Only example.com should be hashed
		const scriptSources = result.analysis.scriptSources;
		expect(scriptSources).toHaveLength(3);

		const exampleScript = scriptSources.find((s) => s.src.includes('example.com'));
		const blockedScript = scriptSources.find((s) => s.src.includes('blocked.com'));
		const otherScript = scriptSources.find((s) => s.src.includes('other.com'));

		expect(exampleScript?.hash).toBeDefined();
		expect(blockedScript?.hash).toBeUndefined();
		expect(otherScript?.hash).toBeUndefined();
	});
});

describe('externalResourceManager', () => {
	it('should resolve URLs correctly', () => {
		const manager = new ExternalResourceManager();

		expect(manager.resolveUrl('https://example.com/script.js')).toBe(
			'https://example.com/script.js',
		);
		expect(manager.resolveUrl('//example.com/script.js')).toBe('https://example.com/script.js');
		expect(manager.resolveUrl('/script.js', 'https://example.com')).toBe(
			'https://example.com/script.js',
		);
	});

	it('should check URL patterns correctly', () => {
		const manager = new ExternalResourceManager();

		expect(manager.shouldFetchUrl('https://example.com/script.js', ['example.com'])).toBe(true);
		expect(manager.shouldFetchUrl('https://other.com/script.js', ['example.com'])).toBe(false);
		expect(manager.shouldFetchUrl('https://example.com/script.js', [], ['blocked.com'])).toBe(
			true,
		);
		expect(manager.shouldFetchUrl('https://blocked.com/script.js', [], ['blocked.com'])).toBe(
			false,
		);
	});

	it('should classify sources correctly', async () => {
		const manager = new ExternalResourceManager();

		// Test remote sources
		const remoteResult = await manager.classifySource('https://example.com/script.js');
		expect(remoteResult.type).toBe('remote');
		expect(remoteResult.accessible).toBe(true);

		// Test data URLs
		const dataResult = await manager.classifySource('data:text/javascript,console.log("hello")');
		expect(dataResult.type).toBe('data');
		expect(dataResult.accessible).toBe(true);

		// Test local sources (these will likely be inaccessible in test environment)
		const localResult = await manager.classifySource('/path/to/script.js');
		expect(localResult.type).toBe('local');
		// accessible will depend on whether the file actually exists
	});

	it('should handle custom local resource resolver', async () => {
		const customResolver = (src: string, baseDir: string) => {
			if (src.startsWith('@assets/')) {
				return `${baseDir}/assets/${src.slice(8)}`;
			}
			return src;
		};

		const manager = new ExternalResourceManager({
			local: {
				resolver: customResolver,
				baseDir: '/test',
			},
			localPatterns: ['^/', '^\\./', '^[a-zA-Z]:\\\\', '^file://', '^@assets/'],
		});

		const result = await manager.classifySource('@assets/script.js');
		expect(result.type).toBe('local');
		expect(result.resolvedPath).toBe('/test/assets/script.js');
	});

	it('should handle custom file reader', async () => {
		const mockContent = 'console.log("test");';
		const customReader = async (path: string) => {
			if (path.includes('script.js')) {
				return mockContent;
			}
			throw new Error('File not found');
		};

		const customExists = (path: string) => {
			// Make the path accessible so it can be processed
			return path.includes('script.js');
		};

		const manager = new ExternalResourceManager({
			local: {
				reader: customReader,
				exists: customExists,
			},
		});

		const result = await manager.processExternalResource('/path/to/script.js', 'script');

		expect(result.sourceType).toBe('local');
		expect(result.content).toBe(mockContent);
	});

	it('should handle custom file existence checker', async () => {
		const customExists = (path: string) => {
			// Only return true for paths that explicitly contain "exists.js"
			// This should make the test more predictable
			return path === '/path/to/exists.js';
		};

		const manager = new ExternalResourceManager({
			local: {
				exists: customExists,
			},
		});

		const existsResult = await manager.classifySource('/path/to/exists.js');
		expect(existsResult.type).toBe('local');
		expect(existsResult.accessible).toBe(true);

		const notExistsResult = await manager.classifySource('/path/to/not-exists.js');
		expect(notExistsResult.type).toBe('local');
		expect(notExistsResult.accessible).toBe(false);
	});

	it('should process different source types correctly', async () => {
		const manager = new ExternalResourceManager();

		// Test remote source
		const remoteResult = await manager.processExternalResource(
			'https://example.com/script.js',
			'script',
		);
		expect(remoteResult.sourceType).toBe('remote');
		expect(remoteResult.url).toBe('https://example.com/script.js');

		// Test data URL
		const dataResult = await manager.processExternalResource(
			'data:text/javascript,console.log("test")',
			'script',
		);
		expect(dataResult.sourceType).toBe('data');
		expect(dataResult.fetched).toBe(true);
		expect(dataResult.content).toBe('data:text/javascript,console.log("test")');

		// Test local source (will likely fail in test environment)
		const localResult = await manager.processExternalResource('/path/to/script.js', 'script');
		expect(localResult.sourceType).toBe('local');
		// fetched will depend on whether the file exists
	});

	it('should cache results correctly', async () => {
		const manager = new ExternalResourceManager();

		// First call
		const result1 = await manager.processExternalResource(
			'https://example.com/script.js',
			'script',
		);
		expect(result1.sourceType).toBe('remote');

		// Second call should use cache
		const result2 = await manager.processExternalResource(
			'https://example.com/script.js',
			'script',
		);
		expect(result2.sourceType).toBe('remote');

		// Check cache stats
		const stats = await manager.getCacheStats();
		expect(stats.size).toBeGreaterThan(0);
	});

	it('should clear cache correctly', async () => {
		const manager = new ExternalResourceManager();

		// Add something to cache
		await manager.processExternalResource('https://example.com/script.js', 'script');

		const statsBefore = await manager.getCacheStats();
		expect(statsBefore.size).toBeGreaterThan(0);

		// Clear cache
		await manager.clearCache();

		const statsAfter = await manager.getCacheStats();
		expect(statsAfter.size).toBe(0);
	});
});
