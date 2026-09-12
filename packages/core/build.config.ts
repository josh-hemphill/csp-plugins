import { defineBuildConfig } from 'obuild/config';
import oxcConfig from '../../scripts/oxc.default.ts';
import packageJson from '../typed-directives/package.json' with { type: 'json' };

const version = packageJson.version;

declare global {
	// @ts-expect-error - VERSION is injected by obuild
	const VERSION: string;
}

export default defineBuildConfig({
	entries: [{
		type: 'transform',
		input: './lib/',
		oxc: {
			...oxcConfig,
			define: {
				VERSION: `"${version}"`,
			},
		},
	}],
});
