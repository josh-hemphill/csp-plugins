import { describe, expect, it, vi } from 'vitest';

import {
	CONTRIBUTORS_END,
	CONTRIBUTORS_START,
	fetchGithubContributors,
	isBotContributor,
	replaceMarkedSection,
	renderContributorsFile,
	renderReadmeContributors,
	selectHumanContributors,
	type GithubContributor,
} from './contributors.ts';

const humans: GithubContributor[] = [
	{
		login: 'alice',
		html_url: 'https://github.com/alice',
		avatar_url: 'https://example.com/alice.png',
		contributions: 3,
		type: 'User',
	},
	{
		login: 'bob',
		html_url: 'https://github.com/bob',
		avatar_url: 'https://example.com/bob.png',
		contributions: 12,
		type: 'User',
	},
];

const bot: GithubContributor = {
	login: 'dependabot[bot]',
	html_url: 'https://github.com/apps/dependabot',
	avatar_url: 'https://example.com/bot.png',
	contributions: 99,
	type: 'Bot',
};

describe('contributors', () => {
	it('treats Bot type and [bot] logins as bots', () => {
		expect(isBotContributor(bot)).toBe(true);
		expect(isBotContributor({ login: 'renovate[bot]', type: 'User' })).toBe(true);
		expect(isBotContributor({ login: 'alice', type: 'User' })).toBe(false);
	});

	it('drops bots and sorts humans by contribution count', () => {
		expect(selectHumanContributors([...humans, bot]).map((c) => c.login)).toEqual([
			'bob',
			'alice',
		]);
	});

	it('renders CONTRIBUTORS.md with a generated date and pluralized commits', () => {
		const markdown = renderContributorsFile([...humans, bot], new Date('2026-09-12T00:00:00Z'));
		expect(markdown).toContain('Last updated: 2026-09-12');
		expect(markdown).toContain('  - <img src="https://example.com/bob.png"');
		expect(markdown).toContain('[alice](https://github.com/alice) — 3 commits');
		expect(markdown).not.toContain('dependabot');
	});

	it('renders a compact README list', () => {
		expect(renderReadmeContributors(humans)).toContain(
			'  - <img src="https://example.com/bob.png"',
		);
		expect(renderReadmeContributors([])).toBe(
			'  - No human contributors were returned by the API.',
		);
	});

	it('replaces the marked README section', () => {
		const source = `intro\n${CONTRIBUTORS_START}\nold\n${CONTRIBUTORS_END}\noutro\n`;
		expect(replaceMarkedSection(source, '- bob')).toBe(
			`intro\n${CONTRIBUTORS_START}\n- bob\n${CONTRIBUTORS_END}\noutro\n`,
		);
	});

	it('throws when README markers are missing', () => {
		expect(() => replaceMarkedSection('# hi\n', '- bob')).toThrow(/markers/);
	});

	it('paginates the GitHub contributors API', async () => {
		const page1 = Array.from({ length: 100 }, (_, i) => ({
			...humans[0],
			login: `user-${i}`,
		}));
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(page1), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify(humans), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			);

		const result = await fetchGithubContributors({
			repo: 'acme/demo',
			token: 'test-token',
			fetchImpl,
		});
		expect(result).toHaveLength(102);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/repos/acme/demo/contributors');
		expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: 'Bearer test-token',
		});
	});

	it('surfaces GitHub API failures', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('nope', { status: 403 }));
		await expect(fetchGithubContributors({ fetchImpl })).rejects.toThrow(/403/);
	});
});
