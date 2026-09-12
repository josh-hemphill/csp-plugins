import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: ['packages/typed-directives', 'packages/core', 'packages/basic-fscache'],
	},
});
