/**
 * Monup config consumed by `@monup/cli` once that package is installable.
 * `@monup/cli@0.3.0` still publishes unresolved `catalog:` / `workspace:*`
 * dependencies, so this file is a plain object until `defineConfig` can be imported.
 */
export default {
	git: {
		tagStrategy: 'package',
		commit: true,
		push: false,
		tag: true,
	},
	changelog: {
		strategy: 'per-package',
		location: 'CHANGELOG.md',
		commitLinks: true,
		issueLinks: true,
		contributors: true,
	},
	release: {
		dryRun: 'auto',
	},
	github: {
		changelogMethod: 'auto',
		releaseRepo: 'josh-hemphill/csp-plugins',
	},
};
