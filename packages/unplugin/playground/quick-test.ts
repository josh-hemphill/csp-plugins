#!/usr/bin/env tsx

import { existsSync, readdirSync } from 'node:fs';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import 'zx/globals';

const SCRIPT_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));

// Colors for output using zx globals
const colors = {
	red: (text: string) => chalk.red(text),
	green: (text: string) => chalk.green(text),
	yellow: (text: string) => chalk.yellow(text),
	blue: (text: string) => chalk.blue(text),
	bold: (text: string) => chalk.bold(text),
};

/**
 * Check if we're in the right directory
 */
function checkDirectory(): boolean {
	if (!existsSync(path.join(SCRIPT_DIR, 'vite.config.ts'))) {
		echo(colors.red('❌ Error: Please run this script from the playground directory'));
		return false;
	}

	echo(colors.green('✅ Found Vite configuration'));
	return true;
}

/**
 * Check and install dependencies if needed
 */
async function checkDependencies(): Promise<void> {
	if (!existsSync(path.join(SCRIPT_DIR, 'node_modules'))) {
		echo(colors.blue('📦 Installing dependencies...'));
		await $`cd ${SCRIPT_DIR} && pnpm install`;
	} else {
		echo(colors.green('✅ Dependencies already installed'));
	}
}

/**
 * Test the build process
 */
async function testBuild(): Promise<boolean> {
	echo(colors.blue('🔨 Testing build process...'));

	try {
		await $`cd ${SCRIPT_DIR} && pnpm build`;
		echo(colors.green('✅ Build successful'));
		return true;
	} catch {
		echo(colors.red('❌ Build failed'));
		return false;
	}
}

/**
 * Check CSP manifests
 */
function checkCspManifests(): void {
	echo(colors.blue('📋 Checking CSP manifests...'));

	const manifestDirs = [
		'.csp-manifest-strict',
		'.csp-manifest-permissive',
		'.csp-manifest-minimal',
	];

	for (const dir of manifestDirs) {
		const dirPath = path.join(SCRIPT_DIR, dir);
		if (existsSync(dirPath)) {
			echo(colors.green(`✅ ${dir} generated`));

			// Count manifest files
			const manifestFiles = findFiles(dirPath, '*.json');
			echo(`   📄 ${manifestFiles.length} manifest files`);
		} else {
			echo(colors.red(`❌ ${dir} not found`));
		}
	}
}

/**
 * Check dist directory
 */
function checkDistDirectory(): void {
	const distPath = path.join(SCRIPT_DIR, 'dist');
	if (existsSync(distPath)) {
		echo(colors.green('✅ Dist directory generated'));

		// Count built assets
		const assets = findFiles(distPath, '*');
		echo(`   📁 ${assets.length} built assets`);
	} else {
		echo(colors.red('❌ Dist directory not found'));
	}
}

/**
 * Find files recursively
 */
function findFiles(dir: string, pattern: string): string[] {
	const files: string[] = [];

	function scan(currentDir: string): void {
		if (!existsSync(currentDir)) return;

		const entries = readdirSync(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				scan(fullPath);
			} else if (entry.isFile()) {
				// Simple pattern matching (could be enhanced with glob)
				if (pattern === '*' || entry.name.includes(pattern.replace('*', ''))) {
					files.push(fullPath);
				}
			}
		}
	}

	scan(dir);
	return files;
}

/**
 * Show next steps
 */
function showNextSteps(): void {
	echo('');
	echo(colors.green('🎉 Quick test completed successfully!'));
	echo('');
	echo(colors.bold('Next steps:'));
	echo("  • Run 'pnpm test:run' for full test suite");
	echo("  • Run 'pnpm dev' for development mode");
	echo('  • Check generated manifests in .csp-manifest-* directories');
}

/**
 * Main function
 */
async function main(): Promise<void> {
	echo(colors.bold('🧪 CSP Plugin Playground Quick Test'));
	echo('==================================');

	try {
		// Check directory
		if (!checkDirectory()) {
			exit(1);
		}

		// Check dependencies
		await checkDependencies();

		// Test build
		if (!(await testBuild())) {
			exit(1);
		}

		// Check CSP manifests
		checkCspManifests();

		// Check dist directory
		checkDistDirectory();

		// Show next steps
		showNextSteps();
	} catch (error) {
		echo(colors.red('❌ Error:'), error);
		exit(1);
	}
}

// Run main function
await main();
