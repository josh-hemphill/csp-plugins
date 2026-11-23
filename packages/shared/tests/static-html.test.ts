import { expect, it, vi } from 'vitest';

import { processStaticHtml } from '../src/static-html.ts';

it('respects explicit asset exclusions while preserving authored CSP', async () => {
	const html =
		'<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head><body><script src="/app.js"></script></body></html>';
	const readAsset = vi.fn(async () => 'console.log("fixture")');
	const result = await processStaticHtml(
		html,
		'/index.html',
		{
			externalSources: {
				hashing: { scripts: true, localScriptIntegrity: true, excludePatterns: ['app.js'] },
			},
		},
		readAsset,
		{ owner: 'vite' },
	);
	expect(result.html).toBe(html);
	expect(readAsset).not.toHaveBeenCalled();
});
