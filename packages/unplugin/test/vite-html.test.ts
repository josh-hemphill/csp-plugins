import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import cspVitePlugin from '../src/vite.ts';

async function writeViteApp(root: string): Promise<void> {
	await writeFile(
		join(root, 'index.html'),
		`<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<title>CSP Vite fixture</title>
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="/main.js"></script>
		<script>
			console.log('inline');
		</script>
	</body>
</html>
`,
	);
	await writeFile(join(root, 'main.js'), 'document.getElementById("app").textContent = "ok";\n');
}

describe('cspVitePlugin HTML and headers', () => {
	it('injects a CSP meta tag and writes csp-headers.json without unsafe-inline', async () => {
		const root = await mkdtemp(join(tmpdir(), 'csp-vite-'));
		await writeViteApp(root);
		const outDir = join(root, 'dist');

		await build({
			root,
			logLevel: 'silent',
			plugins: [cspVitePlugin()],
			build: {
				outDir,
				emptyOutDir: true,
				write: true,
			},
		});

		const html = await readFile(join(outDir, 'index.html'), 'utf8');
		expect(html).toMatch(/<meta[^>]*http-equiv="Content-Security-Policy"/);
		expect(html).not.toContain("'unsafe-inline'");
		expect(html).toContain("'self'");
		expect(html).toContain("'sha256-");

		const headers = JSON.parse(await readFile(join(outDir, 'csp-headers.json'), 'utf8')) as {
			'Content-Security-Policy': string;
		};
		expect(headers['Content-Security-Policy']).toContain("'self'");
		expect(headers['Content-Security-Policy']).not.toContain("'unsafe-inline'");
	});

	it('skips HTML injection when generateCsp is false', async () => {
		const plugin = cspVitePlugin({ generateCsp: false, emitHeadersFile: false });
		const html = '<html><head></head><body><script>console.log(1)</script></body></html>';
		const transform = plugin.transformIndexHtml;
		expect(transform).toBeTypeOf('function');
		const result = await (transform as (html: string) => Promise<string>)(html);
		expect(result).toBe(html);
	});
});
