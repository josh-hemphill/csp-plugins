import type { CSPProcessorOptions } from '@csp-plugins/core';
import type { AssetManifest, ConsolidatedAssetManifest } from './types.ts';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Utility for writing asset manifests to disk
 */
export class ManifestWriter {
	private manifestDir: string;

	constructor(manifestDir: string = '.csp-manifest') {
		this.manifestDir = manifestDir;
	}

	/**
	 * Generate a hash of manifest content (excluding timestamps)
	 */
	private generateContentHash(manifest: AssetManifest | ConsolidatedAssetManifest): string {
		// Create a copy without timestamps for consistent hashing
		const contentForHashing = {
			assets: manifest.assets.map((asset) => ({
				id: asset.id,
				path: asset.path,
				type: asset.type,
				inline: asset.inline,
				hash: asset.hash,
				mimeType: asset.mimeType,
				source: asset.source,
				buildTool: asset.buildTool,
				// Exclude timestamp for consistent hashing
			})),
			cspProcessorOptions: manifest.cspProcessorOptions,
		} as AssetManifest & ConsolidatedAssetManifest;

		if ('consolidated' in manifest) {
			contentForHashing.buildTools = manifest.buildTools;
			contentForHashing.outputDirs = manifest.outputDirs;
		}
		else if ('buildTool' in manifest) {
			contentForHashing.buildTool = manifest.buildTool;
			contentForHashing.outputDir = manifest.outputDir;
		}

		const contentString = JSON.stringify(contentForHashing, null, 0);
		return createHash('sha256').update(contentString).digest('hex').slice(-8);
	}

	/**
	 * Write asset manifest to disk
	 */
	async writeManifest(manifest: AssetManifest): Promise<string> {
		const contentHash = this.generateContentHash(manifest);
		const filename = `${manifest.buildTool}-${contentHash}.json`;
		const filepath = join(this.manifestDir, filename);

		// Ensure directory exists
		await this.ensureDirectory(dirname(filepath));

		// Write manifest with current timestamp
		const manifestWithTimestamp = {
			...manifest,
			buildTime: Date.now(), // Keep timestamp for reference
		};
		await fs.writeFile(filepath, JSON.stringify(manifestWithTimestamp, null, 2), 'utf-8');

		return filepath;
	}

	/**
	 * Write a consolidated manifest combining multiple build tools
	 */
	async writeConsolidatedManifest(manifests: AssetManifest[]): Promise<string> {
		const consolidated: ConsolidatedAssetManifest = {
			consolidated: true,
			consolidationTime: Date.now(),
			buildTools: manifests.map((m) => m.buildTool),
			outputDirs: manifests.map((m) => m.outputDir),
			assets: manifests.flatMap((m) => m.assets),
			cspProcessorOptions: this.mergeCspDirectives(manifests.map((m) => m.cspProcessorOptions)),
		};

		// Generate hash for consolidated manifest
		const contentHash = this.generateContentHash(consolidated);

		const filename = `consolidated-${contentHash}.json`;
		const filepath = join(this.manifestDir, filename);

		// Ensure directory exists
		await this.ensureDirectory(dirname(filepath));

		// Write consolidated manifest
		await fs.writeFile(filepath, JSON.stringify(consolidated, null, 2), 'utf-8');

		return filepath;
	}

	/**
	 * Read existing manifests from disk
	 */
	async readManifests(): Promise<AssetManifest[]> {
		try {
			const files = await fs.readdir(this.manifestDir);
			const manifestFiles = files.filter((f) => f.endsWith('.json') && f !== 'consolidated-*.json');

			const manifests: AssetManifest[] = [];
			for (const file of manifestFiles) {
				try {
					const content = await fs.readFile(join(this.manifestDir, file), 'utf-8');
					const manifest = JSON.parse(content) as AssetManifest;
					manifests.push(manifest);
				}
				catch {
					// Skip invalid manifest files
					console.warn(`Warning: Could not parse manifest file ${file}`);
				}
			}

			return manifests;
		}
		catch {
			// Directory doesn't exist or can't be read
			return [];
		}
	}

	/**
	 * Clean up old manifest files with improved strategy
	 */
	async cleanupOldManifests(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
		try {
			const files = await fs.readdir(this.manifestDir);
			const now = Date.now();
			const manifestsByTool = new Map<string, Array<{ file: string; path: string; stats: any; manifest: any }>>();

			// Group manifests by build tool and analyze them
			for (const file of files) {
				if (!file.endsWith('.json'))
					continue;

				const filepath = join(this.manifestDir, file);
				try {
					const stats = await fs.stat(filepath);
					const content = await fs.readFile(filepath, 'utf-8');
					const manifest = JSON.parse(content);

					// Skip consolidated manifests for now
					if (manifest.consolidated) {
						continue;
					}

					const buildTool = manifest.buildTool || 'unknown';
					if (!manifestsByTool.has(buildTool)) {
						manifestsByTool.set(buildTool, []);
					}
					manifestsByTool.get(buildTool)!.push({ file, path: filepath, stats, manifest });
				}
				catch {
					// Skip files that can't be accessed or parsed
					continue;
				}
			}

			// Clean up manifests for each build tool
			for (const [buildTool, manifests] of manifestsByTool) {
				if (manifests.length <= 1) {
					// Keep at least one manifest per build tool
					continue;
				}

				// Sort by build time (newest first)
				manifests.sort((a, b) => (b.manifest.buildTime || 0) - (a.manifest.buildTime || 0));

				// Keep the newest manifest and remove older ones
				for (let i = 1; i < manifests.length; i++) {
					const manifest = manifests[i];
					const age = now - manifest.stats.mtime.getTime();

					// Remove if older than maxAge or if we have a newer one
					if (age > maxAge || i > 0) {
						try {
							await fs.unlink(manifest.path);
							console.log(`Cleaned up old manifest: ${manifest.file} (${buildTool})`);
						}
						catch (error) {
							console.warn(`Failed to remove old manifest ${manifest.file}: ${error}`);
						}
					}
				}
			}

			// Clean up old consolidated manifests
			const consolidatedFiles = files.filter((f) => f.startsWith('consolidated-') && f.endsWith('.json'));
			for (const file of consolidatedFiles) {
				const filepath = join(this.manifestDir, file);
				try {
					const stats = await fs.stat(filepath);
					const age = now - stats.mtime.getTime();

					if (age > maxAge) {
						await fs.unlink(filepath);
						console.log(`Cleaned up old consolidated manifest: ${file}`);
					}
				}
				catch {
					// Skip files that can't be accessed
				}
			}
		}
		catch (error) {
			console.warn(`Failed to cleanup manifests: ${error}`);
		}
	}

	/**
	 * Clean up manifests before consolidation to prevent old ones from being included
	 */
	async cleanupBeforeConsolidation(): Promise<void> {
		try {
			const files = await fs.readdir(this.manifestDir);
			const now = Date.now();
			const manifestsByTool = new Map<string, Array<{ file: string; path: string; stats: any; manifest: any }>>();

			// Group manifests by build tool
			for (const file of files) {
				if (!file.endsWith('.json') || file.startsWith('consolidated-'))
					continue;

				const filepath = join(this.manifestDir, file);
				try {
					const stats = await fs.stat(filepath);
					const content = await fs.readFile(filepath, 'utf-8');
					const manifest = JSON.parse(content);

					if (manifest.consolidated) {
						continue;
					}

					const buildTool = manifest.buildTool || 'unknown';
					if (!manifestsByTool.has(buildTool)) {
						manifestsByTool.set(buildTool, []);
					}
					manifestsByTool.get(buildTool)!.push({ file, path: filepath, stats, manifest });
				}
				catch {
					continue;
				}
			}

			// For each build tool, keep only the most recent manifest
			for (const [buildTool, manifests] of manifestsByTool) {
				if (manifests.length <= 1) {
					continue;
				}

				// Sort by build time (newest first)
				manifests.sort((a, b) => (b.manifest.buildTime || 0) - (a.manifest.buildTime || 0));

				// Remove all but the newest
				for (let i = 1; i < manifests.length; i++) {
					try {
						await fs.unlink(manifests[i].path);
					}
					catch (error) {
						console.warn(`Failed to remove old manifest ${manifests[i].file}: ${error}`);
					}
				}
			}
		}
		catch (error) {
			console.warn(`Failed to cleanup before consolidation: ${error}`);
		}
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDirectory(dir: string): Promise<void> {
		try {
			await fs.access(dir);
		}
		catch {
			await fs.mkdir(dir, { recursive: true });
		}
	}

	/**
	 * Merge CSP directives from multiple manifests
	 */
	private mergeCspDirectives(directivesArray: Partial<CSPProcessorOptions>[]): Partial<CSPProcessorOptions> {
		const merged: Record<string, unknown> = {};

		for (const directives of directivesArray) {
			for (const [key, value] of Object.entries(directives)) {
				if (value !== undefined) {
					if (key === 'baseDirectives' && typeof value === 'object' && value !== null) {
						// Special handling for baseDirectives - merge the CSP directives within
						if (merged[key] === undefined) {
							merged[key] = { ...value };
						}
						else {
							const existingBaseDirectives = merged[key] as Record<string, unknown>;
							const newBaseDirectives = value as Record<string, unknown>;

							// Merge each directive within baseDirectives
							for (const [directiveKey, directiveValue] of Object.entries(newBaseDirectives)) {
								if (directiveValue !== undefined) {
									if (existingBaseDirectives[directiveKey] === undefined) {
										existingBaseDirectives[directiveKey] = directiveValue;
									}
									else if (Array.isArray(existingBaseDirectives[directiveKey]) && Array.isArray(directiveValue)) {
										// Merge arrays, removing duplicates
										const existingArray = existingBaseDirectives[directiveKey] as unknown[];
										const newArray = directiveValue as unknown[];
										existingBaseDirectives[directiveKey] = [...new Set([...existingArray, ...newArray])];
									}
									else if (Array.isArray(existingBaseDirectives[directiveKey]) && !Array.isArray(directiveValue)) {
										// Add single value to array if not already present
										const existingArray = existingBaseDirectives[directiveKey] as unknown[];
										if (!existingArray.includes(directiveValue)) {
											existingArray.push(directiveValue);
										}
									}
									else if (!Array.isArray(existingBaseDirectives[directiveKey]) && Array.isArray(directiveValue)) {
										// Convert single value to array and merge
										const existingValue = existingBaseDirectives[directiveKey];
										const newArray = directiveValue as unknown[];
										existingBaseDirectives[directiveKey] = [existingValue, ...newArray];
									}
									else {
										// Override with new value
										existingBaseDirectives[directiveKey] = directiveValue;
									}
								}
							}
						}
					}
					else {
						// Handle other properties as before
						if (merged[key] === undefined) {
							merged[key] = value;
						}
						else if (Array.isArray(merged[key]) && Array.isArray(value)) {
							// Merge arrays, removing duplicates
							const existingArray = merged[key] as unknown[];
							merged[key] = [...new Set([...existingArray, ...value])];
						}
						else if (Array.isArray(merged[key]) && !Array.isArray(value)) {
							// Add single value to array if not already present
							const existingArray = merged[key] as unknown[];
							if (!existingArray.includes(value)) {
								existingArray.push(value);
							}
						}
						else if (!Array.isArray(merged[key]) && Array.isArray(value)) {
							// Convert single value to array and merge
							const existingValue = merged[key];
							merged[key] = [existingValue, ...value];
						}
						else {
							// Override with new value
							merged[key] = value;
						}
					}
				}
			}
		}

		return merged as Partial<CSPProcessorOptions>;
	}
}
