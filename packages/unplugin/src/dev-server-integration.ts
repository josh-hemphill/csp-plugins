import type { CSPProcessor, CSPProcessorOptions } from '@csp-plugins/core';
import type { AssetManifest, CspPluginOptions } from '@csp-plugins/shared/types';
import { CSPProcessor as CoreCSPProcessor } from '@csp-plugins/core';

/**
 * Dev server integration for CSP processing
 * Handles HTML file processing and CSP injection during development
 */
export class DevServerIntegration {
	private options: CspPluginOptions;
	private cspProcessor: CSPProcessor;
	private manifest: AssetManifest | null = null;

	constructor(options: CspPluginOptions = {}) {
		this.options = options;

		const cspOptions = options.cspProcessorOptions ?? {};

		this.cspProcessor = new CoreCSPProcessor(cspOptions);
	}

	/**
	 * Set the current asset manifest for CSP generation
	 */
	setManifest(manifest: AssetManifest): void {
		this.manifest = manifest;
	}

	/**
	 * Process HTML content and inject CSP meta tag
	 */
	async processHTML(html: string, url: string): Promise<string> {
		try {
			// Process HTML with CSP processor
			const result = await this.cspProcessor.processHTML(html);

			// Return modified HTML with CSP meta tag
			if (result.html !== undefined && result.html !== null && result.html !== '') {
				return result.html;
			}
			return html;
		}
		catch (error) {
			console.warn(`Failed to process HTML for CSP at ${url}:`, error);
			return html; // Return original HTML on error
		}
	}

	/**
	 * Check if a file should be processed for CSP
	 */
	shouldProcessFile(filePath: string): boolean {
		return filePath.endsWith('.html') || filePath.endsWith('.htm');
	}

	/**
	 * Get CSP directives for the current manifest
	 */
	getCspDirectives(): Record<string, string> {
		if (this.manifest === null) {
			return {};
		}

		// Convert manifest CSP directives to headers format
		const directives: Record<string, string> = {};

		for (const [key, value] of Object.entries(this.manifest.cspProcessorOptions.baseDirectives ?? {})) {
			if (value !== undefined) {
				if (Array.isArray(value)) {
					directives[key] = value.join(' ');
				}
				else {
					directives[key] = String(value);
				}
			}
		}

		return directives;
	}

	/**
	 * Cleanup resources
	 */
	cleanup(): void {
		this.manifest = null;
	}
}
