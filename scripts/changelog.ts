import process from 'node:process';
import { generate } from 'changelogithub';
import { $ } from 'zx';
import 'zx/globals';

const args = minimist(process.argv.slice(2), {
	boolean: [
		'recreateChangelog',
	],
	alias: {
		r: 'recreateChangelog',
	},
});

async function run() {
	try {
		if (!(Boolean(args.recreateChangelog) || Boolean(args.r))) {
			console.log('Updating changelog');
			const { md } = await generate({});
			const changelog = await fs.readFile('CHANGELOG.md', 'utf8');
			await fs.writeFile('CHANGELOG.md', `${md}\n\n${changelog}`);
			return;
		}

		console.log('Recreating changelog');
		const tags = await $`git tag --sort=-version:refname -l 'v*'`.nothrow().text();
		if (!tags.trim().length) {
			console.error('No tags found');
			process.exit(1);
		}
		let changelog = '';
		for (const tag of tags
			.trim()
			.split('\n')
			.map((version, i, arr) => ({ version, i, prev: arr[i - 1] }))
			.filter(({ version, prev }) => Boolean(prev) && version !== prev)) {
			console.log(`Generating changelog between ${tag.prev} and ${tag.version}`);
			const { md } = await generate({ from: tag.version, to: tag.prev });
			changelog += `
# Release [${tag.version}](https://github.com/josh-hemphill/maxminddb-wasm/releases/tag/${tag.version})

${md}


`;
		}
		await fs.writeFile('CHANGELOG.md', changelog);
	}
	catch (err) {
		console.error(err);
	}
}

await run();
