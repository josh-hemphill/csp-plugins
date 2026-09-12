import type { AssetManifest, TrackedAsset } from './types.ts';
import { promises as fs } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { generateHash } from '@csp-plugins/core';

/**
 * Detects assets that weren't tracked by build plugins
 */
export class PostBuildDetector {
	private buildManifests: AssetManifest[] = [];
	private detectedAssets: TrackedAsset[] = [];

	/**
	 * Add build manifests to compare against
	 */
	addBuildManifests(manifests: AssetManifest[]): void {
		this.buildManifests.push(...manifests);
	}

	/**
	 * Scan output directories for untracked assets
	 */
	async scanOutputDirectories(outputDirs: string[]): Promise<TrackedAsset[]> {
		this.detectedAssets = [];

		for (const outputDir of outputDirs) {
			await this.scanDirectory(outputDir, outputDir);
		}

		return this.detectedAssets;
	}

	/**
	 * Scan a directory recursively for assets
	 */
	private async scanDirectory(dir: string, baseDir: string): Promise<void> {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				const relativePath = relative(baseDir, fullPath);

				if (entry.isDirectory()) {
					// Skip common directories that shouldn't contain assets
					if (!['node_modules', '.git', '.csp-manifest'].includes(entry.name)) {
						await this.scanDirectory(fullPath, baseDir);
					}
				}
				else if (this.isAssetFile(entry.name)) {
					await this.processAssetFile(fullPath, relativePath);
				}
			}
		}
		catch {
			// Skip files that can't be read
		}
	}

	/**
	 * Process an individual asset file
	 */
	private async processAssetFile(fullPath: string, relativePath: string): Promise<void> {
		// Check if this asset was already tracked by build plugins
		if (this.isAssetTracked(relativePath)) {
			return;
		}

		try {
			const content = await fs.readFile(fullPath, 'utf-8');
			const hash = await generateHash(content, 'sha256');

			const asset: TrackedAsset = {
				id: relativePath,
				path: relativePath,
				type: this.detectAssetType(relativePath, content),
				inline: false,
				hash,
				mimeType: this.getMimeType(relativePath),
				source: content,
				buildTool: 'post-build-detection',
				timestamp: Date.now(),
			};

			this.detectedAssets.push(asset);
		}
		catch {
			// Skip files that can't be read
		}
	}

	/**
	 * Check if an asset was already tracked by build plugins
	 */
	private isAssetTracked(relativePath: string): boolean {
		return this.buildManifests.some((manifest) =>
			manifest.assets.some((asset) => asset.path === relativePath),
		);
	}

	/**
	 * Check if a file should be considered an asset
	 */
	private isAssetFile(fileName: string): boolean {
		const ext = extname(fileName).toLowerCase();
		return [
			'.js',
			'.mjs',
			'.cjs',
			'.jsx',
			'.ts',
			'.tsx',
			'.css',
			'.scss',
			'.sass',
			'.less',
			'.styl',
			'.png',
			'.jpg',
			'.jpeg',
			'.gif',
			'.svg',
			'.webp',
			'.avif',
			'.ico',
			'.woff',
			'.woff2',
			'.ttf',
			'.otf',
			'.eot',
			'.mp4',
			'.webm',
			'.ogg',
			'.mp3',
			'.wav',
			'.avi',
			'.mov',
			'.html',
			'.htm',
			'.xml',
			'.pdf',
		].includes(ext);
	}

	/**
	 * Detect asset type based on file extension and content
	 */
	private detectAssetType(path: string, content: string): TrackedAsset['type'] {
		const ext = extname(path).toLowerCase();

		// Script files
		if (['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'].includes(ext)) {
			return 'script';
		}

		// Style files
		if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) {
			return 'style';
		}

		// Image files
		if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico'].includes(ext)) {
			return 'image';
		}

		// Font files
		if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
			return 'font';
		}

		// Media files
		if (['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.avi', '.mov'].includes(ext)) {
			return 'media';
		}

		// Document files
		if (['.html', '.htm', '.xml', '.pdf'].includes(ext)) {
			return 'document';
		}

		// Check content for specific patterns
		if (content.includes('<script') || content.includes('javascript:')) {
			return 'script';
		}
		if (content.includes('<style') || content.includes('style=')) {
			return 'style';
		}

		return 'other';
	}

	/**
	 * Get MIME type based on file extension
	 */
	private getMimeType(path: string): string {
		const ext = extname(path).toLowerCase();

		switch (ext) {
			case '.js':
			case '.mjs':
			case '.cjs':
			case '.jsx':
			case '.ts':
			case '.tsx':
				return 'application/javascript';
			case '.css':
			case '.scss':
			case '.sass':
			case '.less':
			case '.styl':
				return 'text/css';
			case '.html':
			case '.htm':
				return 'text/html';
			case '.xml':
				return 'application/xml';
			case '.png':
				return 'image/png';
			case '.jpg':
			case '.jpeg':
				return 'image/jpeg';
			case '.gif':
				return 'image/gif';
			case '.svg':
				return 'image/svg+xml';
			case '.webp':
				return 'image/webp';
			case '.avif':
				return 'image/avif';
			case '.ico':
				return 'image/x-icon';
			case '.woff':
				return 'font/woff';
			case '.woff2':
				return 'font/woff2';
			case '.ttf':
				return 'font/ttf';
			case '.otf':
				return 'font/otf';
			case '.eot':
				return 'application/vnd.ms-fontobject';
			case '.mp4':
				return 'video/mp4';
			case '.webm':
				return 'video/webm';
			case '.ogg':
				return 'video/ogg';
			case '.mp3':
				return 'audio/mpeg';
			case '.wav':
				return 'audio/wav';
			case '.avi':
				return 'video/x-msvideo';
			case '.mov':
				return 'video/quicktime';
			case '.pdf':
				return 'application/pdf';
			default:
				return 'application/octet-stream';
		}
	}

	/**
	 * Get all detected assets
	 */
	getDetectedAssets(): TrackedAsset[] {
		return [...this.detectedAssets];
	}

	/**
	 * Clear detected assets
	 */
	clear(): void {
		this.detectedAssets = [];
		this.buildManifests = [];
	}
}
