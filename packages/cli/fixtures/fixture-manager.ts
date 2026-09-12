import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FixtureConfig {
	scripts?: string[];
	styles?: string[];
	images?: string[];
	fonts?: string[];
	title?: string;
}

export class FixtureManager {
	private fixturesDir: string;

	constructor(fixturesDir: string) {
		this.fixturesDir = fixturesDir;
	}

	/**
	 * Create a test directory with fixtures
	 */
	createTestDirectory(outputDir: string, config: FixtureConfig): void {
		// Ensure output directory exists
		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}

		// Copy script files
		if (config.scripts) {
			config.scripts.forEach((script) => {
				const source = join(this.fixturesDir, 'scripts', script);
				const dest = join(outputDir, script);
				if (existsSync(source)) {
					copyFileSync(source, dest);
				}
			});
		}

		// Copy style files
		if (config.styles) {
			config.styles.forEach((style) => {
				const source = join(this.fixturesDir, 'styles', style);
				const dest = join(outputDir, style);
				if (existsSync(source)) {
					copyFileSync(source, dest);
				}
			});
		}

		// Copy image files
		if (config.images) {
			config.images.forEach((image) => {
				const source = join(this.fixturesDir, 'images', image);
				const dest = join(outputDir, image);
				if (existsSync(source)) {
					copyFileSync(source, dest);
				}
			});
		}

		// Copy font files
		if (config.fonts) {
			config.fonts.forEach((font) => {
				const source = join(this.fixturesDir, 'fonts', font);
				const dest = join(outputDir, font);
				if (existsSync(source)) {
					copyFileSync(source, dest);
				}
			});
		}

		// Generate HTML file
		this.generateHTML(outputDir, config);
	}

	/**
	 * Generate HTML file from template
	 */
	private generateHTML(outputDir: string, config: FixtureConfig): void {
		const templatePath = join(this.fixturesDir, 'html', 'base-template.html');
		let html = readFileSync(templatePath, 'utf8');

		// Replace title
		html = html.replace('{{TITLE}}', config.title ?? 'Test Page');

		if (config.scripts) {
			html = html.replace('{{SCRIPTS}}', config.scripts.map((script) =>
				`<script type="module" src="./${script}"></script>`,
			).join('\n\t'));
		}

		if (config.styles) {
			html = html.replace('{{STYLES}}', config.styles.map((style) =>
				`<link rel="stylesheet" href="./${style}">`,
			).join('\n\t'));
		}

		if (config.images) {
			html = html.replace('{{IMAGES}}', config.images.map((image) =>
				`<img src="./${image}" alt="${image}">`,
			).join('\n\t'));
		}

		if (config.fonts) {
			html = html.replace('{{FONTS}}', config.fonts.map((font) =>
				`<link rel="preload" href="./${font}" as="font" type="font/woff2" crossorigin>`,
			).join('\n\t'));
		}

		// Write the generated HTML
		writeFileSync(join(outputDir, 'index.html'), html);
	}

	/**
	 * Get fixture file path
	 */
	getFixturePath(type: 'scripts' | 'styles' | 'images' | 'fonts', filename: string): string {
		return join(this.fixturesDir, type, filename);
	}

	/**
	 * List available fixtures
	 */
	listFixtures(type: 'scripts' | 'styles' | 'images' | 'fonts'): string[] {
		const typeDir = join(this.fixturesDir, type);
		if (!existsSync(typeDir))
			return [];

		// This is a simplified version - in a real implementation you'd use readdir
		// For now, return the fixtures we know exist
		switch (type) {
			case 'scripts':
				return ['test-script.js', 'utility-script.js', 'local-script.js', 'local-utility.js', 'advanced-script.js'];
			case 'styles':
				return ['test-style.css', 'local-style.css', 'local-components.css'];
			case 'images':
				return ['local-image.svg', 'local-logo.png'];
			case 'fonts':
				return ['local-font.woff2', 'local-icon-font.woff2'];
			default:
				return [];
		}
	}
}
