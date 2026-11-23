import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CoverageMetric {
	total: number;
	covered: number;
	skipped: number;
	pct: number;
}

export interface CoverageSummaryTotals {
	lines: CoverageMetric;
	statements: CoverageMetric;
	functions: CoverageMetric;
	branches: CoverageMetric;
}

export interface CoverageSummaryJson {
	total: CoverageSummaryTotals;
}

const METRIC_NAMES = ['lines', 'statements', 'functions', 'branches'] as const;

/** Format Vitest json-summary totals as a Markdown table. */
export function formatCoverageSummary(summary: CoverageSummaryJson): string {
	const rows = METRIC_NAMES.map((name) => {
		const metric = summary.total[name];
		return `| ${name} | ${metric.covered} / ${metric.total} | ${formatPct(metric.pct)}% |`;
	});
	return [
		'## Test coverage',
		'',
		'| Metric | Covered | Percent |',
		'| --- | --- | --- |',
		...rows,
		'',
	].join('\n');
}

function formatPct(pct: number): string {
	return Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
}

/** Read a Vitest coverage-summary.json file and return Markdown. */
export async function readCoverageSummaryMarkdown(summaryPath: string): Promise<string> {
	const raw = await readFile(summaryPath, 'utf8');
	const parsed = JSON.parse(raw) as CoverageSummaryJson;
	if (!parsed.total?.lines) {
		throw new Error(`Invalid coverage summary at ${summaryPath}: missing total.lines`);
	}
	return formatCoverageSummary(parsed);
}

async function runCli(): Promise<void> {
	const summaryPath = resolve(process.argv[2] ?? 'coverage/coverage-summary.json');
	const markdown = await readCoverageSummaryMarkdown(summaryPath);
	process.stdout.write(`${markdown}\n`);
	const stepSummary = process.env.GITHUB_STEP_SUMMARY;
	if (stepSummary) {
		await appendFile(stepSummary, markdown);
	}
}

const isDirectRun =
	process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
	await runCli();
}
