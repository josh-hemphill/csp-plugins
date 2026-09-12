import fs from 'node:fs/promises';

import type { FilesystemCache, SourceType } from '@csp-plugins/core';
import { generateHash } from '@csp-plugins/core';

/**
 * Simple filesystem-based cache implementation
 * This provides persistent caching for the core package while keeping it filesystem-agnostic
 */
export class SimpleFilesystemCache implements FilesystemCache {
	private cacheDir: string;

	constructor(cacheDir: string) {
		this.cacheDir = cacheDir;
	}

	/**
	 * Initialize the cache directory
	 */
	private async init(): Promise<void> {
		try {
			await fs.mkdir(this.cacheDir, { recursive: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to create cache directory: ${message}`);
		}
	}

	/**
	 * Get cache file path for a key
	 */
	private async getCacheFilePath(key: string): Promise<string> {
		// Create a safe filename from the key
		const keyHash = await generateHash(key, 'sha256');
		const safeKey = String(keyHash)
			.slice(-9)
			.replace(/[^a-z0-9]/gi, '_');

		const contentHash = await generateHash(key, 'sha256');
		// Sanitize hash for filename safety (replace invalid characters)
		const safeHash = String(contentHash)
			.slice(-9)
			.replace(/[^a-z0-9]/gi, '_');
		return `${this.cacheDir}/${safeKey}_${safeHash}.json`;
	}

	/**
	 * Type guard to validate cache data structure
	 */
	private isValidCacheData(data: unknown): data is {
		content: string;
		hash: string;
		timestamp: number;
		sourceType: SourceType;
		key: string;
	} {
		if (data === null || typeof data !== 'object') {
			return false;
		}

		const obj = data as Record<string, unknown>;
		return (
			typeof obj.content === 'string' &&
			typeof obj.hash === 'string' &&
			typeof obj.timestamp === 'number' &&
			typeof obj.sourceType === 'string' &&
			typeof obj.key === 'string'
		);
	}

	/**
	 * Read cached resource from filesystem
	 */
	async read(key: string): Promise<{
		content: string;
		hash: string;
		timestamp: number;
		sourceType: SourceType;
	} | null> {
		try {
			await this.init();

			const cacheFile = await this.getCacheFilePath(key);
			const content = await fs.readFile(cacheFile, 'utf-8');
			const data: unknown = JSON.parse(content);

			// Validate the data structure
			if (this.isValidCacheData(data)) {
				// Return the data without the key (maintain backward compatibility)
				const { key: _, ...result } = data;
				return result;
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Write resource to filesystem cache
	 */
	async write(
		key: string,
		data: { content: string; hash: string; timestamp: number; sourceType: SourceType },
	): Promise<void> {
		try {
			// Ensure directory exists before writing
			await this.init();

			const cacheFile = await this.getCacheFilePath(key);
			// Store the original key along with the data for accurate retrieval
			const cacheData = { ...data, key };
			const content = JSON.stringify(cacheData, null, 2);
			await fs.writeFile(cacheFile, content, 'utf-8');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to write to cache file: ${message}`);
		}
	}

	/**
	 * Check if a cached resource exists
	 */
	async exists(key: string): Promise<boolean> {
		try {
			// Ensure directory exists before checking
			await this.init();

			const cacheFile = await this.getCacheFilePath(key);
			await fs.access(cacheFile);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Clear the filesystem cache
	 */
	async clear(): Promise<void> {
		try {
			const files = await fs.readdir(this.cacheDir);

			for (const file of files) {
				if (file.endsWith('.json')) {
					await fs.unlink(`${this.cacheDir}/${file}`);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to clear cache directory: ${message}`);
		}
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{
		size: number;
		entries: Array<{ key: string; timestamp: number; sourceType: SourceType }>;
	}> {
		try {
			const files = await fs.readdir(this.cacheDir);
			const entries: Array<{ key: string; timestamp: number; sourceType: SourceType }> = [];

			for (const file of files) {
				if (file.endsWith('.json')) {
					try {
						const content = await fs.readFile(`${this.cacheDir}/${file}`, 'utf-8');
						const data: unknown = JSON.parse(content);
						if (this.isValidCacheData(data)) {
							// Store the original key in the cache data for accurate retrieval
							// We need to modify the write method to include the original key
							entries.push({
								key: data.key || 'unknown', // Fallback to 'unknown' if key is not stored
								timestamp: data.timestamp,
								sourceType: data.sourceType,
							});
						}
					} catch {
						// Skip invalid cache files
					}
				}
			}

			return {
				size: entries.length,
				entries,
			};
		} catch {
			return {
				size: 0,
				entries: [],
			};
		}
	}
}
