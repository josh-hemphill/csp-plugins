import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateHash, isHashSource, toHashSource } from '../lib/crypto.ts';

function nodeDigest(content: string, algorithm: 'sha256' | 'sha384' | 'sha512'): string {
	return createHash(algorithm).update(content, 'utf8').digest('base64');
}

describe('hash source contract', () => {
	it('generateHash returns sha256-<base64> and does not double-prefix', async () => {
		const hash = await generateHash('hello world', 'sha256');
		const digest = nodeDigest('hello world', 'sha256');
		expect(hash).toBe(`sha256-${digest}`);
		expect(isHashSource(hash)).toBe(true);
		expect(hash.startsWith('sha256-sha256-')).toBe(false);
	});

	it('generateHash supports sha384 and sha512 prefixes', async () => {
		const sha384 = await generateHash('hello', 'sha384');
		const sha512 = await generateHash('hello', 'sha512');
		expect(sha384).toBe(`sha384-${nodeDigest('hello', 'sha384')}`);
		expect(sha512).toBe(`sha512-${nodeDigest('hello', 'sha512')}`);
	});

	it('rejects nonce as a hash algorithm', async () => {
		await expect(generateHash('hello', 'nonce')).rejects.toThrow(/sha256, sha384, or sha512/);
	});

	it('isHashSource accepts strict CSP hashes and rejects raw base64', () => {
		expect(isHashSource('uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=')).toBe(false);
		expect(isHashSource('sha256-abc=')).toBe(true);
	});

	it('toHashSource is idempotent for an already-prefixed source', () => {
		const source = 'sha256-abc+def=';
		expect(toHashSource(source, 'sha256')).toBe(source);
		expect(toHashSource(source, 'sha512')).toBe(source);
	});

	it('toHashSource prefixes a raw digest', () => {
		expect(toHashSource('abc+def=', 'sha256')).toBe('sha256-abc+def=');
	});

	it('toHashSource does not double-prefix a sha256- value that is not strict base64', () => {
		const custom = 'sha256-custom-hash-12-script';
		expect(toHashSource(custom, 'sha256')).toBe(custom);
	});
});
