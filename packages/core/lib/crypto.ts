import type { ValidCrypto } from '@csp-plugins/typed-directives/csp.types';
import { validHashes, type ValidHashes } from '@csp-plugins/typed-directives/csp.types';

export type HashAlgorithm = ValidHashes;
export type HashSource = `${HashAlgorithm}-${string}`;

const HASH_SOURCE_PATTERN = /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+=*$/;
const HASH_PREFIX_PATTERN = /^(sha256|sha384|sha512)-/;

/** Return true when a string is already a CSP hash source (`sha256-<b64>`). */
export function isHashSource(value: string): value is HashSource {
	return HASH_SOURCE_PATTERN.test(value);
}

/** Return true when a string already has a `sha256|sha384|sha512-` prefix. */
export function hasHashPrefix(value: string): boolean {
	return HASH_PREFIX_PATTERN.test(value);
}

/** Prefix a raw digest, or return an existing `sha256|sha384|sha512-` source unchanged. */
export function toHashSource(value: string, algorithm: HashAlgorithm = 'sha256'): HashSource {
	if (HASH_PREFIX_PATTERN.test(value)) {
		return value as HashSource;
	}
	return `${algorithm}-${value}`;
}

function isHashAlgorithm(algorithm: ValidCrypto): algorithm is HashAlgorithm {
	return (validHashes as readonly string[]).includes(algorithm);
}

async function digestBase64(content: string, algorithm: HashAlgorithm): Promise<string> {
	if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const algoName = String.prototype.toUpperCase.call(algorithm).replace('SHA', 'SHA-');
		const hashBuffer = await crypto.subtle.digest(algoName, data);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray));
	}

	try {
		const nodeCrypto = await import('node:crypto');
		return nodeCrypto.createHash(algorithm).update(content, 'utf8').digest('base64');
	} catch {
		throw new Error('Hash generation not supported in this environment');
	}
}

/**
 * Default nonce generator using crypto.randomBytes
 */
export async function generateNonce(): Promise<string> {
	// Use Node.js crypto in Node environment, Web Crypto API in browser
	if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	}

	// Fallback for Node.js - use dynamic import
	try {
		const nodeCrypto = await import('node:crypto');
		return nodeCrypto.randomBytes(16).toString('base64');
	} catch {
		console.warn('Crypto API is not available in this environment');
		console.warn('Falling back to Math.random()');
		// Ultimate fallback
		return (
			Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
		);
	}
}

/**
 * Generate a CSP hash source (`sha256-<base64>`) for content.
 */
export async function generateHash(content: string, algorithm: ValidCrypto): Promise<HashSource> {
	if (!isHashAlgorithm(algorithm)) {
		throw new Error(`generateHash requires sha256, sha384, or sha512, received ${algorithm}`);
	}
	const digest = await digestBase64(content, algorithm);
	return toHashSource(digest, algorithm);
}
