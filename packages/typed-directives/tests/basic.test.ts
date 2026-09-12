import { Directives, ReportTo } from '../src/csp.types';
import { CspDirectives } from '../src/index';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

const sample64Hash = (algorithm: string) => {
	const hash = createHash(algorithm);
	hash.update('hello world');
	return hash.digest('base64');
};

describe('new CspDirectives()', () => {
	it('Instantiates', () => {
		const inst = vi.fn(() => new CspDirectives());
		const res = inst();
		expect(inst).toHaveBeenCalled();
		expect(inst).toHaveReturnedWith(res);
		expect(res).toMatchObject({
			CSP: {},
			ReportOnly: false,
			ReportTo: [],
			ReferrerHeader: 'strict-origin-when-cross-origin',
		});
	});
	it('Defaults Referer to deprecated referrer directive if present', () => {
		const inst = new CspDirectives({
			'referrer': 'strict-origin',
		});
		expect(inst.ReferrerHeader).toBe('strict-origin');
	});
	describe('.headers', () => {
		it('returns on empty', () => {
			const inst = new CspDirectives();
			const getHeaders = vi.spyOn(inst, 'getHeaders');
			const headers = inst.getHeaders();
			expect(getHeaders).toHaveReturned();
			expect(headers).toMatchObject({
				'Content-Security-Policy-Report-Only': '',
				'Content-Security-Policy': '',
				'Report-To': '',
				'Referrer-Policy': 'strict-origin-when-cross-origin',
			});
		});
		it('returns boolean directives', () => {
			const csp: Directives = {
				'upgrade-insecure-requests': true,
			};
			const inst = new CspDirectives(csp, [], csp);
			const getHeaders = vi.spyOn(inst, 'getHeaders');
			const headers = inst.getHeaders();
			expect(getHeaders).toHaveReturned();
			expect(headers).toMatchObject({
				'Content-Security-Policy-Report-Only': 'upgrade-insecure-requests;',
				'Content-Security-Policy': 'upgrade-insecure-requests;',
				'Report-To': '',
				'Referrer-Policy': 'strict-origin-when-cross-origin',
			});
		});
		it('returns on all set', () => {
			const sampleSha256 = `sha256-${sample64Hash('sha256')}` as const;
			const csp: Directives = {
				'child-src': 'none',
				'default-src': 'self',
				'frame-src': 'unsafe-eval',
				'connect-src': 'example.com',
				'font-src': 'https:',
				'img-src': 'self',
				'manifest-src': 'https://example.com',
				'media-src': sampleSha256,
				'object-src': 'example.com:443',
				'prefetch-src': sampleSha256,
				'script-src': 'strict-dynamic',
				'script-src-elem': sampleSha256,
				'script-src-attr': sampleSha256,
				'style-src': sampleSha256,
				'style-src-elem': sampleSha256,
				'style-src-attr': sampleSha256,
				'base-uri': 'strict-dynamic',
				'form-action': 'self',
				'frame-ancestors': 'self',
				'navigate-to': 'none',
				'report-to': 'hello',
				'referrer': 'strict-origin',
				'trusted-types': sampleSha256,
			};
			const endpoint = 'https://example.com' as const;
			const reportTo: ReportTo[] = [
				{
					max_age: 12000,
					group: 'hello',
					endpoints: [{ url: endpoint }],
				},
			];
			const inst = new CspDirectives(csp, reportTo, csp, 'strict-origin');
			const getHeaders = vi.spyOn(inst, 'getHeaders');
			const headers = inst.getHeaders();
			expect(getHeaders).toHaveReturned();
			expect(headers['Content-Security-Policy-Report-Only']).toMatchInlineSnapshot(`"child-src 'none'; default-src 'self'; frame-src 'unsafe-eval'; connect-src example.com; font-src https:; img-src 'self'; manifest-src https://example.com; media-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; object-src example.com:443; prefetch-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; script-src 'strict-dynamic'; script-src-elem 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; script-src-attr 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src-elem 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src-attr 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; base-uri 'strict-dynamic'; form-action 'self'; frame-ancestors 'self'; navigate-to 'none'; report-to hello; referrer 'strict-origin'; trusted-types 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=';"`);
			expect(headers['Content-Security-Policy']).toMatchInlineSnapshot(`"child-src 'none'; default-src 'self'; frame-src 'unsafe-eval'; connect-src example.com; font-src https:; img-src 'self'; manifest-src https://example.com; media-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; object-src example.com:443; prefetch-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; script-src 'strict-dynamic'; script-src-elem 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; script-src-attr 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src-elem 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; style-src-attr 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='; base-uri 'strict-dynamic'; form-action 'self'; frame-ancestors 'self'; navigate-to 'none'; report-to hello; referrer 'strict-origin'; trusted-types 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=';"`);
			expect(headers['Report-To']).toMatchInlineSnapshot(`"[{"max_age":12000,"group":"hello","endpoints":[{"url":"https://example.com"}]}]"`);
			expect(headers['Referrer-Policy']).toMatchInlineSnapshot(`"strict-origin"`);
		});
		it('Throws on invalid "report-to" group name', () => {
			const inst = new CspDirectives({
				'report-to': 'invalid',
			});
			vi.spyOn(inst, 'getHeaders');
			try {
				inst.getHeaders();
			} catch (_) {
				(() => '')();
			}
			expect(inst.getHeaders).toThrow();
		});
	});
});
