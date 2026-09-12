import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: {
		VERSION: JSON.stringify('0.1.0'),
	},
	test: {
		coverage: {
			reporter: ['text', 'json', 'lcov', 'clover'],
		},
	},
});
