import { defineBuildConfig } from 'obuild/config';
import oxcConfig from '../../scripts/oxc.default.ts';

export default defineBuildConfig({
	entries: [{
		type: 'transform',
		input: './src/',
		oxc: oxcConfig,
	}],
});
