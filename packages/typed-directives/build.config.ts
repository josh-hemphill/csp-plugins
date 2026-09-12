import { defineBuildConfig } from 'obuild/config';

export default defineBuildConfig({
	entries: [
		{
			type: 'bundle',
			input: ['./src/index.ts', './src/csp.types.ts'],
			dts: {
				generator: 'tsc',
			},
		},
	],
});
