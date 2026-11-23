import type { CspDirectiveHeaders } from '@csp-plugins/typed-directives';
import { describe, expect, it } from 'vitest';

import {
	adapters,
	emitAdapter,
	getAdapter,
	mergeStaticHeaders,
	mergeStructuredStaticHeaders,
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

describe('static host configuration', () => {
	it('keeps unrelated Vercel metadata and removes only previous generated rules', () => {
		const original = {
			cleanUrls: false,
			headers: [
				{
					source: '/conditional',
					has: [{ type: 'header', key: 'accept' }],
					headers: [{ key: 'X-Fixture', value: '1' }],
				},
				{ source: '/old.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
			],
		};
		const previous = { routes: { '/index.html': fixture, '/old.html': fixture } };
		const generated = mergeStaticHeaders('vercel', JSON.stringify(original), previous);
		const next = { routes: { '/index.html': fixture, '/new.html': fixture } };
		const rebuilt = JSON.parse(
			mergeStaticHeaders('vercel', generated, next, undefined, previous),
		);
		expect(rebuilt.headers[0]).toEqual(original.headers[0]);
		expect(
			rebuilt.headers.find((rule: { source: string }) => rule.source === '/old.html'),
		).toEqual(original.headers[1]);
		expect(rebuilt.headers.map((rule: { source: string }) => rule.source)).toContain('/new.html');
	});

	it('keeps Firebase regex rules and unrelated sites', () => {
		const hosting = [
			{
				target: 'docs',
				public: 'docs-dist',
				rewrites: [{ source: '**', destination: '/index.html' }],
			},
			{
				target: 'app',
				public: 'dist',
				headers: [{ regex: '/api/.*', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }],
			},
		];
		const previous = JSON.stringify({ hosting, functions: { source: 'functions' } });
		const next = JSON.parse(
			mergeStaticHeaders(
				'firebase',
				previous,
				{ routes: { '/docs/index.html': fixture } },
				{ publicDir: 'dist' },
			),
		);
		expect(next.hosting[0]).toEqual(hosting[0]);
		expect(next.hosting[1].headers[0]).toEqual(hosting[1].headers?.[0]);
		expect(next.hosting[1].headers.map((rule: { source?: string }) => rule.source)).toContain(
			'/docs/',
		);
		expect(next.functions.source).toBe('functions');
		expect(() =>
			mergeStaticHeaders('firebase', previous, fixture, { publicDir: 'missing' }),
		).toThrow(/exactly one/);
	});

	it.each(['netlify', 'cloudflare-pages'] as const)(
		'replaces a %s route block and preserves hand-written rules',
		(id) => {
			const unrelated = '# handwritten\n/assets/*\n  Cache-Control: public, max-age=3600\n';
			const first = mergeStaticHeaders(id, unrelated, {
				routes: { '/old.html': fixture, '/index.html': fixture },
			});
			const rebuilt = mergeStaticHeaders(id, first, {
				routes: { '/new.html': fixture, '/index.html': fixture },
			});
			expect(rebuilt).toContain(unrelated);
			expect(rebuilt).not.toContain('/old.html');
			expect(rebuilt).toContain('/new.html');
			expect(rebuilt.match(/# csp-plugins headers begin/g)).toHaveLength(1);
			expect(() =>
				mergeStaticHeaders(id, '/*\n  content-security-policy: default-src none\n', {
					routes: { '/one.html': fixture },
				}),
			).toThrow(/overlaps/);
		},
	);

	it('runs the generated Express middleware', async () => {
		const source = emitAdapter('express', fixture);
		const { cspHeaders } = await import('data:text/javascript,' + encodeURIComponent(source));
		const response = new Map<string, string>();
		let called = false;
		cspHeaders(
			{},
			{ setHeader: (name: string, value: string) => response.set(name, value) },
			() => {
				called = true;
			},
		);
		expect(Object.fromEntries(response)).toEqual(Object.fromEntries(presentHeaders(fixture)));
		expect(called).toBe(true);
	});
});

it('rejects a wrong Firebase destination and an unmanaged Vercel catch-all policy', () => {
	const firebase = JSON.stringify({ hosting: { public: 'other' } });
	expect(() => mergeStaticHeaders('firebase', firebase, fixture, { publicDir: 'dist' })).toThrow(
		/selected output directory/,
	);
	const vercel = JSON.stringify({
		headers: [
			{
				source: '/(.*)',
				headers: [{ key: 'content-security-policy', value: "default-src 'none'" }],
			},
		],
	});
	expect(() => mergeStaticHeaders('vercel', vercel, fixture)).toThrow(/overlaps/);
});

it('covers Cloudflare Pages clean URLs and validates the total rule count', () => {
	const pages = { routes: { '/about.html': fixture, '/index.html': fixture } };
	const output = mergeStaticHeaders('cloudflare-pages', '', pages);
	expect(output).toMatch(/^\/about$/m);
	const existing = Array.from(
		{ length: 99 },
		(_, i) => `/asset/${i}\n  Cache-Control: no-cache`,
	).join('\n\n');
	expect(() => mergeStaticHeaders('cloudflare-pages', existing, pages)).toThrow(/100-rule/);
});

it.each(['cloudflare-pages', 'netlify'] as const)('rejects an ambiguous %s clean URL', (id) => {
	const routes = {
		'/about.html': fixture,
		'/about.html.html': { ...fixture, 'Content-Security-Policy': "script-src 'none'" },
	};
	expect(() => mergeStaticHeaders(id, '', { routes })).toThrow(/conflicts.*\/about\.html/);
});

it('covers configured Vercel canonical paths and rejects an unrelated project output', () => {
	const routes = { '/about.html': fixture, '/news/index.html': fixture };
	const current = JSON.stringify({
		outputDirectory: 'dist/',
		cleanUrls: true,
		trailingSlash: false,
	});
	const merged = JSON.parse(
		mergeStaticHeaders('vercel', current, { routes }, { publicDir: 'dist' }),
	);
	expect(merged.headers.map((rule: { source: string }) => rule.source)).toEqual(
		expect.arrayContaining(['/about', '/news']),
	);
	expect(() => mergeStaticHeaders('vercel', current, { routes }, { publicDir: 'other' })).toThrow(
		/selected output directory/,
	);
});

it('retains other response headers in existing JSON route maps', () => {
	const existing = JSON.stringify({
		'X-Frame-Options': 'DENY',
		routes: {
			'/index.html': { 'Cache-Control': 'no-store' },
			'/old.html': { 'X-Other': 'keep' },
		},
	});
	const merged = JSON.parse(
		mergeStaticHeaders('json', existing, { routes: { '/index.html': fixture } }),
	);
	expect(merged).toMatchObject({
		'X-Frame-Options': 'DENY',
		routes: {
			'/index.html': { 'Cache-Control': 'no-store', ...fixture },
			'/old.html': { 'X-Other': 'keep' },
		},
	});
	expect(() => mergeStaticHeaders('json', existing, fixture)).toThrow(
		/user-managed route headers/,
	);
});

it('removes old Vercel aliases after routing settings change and preserves authored auxiliary headers', () => {
	const existing = JSON.stringify({
		cleanUrls: true,
		trailingSlash: false,
		headers: [
			{
				source: '/other.html',
				headers: [
					{ key: 'Referrer-Policy', value: 'no-referrer' },
					{ key: 'Report-To', value: '{"group":"user","max_age":60}' },
				],
			},
		],
	});
	const initial = mergeStructuredStaticHeaders('vercel', existing, {
		routes: { '/about.html': fixture, '/news/index.html': fixture, '/other.html': fixture },
	});
	const nextInput = { ...JSON.parse(initial.body), cleanUrls: false, trailingSlash: true };
	const next = mergeStructuredStaticHeaders(
		'vercel',
		JSON.stringify(nextInput),
		{
			routes: { '/other.html': fixture, '/new.html': fixture },
		},
		undefined,
		initial.ownership,
	);
	const config = JSON.parse(next.body);
	const sources = config.headers.map((rule: { source: string }) => rule.source);
	expect(sources).not.toContain('/about');
	expect(sources).not.toContain('/news');
	const other = config.headers.find((rule: { source: string }) => rule.source === '/other.html');
	expect(other.headers).toEqual(
		expect.arrayContaining([
			{ key: 'Referrer-Policy', value: 'no-referrer' },
			{ key: 'Report-To', value: '{"group":"user","max_age":60}' },
		]),
	);
	expect(
		other.headers.filter((header: { key: string }) => header.key === 'Referrer-Policy'),
	).toHaveLength(1);
});

it('covers both default Vercel directory URLs', () => {
	const merged = JSON.parse(
		mergeStaticHeaders('vercel', '{}', { routes: { '/docs/index.html': fixture } }),
	);
	expect(merged.headers.map((rule: { source: string }) => rule.source)).toEqual(
		expect.arrayContaining(['/docs', '/docs/']),
	);
});
