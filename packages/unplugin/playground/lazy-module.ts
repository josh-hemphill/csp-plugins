// Lazy-loaded module for testing dynamic imports
export default {
	name: 'LazyModule',
	version: '1.0.0',
	description: 'This module is loaded dynamically to test CSP asset tracking',
	features: ['Dynamic import', 'Code splitting', 'Asset tracking'],
	getData() {
		return {
			timestamp: Date.now(),
			random: Math.random(),
			message: 'Hello from lazy module!',
		};
	},
};
