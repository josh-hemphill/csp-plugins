import type { CspPluginOptions } from '@csp-plugins/shared/types';
import { createUnplugin } from 'unplugin';

// Defer import then export the individual build tool plugins
import defer * as _esbuild from './esbuild.ts';
import defer * as _nuxt from './nuxt.ts';
import defer * as _rollup from './rollup.ts';
import defer * as _vite from './vite.ts';
import defer * as _webpack from './webpack.ts';

type Defer<T extends (...args: any) => any> = (...args: Parameters<T>) => ReturnType<T>;
const esbuild: Defer<(typeof _esbuild)['default']> = (...args) => _esbuild.default(...args);
const nuxt: Defer<(typeof _nuxt)['default']> = (...args) => _nuxt.default(...args);
const rollup: Defer<(typeof _rollup)['default']> = (...args) => _rollup.default(...args);
const vite: Defer<(typeof _vite)['default']> = async (...args) => _vite.default(...args);
const webpack: Defer<(typeof _webpack)['default']> = (...args) => _webpack.default(...args);

export { esbuild, nuxt, rollup, vite, webpack };

// Export utilities
export { DevServerIntegration } from './dev-server-integration.ts';
export { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';
export { ManifestWriter } from '@csp-plugins/shared/manifest-writer';
export { PostBuildDetector } from '@csp-plugins/shared/post-build-detector';

// Export types
export type {
	AssetManifest,
	AssetTracker,
	CspPluginOptions,
	TrackedAsset,
} from '@csp-plugins/shared/types';
// Export individual build tool plugins

/**
 * @deprecated Use individual plugins instead
 */
export default createUnplugin<CspPluginOptions | undefined>((options) => ({
	name: 'unplugin-csp',
	transformInclude(id) {
		return id.endsWith('main.ts');
	},
	transform(code) {
		const optionsStr = options ? JSON.stringify(options) : 'default';
		return code.replace('__UNPLUGIN__', `Hello Unplugin! ${optionsStr}`);
	},
}));
