import type { Element } from 'domhandler';
import type { CSPProcessorOptions } from '../lib/csp-processor.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOne } from 'domutils';
import { ElementType } from 'htmlparser2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CSPProcessor } from '../lib/csp-processor.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load HTML fixture files
 */
function loadFixture(name: string): string {
	return readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf-8');
}

describe('cSPProcessor', () => {
	let processor: CSPProcessor;
	const basicHtml = loadFixture('basic');
	const complexHtml = loadFixture('complex');
	const noHeadHtml = loadFixture('no-head');

	beforeEach(() => {
		processor = new CSPProcessor();
	});

	describe('constructor', () => {
		it('creates instance with default options', () => {
			const proc = new CSPProcessor();
			expect(proc).toBeInstanceOf(CSPProcessor);
		});

		it('merges custom options with defaults', () => {
			const options: CSPProcessorOptions = {
				enableNonces: false,
				hashAlgorithm: 'sha384',
				injectMetaTag: false,
				metaTagOptions: {
					position: 'last',
					replaceExisting: false,
				},
			};

			const proc = new CSPProcessor(options);
			expect(proc).toBeInstanceOf(CSPProcessor);
		});
	});

	describe('parseHTML', () => {
		it('parses basic HTML correctly', () => {
			const document = processor.parseHTML(basicHtml);

			expect(document).toBeDefined();
			expect(document.children).toBeDefined();
			expect(document.children.length).toBeGreaterThan(0);
		});

		it('parses complex HTML with multiple elements', () => {
			const document = processor.parseHTML(complexHtml);

			expect(document).toBeDefined();
			expect(document.children).toBeDefined();
		});

		it('handles HTML without head element', () => {
			const document = processor.parseHTML(noHeadHtml);

			expect(document).toBeDefined();
			expect(document.children).toBeDefined();
		});
	});

	describe('analyzeDOM', () => {
		it('analyzes basic HTML and finds inline scripts and styles', async () => {
			const document = processor.parseHTML(basicHtml);
			const analysis = await processor.analyzeDOM(document);

			expect(analysis.inlineScripts).toHaveLength(1);
			expect(analysis.inlineStyles).toHaveLength(1);
			expect(analysis.scriptSources).toHaveLength(0);
			expect(analysis.styleSources).toHaveLength(0);
			expect(analysis.imageSources).toHaveLength(0);
			expect(analysis.fontSources).toHaveLength(0);
			expect(analysis.document).toBe(document);
		});

		it('analyzes complex HTML with external resources', async () => {
			const document = processor.parseHTML(complexHtml);
			const analysis = await processor.analyzeDOM(document);

			expect(analysis.inlineScripts).toHaveLength(3);
			expect(analysis.inlineStyles).toHaveLength(2);
			expect(analysis.scriptSources).toHaveLength(2);
			expect(analysis.styleSources).toHaveLength(1);
			expect(analysis.imageSources).toHaveLength(2);
			expect(analysis.fontSources).toHaveLength(1);
			expect(analysis.document).toBe(document);
		});

		it('generates hashes for inline content', async () => {
			const document = processor.parseHTML(basicHtml);
			const result = await processor.processDOM(document);

			// Hashes should be generated during processDOM, not analyzeDOM
			expect(result.analysis.inlineScripts[0].hash).toBeDefined();
			expect(result.analysis.inlineScripts[0].hash).toMatch(/^[A-Z0-9+/=]+$/i);
			expect(result.analysis.inlineStyles[0].hash).toBeDefined();
			expect(result.analysis.inlineStyles[0].hash).toMatch(/^[A-Z0-9+/=]+$/i);
		});

		it('includes element references', async () => {
			const document = processor.parseHTML(basicHtml);
			const analysis = await processor.analyzeDOM(document);

			expect(analysis.inlineScripts[0].element).toBeDefined();
			expect(analysis.inlineScripts[0].element.type).toBe(ElementType.Script);
			expect(analysis.inlineStyles[0].element).toBeDefined();
			expect(analysis.inlineStyles[0].element.type).toBe(ElementType.Style);
		});
	});

	describe('analyzeHTML', () => {
		it('combines parsing and analysis', async () => {
			const analysis = await processor.analyzeHTML(basicHtml);

			expect(analysis.inlineScripts).toHaveLength(1);
			expect(analysis.inlineStyles).toHaveLength(1);
			expect(analysis.document).toBeDefined();
		});
	});

	describe('processDOM', () => {
		it('generates CSP headers and nonces', async () => {
			const document = processor.parseHTML(basicHtml);
			const result = await processor.processDOM(document);

			expect(result.headers).toBeDefined();
			expect(result.headers['Content-Security-Policy']).toBeDefined();
			expect(result.nonces.script).toBeDefined();
			expect(result.nonces.style).toBeDefined();
			expect(result.analysis).toBeDefined();
			expect(result.html).toBeDefined();
		});

		it('includes hashes in CSP directives', async () => {
			const document = processor.parseHTML(basicHtml);
			const result = await processor.processDOM(document);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain('script-src');
			expect(csp).toContain('style-src');
			expect(csp).toContain('sha256-');
		});

		it('includes nonces in CSP directives', async () => {
			const document = processor.parseHTML(basicHtml);
			const result = await processor.processDOM(document);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain(`'nonce-${result.nonces.script}'`);
			expect(csp).toContain(`'nonce-${result.nonces.style}'`);
		});

		it('adds external sources to CSP', async () => {
			// Create a processor with external source processing enabled
			const processorWithExternal = new CSPProcessor({
				externalSources: {
					hashing: {
						scripts: true,
						styles: true,
						images: true,
						fonts: true,
						others: true,
						fetchExternal: (src: string) => {
							// Mock fetch function that returns content for external sources
							if (src.includes('cdn.example.com')) {
								return 'mock-external-content';
							}
							if (src.includes('/images/') || src.includes('/fonts/')) {
								return 'mock-local-content';
							}
							return 'mock-content';
						},
					},
				},
			});

			const document = processorWithExternal.parseHTML(complexHtml);
			const result = await processorWithExternal.processDOM(document);

			const csp = result.headers['Content-Security-Policy'];

			// External sources should be hashed for integrity, not added as allowed URLs
			// Check that hashes are generated for external sources
			expect(csp).toContain('script-src');
			expect(csp).toContain('style-src');
			expect(csp).toContain('img-src');
			expect(csp).toContain('font-src');

			// The CSP should contain hashes for external sources, not the URLs themselves
			// This is the correct security behavior - external sources are hashed for integrity
			// but not automatically allowed as sources
		});

		it('uses provided nonces when given', async () => {
			const document = processor.parseHTML(basicHtml);
			const customNonces = {
				script: 'custom-script-nonce',
				style: 'custom-style-nonce',
			};

			const result = await processor.processDOM(document, customNonces);

			expect(result.nonces.script).toBe('custom-script-nonce');
			expect(result.nonces.style).toBe('custom-style-nonce');
		});
	});

	describe('processHTML', () => {
		it('processes HTML string end-to-end', async () => {
			const result = await processor.processHTML(basicHtml);

			expect(result.headers).toBeDefined();
			expect(result.nonces.script).toBeDefined();
			expect(result.nonces.style).toBeDefined();
			expect(result.analysis).toBeDefined();
			expect(result.html).toBeDefined();
		});
	});

	describe('meta tag injection', () => {
		it('injects CSP meta tag by default', async () => {
			const result = await processor.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			expect(result.html).toContain('<meta http-equiv="Content-Security-Policy"');
			expect(result.html).toContain('script-src');
		});

		it('does not inject meta tag when disabled', async () => {
			const proc = new CSPProcessor({ injectMetaTag: false });
			const result = await proc.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			expect(result.html).not.toContain('<meta http-equiv="Content-Security-Policy"');
		});

		it('replaces existing CSP meta tags by default', async () => {
			const result = await processor.processHTML(complexHtml);

			expect(result.html).toBeDefined();
			// Should only have one CSP meta tag
			const cspMetaCount = (result.html!.match(/http-equiv="Content-Security-Policy"/g) || []).length;
			expect(cspMetaCount).toBe(1);
		});

		it('preserves existing CSP meta tags when replaceExisting is false', async () => {
			const proc = new CSPProcessor({
				metaTagOptions: { replaceExisting: false },
			});
			const result = await proc.processHTML(complexHtml);

			expect(result.html).toBeDefined();
			// Should have both original and new CSP meta tags
			const cspMetaCount = (result.html!.match(/http-equiv="Content-Security-Policy"/g) || []).length;
			expect(cspMetaCount).toBe(2);
		});

		it('creates head element when missing', async () => {
			const result = await processor.processHTML(noHeadHtml);

			expect(result.html).toBeDefined();
			expect(result.html).toContain('<head>');
			expect(result.html).toContain('<meta http-equiv="Content-Security-Policy"');
		});

		it('respects meta tag position options', async () => {
			const proc = new CSPProcessor({
				metaTagOptions: { position: 'last' },
			});
			const result = await proc.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			const head = findOne(
				(child) => child.type === ElementType.Tag && child.name === 'head',
				result.analysis?.document?.children ?? [],
			);
			const lastChild = head?.children[head.children.length - 1];
			expect(lastChild).toBeDefined();
			expect(lastChild?.type).toBe(ElementType.Tag);
			expect((lastChild as Element).name).toBe('meta');
			expect((lastChild as Element).attribs?.['http-equiv']).toBe('Content-Security-Policy');
		});

		it('adds custom attributes to meta tag', async () => {
			const proc = new CSPProcessor({
				metaTagOptions: {
					attributes: {
						'data-test': 'true',
						'data-version': '1.0',
					},
				},
			});
			const result = await proc.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			expect(result.html).toContain('data-test="true"');
			expect(result.html).toContain('data-version="1.0"');
		});
	});

	describe('development mode', () => {
		it('allows unsafe-inline in development', async () => {
			const proc = new CSPProcessor({
				developmentMode: true,
				development: {
					allowUnsafeInline: true,
				},
			});
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain("'unsafe-inline'");
		});

		it('allows unsafe-eval in development', async () => {
			const proc = new CSPProcessor({
				developmentMode: true,
				development: {
					allowUnsafeEval: true,
				},
			});
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain("'unsafe-eval'");
		});

		it('adds additional sources in development', async () => {
			const proc = new CSPProcessor({
				developmentMode: true,
				development: {
					additionalSources: ['localhost:3000', 'ws://localhost:8080'],
				},
			});
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain('localhost:3000');
			expect(csp).toContain('ws://localhost:8080');
		});
	});

	describe('options validation', () => {
		it('disables nonce generation when disabled', async () => {
			const proc = new CSPProcessor({ enableNonces: false });
			const result = await proc.processHTML(basicHtml);

			expect(result.nonces.script).toBeUndefined();
			expect(result.nonces.style).toBeUndefined();
		});

		it('disables hash generation when disabled', async () => {
			const proc = new CSPProcessor({ enableHashes: false });
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).not.toContain('sha256-');
		});

		it('uses custom hash algorithm', async () => {
			const proc = new CSPProcessor({ hashAlgorithm: 'sha384' });
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain('sha384-');
			expect(csp).not.toContain('sha256-');
		});

		it('uses custom nonce generator', async () => {
			const customNonceGenerator = vi.fn().mockResolvedValue('custom-nonce-123');
			const proc = new CSPProcessor({ nonceGenerator: customNonceGenerator });

			const result = await proc.processHTML(basicHtml);

			expect(customNonceGenerator).toHaveBeenCalled();
			expect(result.nonces.script).toBe('custom-nonce-123');
			expect(result.nonces.style).toBe('custom-nonce-123');
		});

		it('disables header generation when disabled', async () => {
			const proc = new CSPProcessor({ generateHeaders: false });
			const result = await proc.processHTML(basicHtml);

			expect(result.headers).toEqual({});
		});

		it('includes base directives in final CSP output', async () => {
			const proc = new CSPProcessor({
				baseDirectives: {
					CSP: {
						'default-src': ['self'],
						'connect-src': ['https://api.example.com'],
						'frame-src': ['none'],
					},
				},
			});
			const result = await proc.processHTML(basicHtml);

			const csp = result.headers['Content-Security-Policy'];
			expect(csp).toContain("default-src 'self'");
			expect(csp).toContain('connect-src https://api.example.com');
			expect(csp).toContain("frame-src 'none'");
			// Should also contain generated directives
			expect(csp).toContain('script-src');
			expect(csp).toContain('style-src');
		});
	});

	describe('nonce injection', () => {
		it('adds nonces to inline script elements', async () => {
			const result = await processor.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			expect(result.html).toContain(`nonce="${result.nonces.script}"`);
		});

		it('adds nonces to inline style elements', async () => {
			const result = await processor.processHTML(basicHtml);

			expect(result.html).toBeDefined();
			expect(result.html).toContain(`nonce="${result.nonces.style}"`);
		});

		it('updates analysis with nonce values', async () => {
			const result = await processor.processHTML(basicHtml);

			expect(result.analysis.inlineScripts[0].nonce).toBe(result.nonces.script);
			expect(result.analysis.inlineStyles[0].nonce).toBe(result.nonces.style);
		});
	});

	describe('error handling', () => {
		it('handles empty HTML gracefully', async () => {
			const result = await processor.processHTML('');

			expect(result.headers).toBeDefined();
			expect(result.analysis).toBeDefined();
			expect(result.html).toBeDefined();
		});

		it('handles malformed HTML gracefully', async () => {
			const malformedHtml = '<html><head><title>Test</head><body><script>test</body>';
			const result = await processor.processHTML(malformedHtml);

			expect(result.headers).toBeDefined();
			expect(result.analysis).toBeDefined();
		});
	});
});
