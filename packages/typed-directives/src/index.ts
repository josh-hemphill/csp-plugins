import type {
	Directives,
	ReferrerHeaderOptions,
	ReportTo,
	Source,
} from './csp.types.ts';
import {
	actionSource,
	baseSources,
	directiveMap,
	directiveValuesByCategory,
	referrerHeaderOptions,
	requireTrustedTypePolicy,
	sandboxDirectives,
	sriPolicy,
	trustedTypesPolicy,
	validCrypto,
	validHashes,
} from './csp.types.ts';

export type ValidSource = Source;
type ReportTos = ReportTo | ReportTo[];
function normalizeArrayString<T>(arrS: T[] | T): T[] {
	return Array.isArray(arrS) ? arrS : [arrS];
}
export const ValidHashes: Readonly<['sha256', 'sha384', 'sha512']> = validHashes;
export const ValidCrypto: Readonly<['nonce', 'sha256', 'sha384', 'sha512']> = validCrypto;
export const directiveNamesList = <(keyof typeof directiveMap)[]>Object.keys(directiveMap);
type DirectiveName = keyof typeof directiveMap;
type DirectiveValue = typeof directiveMap[DirectiveName];
type DirectiveMapPair = [DirectiveName, DirectiveValue];
type CategoryValue = FlatArray<(typeof directiveValuesByCategory[DirectiveValue[number]]), 1>;
interface DirectiveResult {
	values: Partial<CategoryValue>[];
	categories: DirectiveValue;
}
export const DirectiveMap: Map<DirectiveName, DirectiveResult> = new Map<DirectiveName, DirectiveResult>(Object.entries(directiveMap).map((dPair) => {
	const [k, v] = <DirectiveMapPair>dPair;
	return [k, {
		get values(): Partial<CategoryValue>[] {
			return this.categories.map((category) => directiveValuesByCategory[category]).flat(1);
		},
		categories: v,
	}];
}));
export const referrerHeaderOptionsList: typeof referrerHeaderOptions = referrerHeaderOptions;
export type DirectivesObj = Directives;
export type ReportToObj = ReportTo;
export type ReferrerHeaderOptionsList = ReferrerHeaderOptions;
export interface CspDirectiveHeaders {
	'Content-Security-Policy-Report-Only': string;
	'Content-Security-Policy': string;
	'Report-To': string;
	'Referrer-Policy': string;
}

const PolicySet = new Set([
	...actionSource,
	...baseSources,
	...trustedTypesPolicy,
	...requireTrustedTypePolicy,
	...sriPolicy,
	...referrerHeaderOptions,
	...actionSource,
	...sandboxDirectives,
]);
function isQuotedPolicy(policy: string): boolean {
	if ((PolicySet as Set<string>).has(policy))
		return true;
	if (validCrypto.some((v) => policy.startsWith(`${v}-`)))
		return true;
	return false;
}

export class CspDirectives {
	public CSP: Directives;
	public ReportOnly: Directives | false;
	public ReportTo: ReportTos;
	public ReferrerHeader: ReferrerHeaderOptions;
	constructor(
		csp?: Directives,
		sendReportsTo?: ReportTos,
		reportSubset?: Directives,
		referrerHeaderOverride?: ReferrerHeaderOptions,
	) {
		this.CSP = csp || {};
		this.ReportOnly = reportSubset || false;
		this.ReportTo = sendReportsTo || [];
		this.ReferrerHeader = referrerHeaderOverride || 'strict-origin-when-cross-origin';
		function inReferrerOptions(r: string): r is ReferrerHeaderOptions {
			return (referrerHeaderOptions as readonly string[]).includes(r);
		}
		if (!referrerHeaderOverride && csp?.referrer && inReferrerOptions(csp.referrer)) {
			this.ReferrerHeader = csp.referrer;
		}
	}

	checkReportTo(): void {
		const reportTo = this.CSP?.['report-to'];
		if (reportTo !== undefined) {
			const reportsTo = normalizeArrayString(this.ReportTo);
			if (!reportsTo.some((v) => v.group === reportTo)) {
				throw new Error('Undefined ReportTo group specified in policy "report-to"');
			}
		}
	}

	getHeaders(): CspDirectiveHeaders {
		this.checkReportTo();
		const results = {
			'Content-Security-Policy-Report-Only': '',
			'Content-Security-Policy': '',
			'Report-To': normalizeArrayString(this.ReportTo).length ? JSON.stringify(this.ReportTo) : '',
			'Referrer-Policy': this.ReferrerHeader,
		};
		directiveNamesList.forEach((directive) => {
			let result = '';
			const getRes = (obj: Directives): void => {
				let res = '';
				if (typeof obj[directive] !== 'boolean') {
					res = normalizeArrayString(obj[directive]).map((v): string => {
						if (typeof v === 'string') {
							return isQuotedPolicy(v) ? ` '${v}'` : ` ${v}`;
						}
						return '';
					}).join('');
				}
				result = ` ${directive}${res};`;
			};
			const cspValue = this.CSP[directive] as unknown;
			const hasCspValue = Array.isArray(cspValue)
				? normalizeArrayString(cspValue).length > 0
				: ![false, null, undefined, ''].includes(cspValue as never);
			if (hasCspValue) {
				getRes(this.CSP);
				results['Content-Security-Policy'] += result;
			}
			if (this.ReportOnly !== false) {
				const roValue = this.ReportOnly[directive] as unknown;
				const hasRoValue = Array.isArray(roValue)
					? normalizeArrayString(roValue).length > 0
					: ![false, null, undefined, ''].includes(roValue as never);
				if (hasRoValue) {
					results['Content-Security-Policy-Report-Only'] += result || (getRes(this.ReportOnly), result);
				}
			}
		});
		results['Content-Security-Policy-Report-Only']
			= results['Content-Security-Policy-Report-Only'].trim();
		results['Content-Security-Policy']
			= results['Content-Security-Policy'].trim();
		return results;
	}
}
