import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const cli = fileURLToPath(new URL('./dist/cli.mjs', import.meta.url));
const hash = (bytes: string | Uint8Array) =>
	`sha256-${createHash('sha256').update(bytes).digest('base64')}`;
const page = (title: string) =>
	`<!doctype html><html><head><link rel="stylesheet" href="./app.css?t=1"></head><body><script>console.log("${title}")</script><script src="./app.js"></script></body></html>`;

it('processes final static bytes and emits route policies beside the correct configuration', async () => {
	const root = await mkdtemp(join(tmpdir(), 'csp-cli-routes-'));
	const input = join(root, 'input');
	const out = join(root, 'publish');
	const originalVercel = {
		cleanUrls: false,
		headers: [
			{
				source: '/private',
				has: [{ type: 'header', key: 'x-test' }],
				headers: [{ key: 'X-Fixture', value: 'yes' }],
			},
		],
	};
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
	await mkdir(join(input, 'about'), { recursive: true });
	await writeFile(join(root, 'vercel.json'), JSON.stringify(originalVercel));
	try {
		for (const [dir, title] of [
			[input, 'home'],
			[join(input, 'about'), 'about'],
		]) {
			await writeFile(join(dir, 'index.html'), page(title));
			await writeFile(join(dir, 'app.js'), `console.log("${title}-external")`);
			await writeFile(join(dir, 'app.css'), `/* ${title} */\r\nbody { color: red }`);
		}
		const result = run(
			'input',
			'--output-dir',
			'publish',
			'--local-script-integrity',
			'--emit',
			'netlify,vercel',
		);
		expect(result.stderr).not.toContain('Cannot generate');
		expect(result.status).toBe(0);
		const { routes } = JSON.parse(await readFile(join(out, 'csp-headers.json'), 'utf8'));
		expect(Object.keys(routes)).toEqual(['/about/index.html', '/index.html']);
		for (const [dir, route] of [
			[out, '/index.html'],
			[join(out, 'about'), '/about/index.html'],
		]) {
			const html = await readFile(join(dir, 'index.html'), 'utf8');
			for (const name of ['app.js', 'app.css']) {
				const integrity = hash(await readFile(join(dir, name)));
				expect(html).toContain(`integrity="${integrity}"`);
				expect(routes[route]['Content-Security-Policy']).toContain(integrity);
			}
		}
		const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
		expect(vercel.headers[0]).toEqual(originalVercel.headers[0]);
		expect(vercel.headers.map((rule: { source: string }) => rule.source)).toContain('/about/');
		expect(await readFile(join(out, '_headers'), 'utf8')).toContain('/about/index.html');
		expect(await readFile(join(input, 'index.html'), 'utf8')).toBe(page('home'));
		expect(run('input', '--emit', 'constructor').status).toBe(1);
		await rm(join(input, 'about'), { recursive: true });
		await writeFile(join(input, 'app.js'), 'console.log("updated")');
		const stale = run('input', '--output-dir', 'publish', '--emit', 'vercel');
		expect(stale.status).toBe(1);
		expect(stale.stderr).toContain('old HTML page');
		await rm(out, { recursive: true });
		const next = run(
			'input',
			'--output-dir',
			'publish',
			'--local-script-integrity',
			'--emit',
			'vercel',
		);
		expect(next.status).toBe(0);
		const nextHeaders = await readFile(join(out, 'csp-headers.json'), 'utf8');
		expect(nextHeaders).toContain(hash('console.log("updated")'));
		expect(nextHeaders).not.toContain('routes');
		const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
		expect(config.headers).toHaveLength(2);
		expect(config.headers[0]).toEqual(originalVercel.headers[0]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('validates malformed host configuration before rewriting HTML or creating outputs', async () => {
	const root = await mkdtemp(join(tmpdir(), 'csp-cli-invalid-config-'));
	const input = join(root, 'dist');
	await mkdir(input);
	await writeFile(join(input, 'index.html'), page('home'));
	await writeFile(join(root, 'vercel.json'), '{');
	try {
		const result = spawnSync(process.execPath, [cli, 'dist', '--emit', 'netlify,vercel'], {
			cwd: root,
			encoding: 'utf8',
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Cannot generate vercel headers');
		expect(await readFile(join(input, 'index.html'), 'utf8')).toBe(page('home'));
		await expect(readFile(join(input, '_headers'))).rejects.toThrow(/ENOENT/);
		await expect(readFile(join(input, 'csp-headers.json'))).rejects.toThrow(/ENOENT/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('keeps authored policies, unrelated JSON headers, and the configured output on rerun', async () => {
	const root = await mkdtemp(join(tmpdir(), 'csp-cli-owned-output-'));
	const dist = join(root, 'dist');
	await mkdir(dist);
	const authored = page('authored').replace(
		'<head>',
		`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'">`,
	);
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, 'dist', ...args], { cwd: root, encoding: 'utf8' });
	try {
		await writeFile(join(dist, 'index.html'), authored);
		await writeFile(join(dist, 'custom.json'), JSON.stringify({ 'X-Frame-Options': 'DENY' }));
		for (let runIndex = 0; runIndex < 2; runIndex++) {
			expect(run('--headers-output', 'dist/custom.json').status).toBe(0);
			expect(await readFile(join(dist, 'index.html'), 'utf8')).toBe(authored);
			expect(JSON.parse(await readFile(join(dist, 'custom.json'), 'utf8'))).toMatchObject({
				'Content-Security-Policy': "default-src 'none'; script-src 'none'",
				'X-Frame-Options': 'DENY',
			});
		}
		await writeFile(
			join(root, 'vercel.json'),
			JSON.stringify({
				headers: [
					{
						source: '/(.*)',
						headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'" }],
					},
				],
			}),
		);
		const conflict = run('--emit', 'vercel');
		expect(conflict.status).toBe(1);
		expect(conflict.stderr).toContain('overlaps');
		expect(await readFile(join(dist, 'index.html'), 'utf8')).toBe(authored);
		expect(run('--no-html', '--local-script-integrity').status).toBe(1);
		const badParent = join(root, 'blocked');
		await writeFile(badParent, 'not a directory');
		expect(
			run('--replace-existing', '--headers-output', join(badParent, 'headers.json')).status,
		).toBe(1);
		expect(await readFile(join(dist, 'index.html'), 'utf8')).toBe(authored);
		expect(run('--replace-existing', '--headers-output', 'dist/custom.json').status).toBe(0);
		expect(await readFile(join(dist, 'index.html'), 'utf8')).toContain('data-csp-plugins="cli"');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('selects CSP options from the manifest for the requested build only', async () => {
	const root = await mkdtemp(join(tmpdir(), 'csp-cli-manifest-selection-'));
	const dir = join(root, '.csp-manifest');
	await mkdir(dir);
	try {
		for (const name of ['one', 'two']) {
			await mkdir(join(root, name));
			await writeFile(join(root, name, 'index.html'), page(name));
			await writeFile(
				join(dir, name + '.json'),
				JSON.stringify({
					buildTool: 'vite',
					buildTime: Date.now(),
					outputDir: name,
					assets: [],
					cspProcessorOptions: {
						baseDirectives: { CSP: { 'script-src': [`https://${name}.invalid`] } },
					},
				}),
			);
		}
		const result = spawnSync(process.execPath, [cli, 'two'], { cwd: root, encoding: 'utf8' });
		expect(result.status).toBe(0);
		const headers = await readFile(join(root, 'two', 'csp-headers.json'), 'utf8');
		expect(headers).toContain('https://two.invalid');
		expect(headers).not.toContain('https://one.invalid');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
