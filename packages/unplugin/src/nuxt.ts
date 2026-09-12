import type { CspPluginOptions } from '@csp-plugins/shared/types';
import cspVitePlugin from './vite.ts';
import cspWebpackPlugin from './webpack.ts';

interface NuxtConfig {
	plugins?: unknown[];
}

interface Nuxt {
	hook: (event: string, callback: (config: NuxtConfig) => void | Promise<void>) => void;
}

export default function (options: CspPluginOptions = {}, nuxt: Nuxt): void {
	// Install webpack plugin
	nuxt.hook('webpack:config', async (config: NuxtConfig) => {
		config.plugins = config.plugins || [];
		(config.plugins).unshift(cspWebpackPlugin(options));
	});

	// Install vite plugin
	nuxt.hook('vite:extendConfig', async (config: NuxtConfig) => {
		config.plugins = config.plugins || [];
		(config.plugins).push(cspVitePlugin(options));
	});
}
