#!/usr/bin/env zx

import { versionBump } from 'bumpp';
import { $ } from 'zx';
import 'zx/globals';

try {
	const packages = await glob(['package.json'], { expandDirectories: false });

	console.log('Bumping versions in packages:', packages.join(', '), '\n');

	const result = await versionBump({
		files: packages,
		commit: 'ci: release v%s',
		push: false,
		tag: true,
		all: true,
	});

	await $({ stdio: 'inherit' })`tsx scripts/changelog.ts --recreateChangelog`;

	await $`git commit -m "ci: update changelog" CHANGELOG.md`;

	await $`git tag --force latest`;

	if (!result.newVersion.includes('beta')) {
		console.log('Pushing to release branch');
		await $`git update-ref refs/heads/release refs/heads/dev`;
	}
	await $`git push origin :latest`.nothrow().quiet();
	await $`git push origin release dev --tags`;
	console.log('New release is ready, waiting for conformation at https://github.com/josh-hemphill/newtab-redirect-ext/actions');
}
catch (err) {
	console.error(err);
}
