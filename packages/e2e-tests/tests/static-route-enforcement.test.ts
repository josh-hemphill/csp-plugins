import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { launchBrowser } from '../src/puppeteer-utils.js';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../../cli/dist/cli.mjs', import.meta.url));

it('serves each generated route policy and blocks an unlisted inline script', async () => {
	const root = await mkdtemp(join(tmpdir(), 'csp-browser-routes-'));
	const script = 'document.body.dataset.external = "yes"';
	const integrity = 'sha384-' + createHash('sha384').update(script).digest('base64');
	await writeFile(join(root, 'entry.js'), script);
	for (const page of ['index', 'about']) {
		await writeFile(
			join(root, page + '.html'),
			`<!doctype html><html><title>${page}</title><template><meta http-equiv="Content-Security-Policy" content="script-src 'none'"></template><body><script>document.body.dataset.allowed = "${page}"</script><script src="/entry.js" integrity="${integrity}"></script></body></html>`,
		);
	}
	await writeFile(
		join(root, 'policy.json'),
		JSON.stringify({ 'script-src': ['https://unused.invalid'] }),
	);
	await run(
		process.execPath,
		[cli, root, '--csp-policy-file', join(root, 'policy.json'), '--local-script-integrity'],
		{ cwd: root },
	);
	// A headers-only deploy must reproduce the same policy as the processed HTML.
	await run(process.execPath, [cli, root, '--no-html'], { cwd: root });
	const { routes } = JSON.parse(await readFile(join(root, 'csp-headers.json'), 'utf8'));
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const path = url.pathname;
		if (path === '/entry.js') {
			res.setHeader('Content-Type', 'text/javascript');
			res.end(script);
			return;
		}
		if (path !== '/index.html' && path !== '/about.html') {
			res.writeHead(404).end();
			return;
		}
		const html = await readFile(join(root, path.slice(1)), 'utf8');
		res.setHeader('Content-Type', 'text/html');
		if (url.searchParams.has('header'))
			res.setHeader('Content-Security-Policy', routes[path]['Content-Security-Policy']);
		res.end(
			html.replace('</body>', '<script>document.body.dataset.forbidden = "yes"</script></body>'),
		);
	});
	const browser = await launchBrowser();
	try {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
		const page = await browser.newPage();
		for (const route of ['index', 'about']) {
			for (const suffix of ['', '?header']) {
				await page.goto(`http://127.0.0.1:${address.port}/${route}.html${suffix}`, {
					waitUntil: 'load',
				});
				expect(await page.evaluate(() => document.body.dataset.allowed)).toBe(route);
				expect(await page.evaluate(() => document.compatMode)).toBe('CSS1Compat');
				expect(await page.evaluate(() => document.body.dataset.external)).toBe('yes');
				expect(await page.evaluate(() => document.body.dataset.forbidden)).toBeUndefined();
			}
		}
	} finally {
		await browser.close();
		server.close();
		await rm(root, { recursive: true, force: true });
	}
});
