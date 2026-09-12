import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_DIR = join(__dirname, 'test-app');

export async function setup(): Promise<void> {
	// Clean up previous test outputs (only the output directories, not the test files)
	const testOutputDir = join(__dirname, 'tests');
	if (existsSync(testOutputDir)) {
		// Only remove output directories, not the test files
		const entries = readdirSync(testOutputDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.endsWith('-output')) {
				const outputPath = join(testOutputDir, entry.name);
				rmSync(outputPath, { recursive: true, force: true });
			}
		}
	}

	// Clean up test app build artifacts
	const distDir = join(TEST_APP_DIR, 'dist');
	const manifestDir = join(TEST_APP_DIR, '.csp-manifest');

	if (existsSync(distDir)) {
		rmSync(distDir, { recursive: true, force: true });
	}
	if (existsSync(manifestDir)) {
		rmSync(manifestDir, { recursive: true, force: true });
	}
}
