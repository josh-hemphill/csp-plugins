import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimpleFilesystemCache } from '../lib/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('SimpleFilesystemCache', () => {
	let cache: SimpleFilesystemCache;
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csp-cache-test-'));
		cache = new SimpleFilesystemCache(tempDir);
	});

	afterEach(async () => {
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should create cache directory on init', async () => {
		await cache.write('test-key', {
			content: 'test content',
			hash: 'test-hash',
			timestamp: Date.now(),
			sourceType: 'local',
		});

		const stats = await fs.stat(tempDir);
		expect(stats.isDirectory()).toBe(true);
	});

	it('should write and read cache data', async () => {
		const testData = {
			content: 'test content',
			hash: 'test-hash',
			timestamp: Date.now(),
			sourceType: 'local' as const,
		};

		await cache.write('test-key', testData);
		const result = await cache.read('test-key');

		expect(result).toEqual(testData);
	});

	it('should return null for non-existent keys', async () => {
		const result = await cache.read('non-existent-key');
		expect(result).toBeNull();
	});

	it('should check if keys exist', async () => {
		expect(await cache.exists('test-key')).toBe(false);

		await cache.write('test-key', {
			content: 'test content',
			hash: 'test-hash',
			timestamp: Date.now(),
			sourceType: 'local',
		});

		expect(await cache.exists('test-key')).toBe(true);
	});

	it('should clear cache', async () => {
		await cache.write('key1', {
			content: 'content1',
			hash: 'hash1',
			timestamp: Date.now(),
			sourceType: 'local',
		});

		await cache.write('key2', {
			content: 'content2',
			hash: 'hash2',
			timestamp: Date.now(),
			sourceType: 'remote',
		});

		expect(await cache.exists('key1')).toBe(true);
		expect(await cache.exists('key2')).toBe(true);

		await cache.clear();

		expect(await cache.exists('key1')).toBe(false);
		expect(await cache.exists('key2')).toBe(false);
	});

	it('should get cache statistics', async () => {
		const stats1 = await cache.getStats();
		expect(stats1.size).toBe(0);
		expect(stats1.entries).toEqual([]);

		await cache.write('key1', {
			content: 'content1',
			hash: 'hash1',
			timestamp: Date.now(),
			sourceType: 'local',
		});

		const stats2 = await cache.getStats();
		expect(stats2.size).toBe(1);
		expect(stats2.entries[0].key).toBe('key1');
		expect(stats2.entries[0].sourceType).toBe('local');
	});

	it('should handle different source types', async () => {
		const localData = {
			content: 'local content',
			hash: 'local-hash',
			timestamp: Date.now(),
			sourceType: 'local' as const,
		};

		const remoteData = {
			content: 'remote content',
			hash: 'remote-hash',
			timestamp: Date.now(),
			sourceType: 'remote' as const,
		};

		await cache.write('local-key', localData);
		await cache.write('remote-key', remoteData);

		const localResult = await cache.read('local-key');
		const remoteResult = await cache.read('remote-key');

		expect(localResult?.sourceType).toBe('local');
		expect(remoteResult?.sourceType).toBe('remote');
	});

	it('should handle special characters in keys', async () => {
		const specialKey = 'test-key with spaces & special chars!@#$%^&*()';
		const testData = {
			content: 'special key content',
			hash: 'special-hash',
			timestamp: Date.now(),
			sourceType: 'local' as const,
		};

		await cache.write(specialKey, testData);
		const result = await cache.read(specialKey);

		expect(result).toEqual(testData);
		expect(await cache.exists(specialKey)).toBe(true);
	});

	it('should handle concurrent operations', async () => {
		const promises = [];
		const testData = {
			content: 'concurrent content',
			hash: 'concurrent-hash',
			timestamp: Date.now(),
			sourceType: 'local' as const,
		};

		// Write multiple keys concurrently
		for (let i = 0; i < 5; i++) {
			promises.push(cache.write(`key-${i}`, { ...testData, hash: `hash-${i}` }));
		}

		await Promise.all(promises);

		// Verify all keys were written
		for (let i = 0; i < 5; i++) {
			expect(await cache.exists(`key-${i}`)).toBe(true);
		}

		const stats = await cache.getStats();
		expect(stats.size).toBe(5);
	});
});
