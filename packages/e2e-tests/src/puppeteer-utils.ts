import type { Browser, Page } from 'puppeteer';

/**
 * Configuration for CSP validation tests
 */
export interface CSPValidationConfig {
	/** URL to test */
	url: string;
	/** Expected CSP policy to validate */
	expectedCSP?: string;
	/** Whether to expect CSP violations */
	expectViolations?: boolean;
	/** Timeout for page load */
	timeout?: number;
}

/**
 * Results from CSP validation
 */
export interface CSPValidationResult {
	/** Whether the test passed */
	success: boolean;
	/** CSP policy found in the page */
	cspPolicy?: string;
	/** Console errors captured */
	consoleErrors: string[];
	/** CSP violations captured */
	cspViolations: string[];
	/** Security policy violations */
	securityPolicyViolations: string[];
	/** Any other errors */
	otherErrors: string[];
}

/**
 * Launches a browser instance for testing
 */
export async function launchBrowser(): Promise<Browser> {
	const puppeteer = await import('puppeteer');
	return puppeteer.default.launch({
		headless: 'new',
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--disable-accelerated-2d-canvas',
			'--no-first-run',
			'--no-zygote',
			'--disable-gpu',
		],
	});
}

/**
 * Creates a new page with CSP monitoring
 */
export async function createCSPMonitoringPage(browser: Browser): Promise<Page> {
	const page = await browser.newPage();

	// Capture console errors
	const consoleErrors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});

	// Capture CSP violations
	const cspViolations: string[] = [];
	page.on('pageerror', (error) => {
		if (
			error.message.includes('Content Security Policy') ||
			error.message.includes('CSP') ||
			error.message.includes('security policy')
		) {
			cspViolations.push(error.message);
		}
	});

	// Monitor security policy violations
	page.on('error', (error) => {
		if (
			error.message.includes('security policy') ||
			error.message.includes('Content Security Policy')
		) {
			cspViolations.push(error.message);
		}
	});

	// Store errors in page context for later retrieval
	await page.evaluateOnNewDocument(() => {
		(window as any).__cspTestErrors = {
			consoleErrors: [],
			cspViolations: [],
			securityPolicyViolations: [],
			otherErrors: [],
		};

		// Override console.error to capture errors
		const originalError = console.error;
		console.error = (...args: any[]) => {
			(window as any).__cspTestErrors.consoleErrors.push(args.join(' '));
			originalError.apply(console, args);
		};

		// Listen for CSP violations
		document.addEventListener('securitypolicyviolation', (event) => {
			(window as any).__cspTestErrors.securityPolicyViolations.push({
				violatedDirective: event.violatedDirective,
				blockedURI: event.blockedURI,
				documentURI: event.documentURI,
				effectiveDirective: event.effectiveDirective,
				originalPolicy: event.originalPolicy,
			});
		});
	});

	return page;
}

/**
 * Validates CSP policy in a page
 */
export async function validateCSP(
	page: Page,
	config: CSPValidationConfig,
): Promise<CSPValidationResult> {
	try {
		// Navigate to the page
		await page.goto(config.url, {
			waitUntil: 'networkidle2',
			timeout: config.timeout || 30000,
		});

		// Wait a bit for any CSP violations to be captured
		await page.waitForTimeout(1000);

		// Extract CSP policy from meta tag or response headers
		const cspPolicy = await page.evaluate(() => {
			const metaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
			if (metaTag) {
				return metaTag.getAttribute('content');
			}
			return null;
		});

		// Get captured errors from page context
		const pageErrors = await page.evaluate(() => {
			return (
				(window as any).__cspTestErrors || {
					consoleErrors: [],
					cspViolations: [],
					securityPolicyViolations: [],
					otherErrors: [],
				}
			);
		});

		// Check for CSP-related console errors
		const cspConsoleErrors = pageErrors.consoleErrors.filter(
			(error: string) =>
				error.toLowerCase().includes('csp') ||
				error.toLowerCase().includes('content security policy') ||
				error.toLowerCase().includes('security policy'),
		);

		// Check for security policy violations
		const securityPolicyViolations = pageErrors.securityPolicyViolations.map(
			(violation: any) =>
				`CSP Violation: ${violation.violatedDirective} blocked ${violation.blockedURI}`,
		);

		// Determine success based on expectations
		const hasViolations =
			cspConsoleErrors.length > 0 ||
			securityPolicyViolations.length > 0 ||
			pageErrors.cspViolations.length > 0;

		const success = config.expectViolations ? hasViolations : !hasViolations;

		return {
			success,
			cspPolicy: cspPolicy || undefined,
			consoleErrors: pageErrors.consoleErrors,
			cspViolations: pageErrors.cspViolations,
			securityPolicyViolations,
			otherErrors: pageErrors.otherErrors,
		};
	} catch (error) {
		return {
			success: false,
			consoleErrors: [],
			cspViolations: [],
			securityPolicyViolations: [],
			otherErrors: [error instanceof Error ? error.message : String(error)],
		};
	}
}

/**
 * Closes browser and cleans up resources
 */
export async function closeBrowser(browser: Browser): Promise<void> {
	await browser.close();
}
