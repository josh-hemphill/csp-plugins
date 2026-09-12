import type { ValidCrypto } from '@csp-plugins/typed-directives/csp.types';

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
 * Generate hash for content
 */
export async function generateHash(content: string, algorithm: ValidCrypto): Promise<string> {
	if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
		// Web Crypto API - use correct algorithm names
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const algoName = String.prototype.toUpperCase.call(algorithm).replace('SHA', 'SHA-'); // Convert 'sha256' to 'SHA-256'
		const hashBuffer = await crypto.subtle.digest(algoName, data);
		const hashArray = new Uint8Array(hashBuffer);
		return btoa(String.fromCharCode(...hashArray));
	}

	// Node.js crypto fallback
	try {
		const nodeCrypto = await import('node:crypto');
		return nodeCrypto
			.createHash(algorithm as string)
			.update(content, 'utf8')
			.digest('base64');
	} catch {
		throw new Error('Hash generation not supported in this environment');
	}
}
