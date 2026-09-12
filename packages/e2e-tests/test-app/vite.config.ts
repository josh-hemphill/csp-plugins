import cspPlugin from '@csp-plugins/unplugin/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		cspPlugin({
			manifestDir: '.csp-manifest',
		}),
	],
	build: {
		outDir: 'dist',
		rollupOptions: {
			input: 'index.html',
		},
	},
});
