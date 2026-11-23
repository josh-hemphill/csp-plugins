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
		const root = await mkdtemp(join(tmpdir(), 'csp-vite-disabled-'));
		await writeViteApp(root);
		await build({ root, logLevel: 'silent', plugins: [cspVitePlugin({ generateCsp: false })] });
		const output = await readFile(join(root, 'dist', 'index.html'), 'utf8');
		expect(output).not.toContain('Content-Security-Policy');
	});
});

it('keys multi-page headers by final HTML path and resets them on rebuild', async () => {
	const { createHash } = await import('node:crypto');
	const { rm } = await import('node:fs/promises');
	const root = await mkdtemp(join(tmpdir(), 'csp-vite-mpa-'));
	const plugin = cspVitePlugin();
	const index = join(root, 'index.html');
	const about = join(root, 'about.html');
	const output = join(root, 'dist', 'csp-headers.json');
	const html = (script: string) =>
		`<!doctype html><html><head></head><body><script>${script}</script></body></html>`;
	const hash = (script: string) =>
		`sha256-${createHash('sha256').update(script).digest('base64')}`;
	const run = (input: string[]) =>
		build({
			root,
			configFile: false,
			logLevel: 'silent',
			base: '/site/',
			plugins: [plugin],
			build: { rolldownOptions: { input } },
		});
	try {
		await writeFile(index, html('console.log("index")'));
		await writeFile(about, html('console.log("about")'));
		await run([index, about]);
		const initial = await readFile(output, 'utf8');
		const { routes } = JSON.parse(initial);
		expect(Object.keys(routes)).toEqual(['/site/about.html', '/site/index.html']);
		expect(routes['/site/index.html']['Content-Security-Policy']).toContain(
			hash('console.log("index")'),
		);
		expect(routes['/site/index.html']['Content-Security-Policy']).not.toContain(
			hash('console.log("about")'),
		);
		expect(routes['/site/about.html']['Content-Security-Policy']).toContain(
			hash('console.log("about")'),
		);
		expect(initial).not.toContain('nonce-');
		await run([index, about]);
		expect(await readFile(output, 'utf8')).toBe(initial);
		await rm(about);
		await writeFile(index, html('console.log("updated")'));
		await run([index]);
		const rebuilt = await readFile(output, 'utf8');
		expect(rebuilt).not.toContain('routes');
		expect(rebuilt).toContain(hash('console.log("updated")'));
		expect(rebuilt).not.toContain(hash('console.log("about")'));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('hashes assets copied from Vite public and protects its header file', async () => {
	const { createHash } = await import('node:crypto');
	const { mkdir, rm, symlink } = await import('node:fs/promises');
	const root = await mkdtemp(join(tmpdir(), 'csp-vite-public-'));
	const publicDir = join(root, 'public');
	await mkdir(publicDir);
	const sourceDir = join(root, 'linked-source');
	await mkdir(sourceDir);
	await symlink(sourceDir, join(publicDir, 'linked'), 'junction');
	const opts = {
		root,
		base: '/app/',
		logLevel: 'silent' as const,
		plugins: [
			cspVitePlugin({
				cspProcessorOptions: { externalSources: { hashing: { localScriptIntegrity: true } } },
			}),
		],
	};
	try {
		await writeFile(
			join(root, 'index.html'),
			'<!doctype html><html><head><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/app.css"></head><body><script src="/linked/app.js"></script></body></html>',
		);
		await writeFile(join(publicDir, 'app.css'), 'body{color:red}\r\n');
		await writeFile(join(sourceDir, 'app.js'), 'console.log("public asset")');
		await build(opts);
		const html = await readFile(join(root, 'dist', 'index.html'), 'utf8');
		for (const file of ['app.css', 'linked/app.js']) {
			const bytes = await readFile(join(root, 'dist', file));
			const hash = 'sha256-' + createHash('sha256').update(bytes).digest('base64');
			expect(html.split(hash)).toHaveLength(file.endsWith('.css') ? 4 : 3); // CSP meta plus every occurrence
		}
		await writeFile(join(publicDir, 'csp-headers.json'), '{}');
		await expect(build(opts)).rejects.toThrow(/CSP header output conflicts/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('rejects absolute header collisions and catches late changes to finalized HTML', async () => {
	const { rm } = await import('node:fs/promises');
	const root = await mkdtemp(join(tmpdir(), 'csp-vite-final-'));
	try {
		await writeViteApp(root);
		await expect(
			build({
				root,
				logLevel: 'silent',
				plugins: [cspVitePlugin({ emitHeadersFile: join(root, 'dist', 'index.html') })],
			}),
		).rejects.toThrow(/CSP header output conflicts/);
		await expect(
			build({
				root,
				logLevel: 'silent',
				plugins: [
					cspVitePlugin(),
					{
						name: 'late-html-change',
						enforce: 'post',
						generateBundle: {
							order: 'post',
							handler(_, bundle) {
								const html = bundle['index.html'];
								if (html.type === 'asset')
									html.source =
										String(html.source) + '<script>console.log("late")</script>';
							},
						},
					},
				],
			}),
		).rejects.toThrow(/after CSP processing/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
