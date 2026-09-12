import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';
import { describe, expect, it } from 'vitest';

import {
	adapters,
	emitAdapter,
	getAdapter,
	isAdapterId,
	parseAdapterIds,
	presentHeaders,
} from '../src/index.ts';

const fixture: CspDirectiveHeaders = {
	'Content-Security-Policy': "script-src 'self'; style-src 'self'",
	'Content-Security-Policy-Report-Only': '',
	'Report-To': '',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
};

describe('header adapters', () => {
	it('omits empty header values', () => {
		expect(presentHeaders(fixture)).toEqual([
			['Content-Security-Policy', "script-src 'self'; style-src 'self'"],
			['Referrer-Policy', 'strict-origin-when-cross-origin'],
		]);
	});

	it('round-trips the json adapter', () => {
		const json = getAdapter('json').emit(fixture);
		expect(json).toEqual({
			'Content-Security-Policy': "script-src 'self'; style-src 'self'",
			'Referrer-Policy': 'strict-origin-when-cross-origin',
		});
		const merged = getAdapter('json').merge(
			JSON.stringify({ 'X-Frame-Options': 'DENY', 'Report-To': 'stale' }),
			fixture,
		);
		expect(JSON.parse(merged)).toEqual({
			'X-Frame-Options': 'DENY',
			'Content-Security-Policy': "script-src 'self'; style-src 'self'",
			'Referrer-Policy': 'strict-origin-when-cross-origin',
		});
	});

	it('emits netlify _headers and merges CSP keys only', () => {
		const emitted = emitAdapter('netlify', fixture);
		expect(emitted).toBe(`/*
  Content-Security-Policy: script-src 'self'; style-src 'self'
  Referrer-Policy: strict-origin-when-cross-origin
`);

		const existing = `/*
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer

/api/*
  Access-Control-Allow-Origin: *
`;
		const merged = getAdapter('netlify').merge(existing, fixture);
		expect(merged).toContain('X-Frame-Options: DENY');
		expect(merged).toContain("Content-Security-Policy: script-src 'self'; style-src 'self'");
		expect(merged).toContain('Referrer-Policy: strict-origin-when-cross-origin');
		expect(merged).not.toContain('Referrer-Policy: no-referrer');
		expect(merged).toContain('/api/*');
		expect(merged).toContain('Access-Control-Allow-Origin: *');
	});

	it('emits vercel.json and merges unrelated headers', () => {
		const emitted = JSON.parse(emitAdapter('vercel', fixture)) as {
			headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
		};
		expect(emitted.headers[0]?.source).toBe('/(.*)');
		expect(emitted.headers[0]?.headers).toEqual([
			{
				key: 'Content-Security-Policy',
				value: "script-src 'self'; style-src 'self'",
			},
			{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
		]);

		const merged = JSON.parse(
			getAdapter('vercel').merge(
				JSON.stringify({
					rewrites: [{ source: '/app', destination: '/' }],
					headers: [
						{
							source: '/(.*)',
							headers: [
								{ key: 'X-Frame-Options', value: 'DENY' },
								{ key: 'Referrer-Policy', value: 'no-referrer' },
							],
						},
					],
				}),
				fixture,
			),
		) as {
			rewrites: unknown;
			headers: Array<{ headers: Array<{ key: string; value: string }> }>;
		};
		expect(merged.rewrites).toEqual([{ source: '/app', destination: '/' }]);
		expect(merged.headers[0]?.headers).toEqual([
			{ key: 'X-Frame-Options', value: 'DENY' },
			{
				key: 'Content-Security-Policy',
				value: "script-src 'self'; style-src 'self'",
			},
			{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
		]);
	});

	it('emits firebase hosting headers', () => {
		const emitted = JSON.parse(emitAdapter('firebase', fixture)) as {
			hosting: { headers: Array<{ source: string }> };
		};
		expect(emitted.hosting.headers[0]?.source).toBe('**');
	});

	it('emits nginx, apache, caddy, and express snippets with merge markers', () => {
		expect(emitAdapter('nginx', fixture)).toContain('add_header Content-Security-Policy');
		expect(emitAdapter('nginx', fixture)).toContain('# csp-plugins begin');
		expect(emitAdapter('apache', fixture)).toContain('Header always set Content-Security-Policy');
		expect(emitAdapter('caddy', fixture)).toContain('header {');
		expect(emitAdapter('express', fixture)).toContain('res.setHeader');
		expect(emitAdapter('express', fixture)).toContain('next()');

		const mergedNginx = getAdapter('nginx').merge(
			`${emitAdapter('nginx', fixture)}proxy_pass http://app;`,
			{
				...fixture,
				'Referrer-Policy': 'no-referrer',
			},
		);
		expect(mergedNginx).toContain('Referrer-Policy "no-referrer"');
		expect(mergedNginx).toContain('proxy_pass http://app;');
		expect(mergedNginx.match(/# csp-plugins begin/g)).toHaveLength(1);
	});

	it('treats cloudflare-pages as netlify _headers', () => {
		expect(emitAdapter('cloudflare-pages', fixture)).toBe(emitAdapter('netlify', fixture));
		expect(getAdapter('cloudflare-pages').fileName).toBe('_headers');
	});

	it('parses adapter ids and rejects unknowns', () => {
		expect(parseAdapterIds('netlify, vercel')).toEqual(['netlify', 'vercel']);
		expect(isAdapterId('nginx')).toBe(true);
		expect(isAdapterId('iis')).toBe(false);
		expect(() => parseAdapterIds('netlify,nope')).toThrow(/Unknown header adapter/);
	});

	it('exposes every planned adapter id', () => {
		expect(Object.keys(adapters).toSorted()).toEqual(
			[
				'apache',
				'caddy',
				'cloudflare-pages',
				'express',
				'firebase',
				'json',
				'netlify',
				'nginx',
				'vercel',
			].toSorted(),
		);
	});
});
