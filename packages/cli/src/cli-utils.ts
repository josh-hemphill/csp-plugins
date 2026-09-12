import type { AssetManifest, TrackedAsset } from '@csp-plugins/shared/types';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
import { PostBuildDetector } from '@csp-plugins/shared/post-build-detector';

/**
 * CLI utilities for post-build processing
 */
export class CliUtils {
	private manifestWriter: ManifestWriter;
	private postBuildDetector: PostBuildDetector;

	constructor(manifestDir: string = '.csp-manifest') {
		this.manifestWriter = new ManifestWriter(manifestDir);
		this.postBuildDetector = new PostBuildDetector();
	}

	/**
	 * Process all manifests and detect untracked assets
	 */
	async processAllManifests(outputDirs: string[]): Promise<{
		manifests: AssetManifest[];
		detectedAssets: TrackedAsset[];
		consolidatedPath: string;
	}> {
		// Clean up old manifests before consolidation to prevent old ones from being included
		await this.manifestWriter.cleanupBeforeConsolidation();

		// Read existing manifests
		const manifests = await this.manifestWriter.readManifests();

		// Add manifests to post-build detector
		this.postBuildDetector.addBuildManifests(manifests);

		// Scan for untracked assets
		const detectedAssets = await this.postBuildDetector.scanOutputDirectories(outputDirs);

		// Create consolidated manifest
		const consolidatedPath = await this.manifestWriter.writeConsolidatedManifest(manifests);

		return {
			manifests,
			detectedAssets,
			consolidatedPath,
		};
	}

	/**
	 * Generate CSP directives from assets
	 */
	generateCspDirectives(assets: TrackedAsset[]): Record<string, string[]> {
		const directives: Record<string, string[]> = {};

		// Group assets by type
		const scripts = assets.filter((a) => a.type === 'script');
		const styles = assets.filter((a) => a.type === 'style');
		const images = assets.filter((a) => a.type === 'image');
		const fonts = assets.filter((a) => a.type === 'font');
		const media = assets.filter((a) => a.type === 'media');

		// Generate script-src directive
		if (scripts.length > 0) {
			directives['script-src'] = scripts.map((script) => {
				if (script.inline && script.hash !== undefined) {
					return `'sha256-${script.hash}'`;
				}
				return script.path;
			});
		}

		// Generate style-src directive
		if (styles.length > 0) {
			directives['style-src'] = styles.map((style) => {
				if (style.inline && style.hash !== undefined) {
					return `'sha256-${style.hash}'`;
				}
				return style.path;
			});
		}

		// Generate img-src directive
		if (images.length > 0) {
			directives['img-src'] = images.map((img) => img.path);
		}

		// Generate font-src directive
		if (fonts.length > 0) {
			directives['font-src'] = fonts.map((font) => font.path);
		}

		// Generate media-src directive
		if (media.length > 0) {
			directives['media-src'] = media.map((m) => m.path);
		}

		return directives;
	}

	/**
	 * Write CSP directives to a file
	 */
	async writeCspDirectives(directives: Record<string, string[]>, outputPath: string): Promise<string> {
		// Ensure directory exists
		await this.ensureDirectory(dirname(outputPath));

		// Format directives as CSP header
		const cspLines = Object.entries(directives).map(([key, values]) => {
			return `${key} ${values.join(' ')}`;
		});

		const cspHeader = cspLines.join('; ');

		// Write to file
		await fs.writeFile(outputPath, cspHeader, 'utf-8');

		return outputPath;
	}

	/**
	 * Generate a comprehensive report
	 */
	async generateReport(outputDir: string): Promise<string> {
		const report = {
			timestamp: new Date().toISOString(),
			summary: {
				totalAssets: 0,
				byType: {} as Record<string, number>,
				byBuildTool: {} as Record<string, number>,
				inlineAssets: 0,
				externalAssets: 0,
			},
			assets: [] as TrackedAsset[],
			recommendations: [] as string[],
		};

		// Read manifests
		const manifests = await this.manifestWriter.readManifests();

		// Collect all assets
		const allAssets = manifests.flatMap((m) => m.assets);
		report.assets = allAssets;
		report.summary.totalAssets = allAssets.length;

		// Generate statistics
		for (const asset of allAssets) {
			// Count by type
			report.summary.byType[asset.type] = (report.summary.byType[asset.type] || 0) + 1;

			// Count by build tool
			report.summary.byBuildTool[asset.buildTool] = (report.summary.byBuildTool[asset.buildTool] || 0) + 1;

			// Count inline vs external
			if (asset.inline) {
				report.summary.inlineAssets++;
			}
			else {
				report.summary.externalAssets++;
			}
		}

		// Generate recommendations
		if (report.summary.inlineAssets > 0) {
			report.recommendations.push(
				`Consider using nonces or hashes for ${report.summary.inlineAssets} inline assets`,
			);
		}

		if (report.summary.byType.script > 0) {
			report.recommendations.push(
				`Review ${report.summary.byType.script} script assets for security implications`,
			);
		}

		// Write report
		const reportPath = join(outputDir, 'csp-report.json');
		await this.ensureDirectory(dirname(reportPath));
		await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

		return reportPath;
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
}
export function firstLengthyString(...strs: (string | undefined)[]): string {
	return strs.find((str) => str !== undefined && str.length > 0) ?? '';
}
