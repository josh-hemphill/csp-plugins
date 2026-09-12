import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		exclude: ['node_modules', 'dist'],
		testTimeout: 120000, // Increased timeout for Puppeteer tests
		maxWorkers: 1, // Prevent race conditions when building test-app
		globalSetup: ['./global-setup.ts'],
		// Increase hook timeout for browser setup/teardown
		hookTimeout: 60000,
	},
});
