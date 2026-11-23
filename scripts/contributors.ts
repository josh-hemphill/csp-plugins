import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRIBUTORS_START = '<!-- CONTRIBUTORS:START -->';
export const CONTRIBUTORS_END = '<!-- CONTRIBUTORS:END -->';

export interface GithubContributor {
	login: string;
	html_url: string;
	avatar_url: string;
	contributions: number;
	type: string;
}

const DEFAULT_REPO = 'josh-hemphill/csp-plugins';
const PER_PAGE = 100;

/** Return true when a GitHub contributor record is a bot account. */
export function isBotContributor(contributor: Pick<GithubContributor, 'login' | 'type'>): boolean {
	if (contributor.type === 'Bot') return true;
	return contributor.login.endsWith('[bot]');
}

/** Keep human contributors, sorted by contribution count then login. */
export function selectHumanContributors(contributors: GithubContributor[]): GithubContributor[] {
	return [...contributors]
		.filter((contributor) => !isBotContributor(contributor))
		.toSorted((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login));
}

/** Render the standalone CONTRIBUTORS.md document. */
export function renderContributorsFile(
	contributors: GithubContributor[],
	generatedAt: Date,
): string {
	const people = selectHumanContributors(contributors);
	const rows = people.map(
		(contributor) =>
			`  - <img src="${contributor.avatar_url}" width="32" height="32" alt=""> [${contributor.login}](${contributor.html_url}) — ${contributor.contributions} commit${contributor.contributions === 1 ? '' : 's'}`,
	);
	return [
		'# Contributors',
		'',
		'This list is generated from the [GitHub contributors API](https://docs.github.com/en/rest/repos/repos#list-repository-contributors) on pushes to `main`. Do not edit it by hand.',
		'',
		`Last updated: ${generatedAt.toISOString().slice(0, 10)}`,
		'',
		...(rows.length > 0 ? rows : ['  - No human contributors were returned by the API.']),
		'',
	].join('\n');
}

/** Render the compact README contributor block (without markers). */
export function renderReadmeContributors(contributors: GithubContributor[]): string {
	const people = selectHumanContributors(contributors);
	if (people.length === 0) {
		return '  - No human contributors were returned by the API.';
	}
	return people
		.map(
			(contributor) =>
				`  - <img src="${contributor.avatar_url}" width="24" height="24" alt=""> [${contributor.login}](${contributor.html_url})`,
		)
		.join('\n');
}

/** Replace the marked section in an existing Markdown file. */
export function replaceMarkedSection(source: string, inner: string): string {
	const start = source.indexOf(CONTRIBUTORS_START);
	const end = source.indexOf(CONTRIBUTORS_END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error('README.md is missing CONTRIBUTORS:START / CONTRIBUTORS:END markers');
	}
	const before = source.slice(0, start + CONTRIBUTORS_START.length);
	const after = source.slice(end);
	return `${before}\n${inner}\n${after}`;
}

export interface FetchContributorsOptions {
	repo?: string;
	token?: string;
	fetchImpl?: typeof fetch;
}

/** Fetch every contributor page from the GitHub REST API. */
export async function fetchGithubContributors(
	options: FetchContributorsOptions = {},
): Promise<GithubContributor[]> {
	const repo = options.repo ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
	const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
	const fetchImpl = options.fetchImpl ?? fetch;
	const collected: GithubContributor[] = [];
	let page = 1;

	while (true) {
		const url = `https://api.github.com/repos/${repo}/contributors?per_page=${PER_PAGE}&page=${page}&anon=0`;
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'csp-plugins-contributors',
			'X-GitHub-Api-Version': '2022-11-28',
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		const response = await fetchImpl(url, { headers });
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`GitHub contributors API failed (${response.status}): ${body}`);
		}
		const batch = (await response.json()) as GithubContributor[];
		collected.push(...batch);
		if (batch.length < PER_PAGE) {
			break;
		}
		page += 1;
	}

	return collected;
}

export async function writeContributorFiles(
	contributors: GithubContributor[],
	generatedAt: Date,
	paths: { contributorsMd: string; readmeMd: string },
): Promise<void> {
	await writeFile(paths.contributorsMd, renderContributorsFile(contributors, generatedAt));
	const readme = await readFile(paths.readmeMd, 'utf8');
	const next = replaceMarkedSection(readme, renderReadmeContributors(contributors));
	await writeFile(paths.readmeMd, next);
}

async function runCli(): Promise<void> {
	const contributors = await fetchGithubContributors();
	await writeContributorFiles(contributors, new Date(), {
		contributorsMd: 'CONTRIBUTORS.md',
		readmeMd: 'README.md',
	});
}

const isDirectRun =
	process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
	await runCli();
}
