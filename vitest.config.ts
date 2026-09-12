import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			'packages/typed-directives',
			'packages/core',
			'packages/shared',
			'packages/basic-fscache',
			{
				test: {
					name: 'scripts',
					include: ['scripts/**/*.test.ts'],
				},
			},
		],
		coverage: {
			provider: 'v8',
			reportsDirectory: './coverage',
			reporter: ['text', 'text-summary', 'json-summary', 'json', 'cobertura', 'html'],
			reportOnFailure: true,
			include: [
				'packages/typed-directives/src/**/*.ts',
				'packages/core/lib/**/*.ts',
				'packages/shared/src/**/*.ts',
				'packages/basic-fscache/lib/**/*.ts',
			],
			exclude: ['**/*.test.ts', '**/tests/**', '**/test/**', '**/dist/**', '**/node_modules/**'],
		},
	},
});
