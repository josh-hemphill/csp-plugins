#!/usr/bin/env tsx
/* eslint-disable antfu/no-top-level-await */
import { env, exit } from 'node:process';
import 'zx/globals';

/**
 * Script to run e2e tests with output preservation enabled
 * This allows you to inspect the test output directories after tests complete
 */

echo(chalk.yellow('🧪 Running e2e tests with output preservation...\n'));

// Set environment variable to keep test output
env.KEEP_TEST_OUTPUT = 'true';

try {
	// Run all tests
	await $`pnpm test`;

	echo(chalk.green('\n✅ Tests completed!'));
	echo(chalk.yellow('📁 Test output directories have been preserved for inspection.'));
	echo(chalk.yellow('🧹 To clean up automatically, run: KEEP_TEST_OUTPUT=false pnpm test'));
}
catch (error) {
	echo(chalk.red('\n❌ Tests failed:'));
	echo(chalk.red(error));
	echo(chalk.yellow('📁 Test output directories have been preserved for inspection.'));
	echo(chalk.yellow('🧹 To clean up automatically, run: KEEP_TEST_OUTPUT=false pnpm test'));
	exit(1);
}
