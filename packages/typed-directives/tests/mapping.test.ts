import { describe, it, expect } from 'vitest';

import {
	DirectiveMap,
	type DirectiveName,
	type DirectiveResult,
	type ReportTos,
} from '../src/index.js';

function isObject(obj: unknown): obj is Record<PropertyKey, unknown> {
	return Object.prototype.toString.call(obj) === '[object Object]';
}
function hasOwnProperty<T>(obj: T, prop: PropertyKey): prop is keyof T {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

describe('DirectiveMap.get()', () => {
	it('exports named types for map entries and Report-To', () => {
		const name: DirectiveName = 'report-to';
		const entry: DirectiveResult | undefined = DirectiveMap.get(name);
		expect(entry).toBeDefined();
		expect(entry?.categories).toContain('primitiveSourceString');
		const reportTo: ReportTos = [];
		expect(Array.isArray(reportTo)).toBe(true);
	});

	describe('Dynamic Options', () => {
		it('Handles Hostname/URL Source', () => {
			const src = DirectiveMap.get('child-src');
			let result1: unknown = '';
			let result2: unknown = '';
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'Hostname/URL Source'
				) {
					result1 = item.compose?.({
						Hostname: 'example.com',
						Port: 443,
						Protocol: 'https://',
					});
				}
			}
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'Hostname/URL Source'
				) {
					result2 = item.compose?.({});
				}
			}
			expect(result1).toBe('https://example.com:443');
			expect(result2).toBe('');
		});
		it('Crypto Nonce/Hash Source', () => {
			const src = DirectiveMap.get('child-src');
			let result: unknown = '';
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'Crypto Nonce/Hash Source'
				) {
					result = item.compose?.({
						Algorithm: 'sha256',
						Hash: 'SomeBase64String',
					});
				}
			}
			expect(result).toBe('sha256-SomeBase64String');
		});
		it('Handles URI Source', () => {
			const src = DirectiveMap.get('report-uri');
			let result: unknown = '';
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'URI Source'
				) {
					result = item.compose?.({
						'Beginning Delineator': '/',
						'Remaining Path': 'send/reports/to',
					});
				}
			}
			expect(result).toBe('/send/reports/to');
		});
		it('Handles Plugin MIME Type Source', () => {
			const src = DirectiveMap.get('plugin-types');
			let result: unknown = '';
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'Plugin MIME Type Source'
				) {
					result = item.compose?.({
						'MIME Category': 'application',
						'MIME Implementation': 'xml',
					});
				}
			}
			expect(result).toBe('application/xml');
		});
		it('Handles Any String', () => {
			const src = DirectiveMap.get('report-to');
			let result: unknown = '';
			for (const item of src?.values || []) {
				if (
					isObject(item) &&
					hasOwnProperty(item, 'displayName') &&
					item.displayName === 'Any String'
				) {
					result = item.compose?.({
						String: 'hello world',
					});
				}
			}
			expect(result).toBe('hello world');
		});
	});
});
