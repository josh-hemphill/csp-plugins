import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	formatCoverageSummary,
	readCoverageSummaryMarkdown,
	type CoverageSummaryJson,
} from './coverage-summary.ts';

const sample: CoverageSummaryJson = {
	total: {
		lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
		statements: { total: 120, covered: 90, skipped: 0, pct: 75 },
		functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
		branches: { total: 8, covered: 6, skipped: 0, pct: 75.5 },
	},
};

describe('coverage summary', () => {
	it('renders integer and fractional percents in a Markdown table', () => {
		expect(formatCoverageSummary(sample)).toBe(
			[
				'## Test coverage',
				'',
				'| Metric | Covered | Percent |',
				'| --- | --- | --- |',
				'| lines | 80 / 100 | 80% |',
				'| statements | 90 / 120 | 75% |',
				'| functions | 9 / 10 | 90% |',
				'| branches | 6 / 8 | 75.50% |',
				'',
			].join('\n'),
		);
	});

	it('reads a Vitest coverage-summary.json file', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'coverage-summary-'));
		const path = join(dir, 'coverage-summary.json');
		await writeFile(path, JSON.stringify(sample));
		const markdown = await readCoverageSummaryMarkdown(path);
		expect(markdown).toContain('| lines | 80 / 100 | 80% |');
	});

	it('rejects a file without totals', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'coverage-summary-'));
		const path = join(dir, 'coverage-summary.json');
		await writeFile(path, JSON.stringify({}));
		await expect(readCoverageSummaryMarkdown(path)).rejects.toThrow(/missing total.lines/);
	});
});
