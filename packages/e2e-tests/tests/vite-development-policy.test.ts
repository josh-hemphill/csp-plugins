import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import csp from '@csp-plugins/unplugin/vite';
import { expect, it } from 'vitest';

import { launchBrowser } from '../src/puppeteer-utils.js';

it('lets a development-only policy permit Vite style injection and its WebSocket', async () => {
	const fromVite = createRequire(new URL('../../unplugin/package.json', import.meta.url));
	const { createServer } = await import(pathToFileURL(fromVite.resolve('vite')).href);
	const root = await mkdtemp(join(tmpdir(), 'csp-vite-development-'));
	await writeFile(
		join(root, 'index.html'),
		'<!doctype html><html><head></head><body><script type="module" src="/index.js"></script></body></html>',
	);
	await writeFile(join(root, 'index.js'), 'import "./style.css"');
	await writeFile(join(root, 'style.css'), 'body{color:rgb(5,17,31)}');
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		server: { host: '127.0.0.1', port: 0 },
		plugins: [
			csp({
				devServer: true,
				devCspProcessorOptions: {
					enableHashes: false,
					baseDirectives: {
						CSP: {
							'script-src': ['self', 'unsafe-inline'],
							'style-src': ['self', 'unsafe-inline'],
							'connect-src': ['self', 'ws:'],
						},
					},
				},
			}),
		],
	});
	const browser = await launchBrowser();
	try {
		await server.listen();
		const address = server.httpServer.address();
		const page = await browser.newPage();
		let connected = false;
		page.on('console', (message) => {
			if (message.text().includes('[vite] connected.')) connected = true;
		});
		await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'load' });
		await expect.poll(() => connected, { timeout: 5000 }).toBe(true);
		await page.waitForFunction(() => getComputedStyle(document.body).color === 'rgb(5, 17, 31)');
		expect(
			await page.evaluate(
				() => document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null,
			),
		).toBe(true);
	} finally {
		await browser.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
