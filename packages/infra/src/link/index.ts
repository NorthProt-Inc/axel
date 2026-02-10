/**
 * FEAT-LINK-002: ReadabilityContentProvider
 *
 * Implements LinkContentProvider (core/types/link.ts) using DI-injected
 * HTTP fetcher and HTML parser (designed for @mozilla/readability + linkedom).
 *
 * Security: SSRF prevention (private IP blocking), URL validation (http/https only).
 * External content is treated as untrusted.
 */

import type { ContentSummary, LinkContentProvider } from '@axel/core/types';

// --- DI interfaces ---

export interface HttpFetchResult {
	readonly status: number;
	readonly body: string;
	readonly contentType: string;
	readonly url: string;
}

export interface HttpFetcher {
	readonly fetch: (
		url: string,
		options?: { readonly timeoutMs?: number; readonly maxRedirects?: number },
	) => Promise<HttpFetchResult>;
}

export interface ParsedContent {
	readonly title: string | null;
	readonly content: string;
	readonly textContent: string;
	readonly excerpt: string | null;
	readonly byline: string | null;
	readonly siteName: string | null;
	readonly length: number;
}

export interface HtmlParser {
	readonly parse: (html: string, url: string) => ParsedContent | null;
}

export interface LinkProviderConfig {
	readonly timeoutMs: number;
	readonly maxRedirects: number;
	readonly maxContentChars: number;
	readonly userAgent: string;
}

// --- Constants ---

const DEFAULT_CONFIG: LinkProviderConfig = {
	timeoutMs: 10_000,
	maxRedirects: 3,
	maxContentChars: 50_000,
	userAgent: 'Mozilla/5.0 (compatible; Axel/1.0; +https://github.com/northprot/axel)',
};

const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'] as const;

/**
 * Private/reserved IP patterns for SSRF prevention.
 * Blocks: localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, [::1], 0.0.0.0
 */
const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
	/^localhost$/i,
	/^127\./,
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^\[?::1\]?$/,
	/^0\.0\.0\.0$/,
	/^\[?0:0:0:0:0:0:0:1\]?$/,
];

// --- Implementation ---

function isPrivateHost(hostname: string): boolean {
	return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isValidUrl(urlStr: string): URL | null {
	try {
		const parsed = new URL(urlStr);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		if (isPrivateHost(parsed.hostname)) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function isHtmlContentType(contentType: string): boolean {
	const lower = contentType.toLowerCase();
	return HTML_CONTENT_TYPES.some((ct) => lower.includes(ct));
}

function countWords(text: string): number {
	return text
		.trim()
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
}

export class ReadabilityContentProvider implements LinkContentProvider {
	private readonly fetcher: HttpFetcher;
	private readonly parser: HtmlParser;
	private readonly config: LinkProviderConfig;

	constructor(fetcher: HttpFetcher, parser: HtmlParser, config?: LinkProviderConfig) {
		this.fetcher = fetcher;
		this.parser = parser;
		this.config = config ?? DEFAULT_CONFIG;
	}

	readonly fetchContent = async (url: string): Promise<ContentSummary | undefined> => {
		const parsed = isValidUrl(url);
		if (parsed === null) {
			return undefined;
		}

		let fetchResult: HttpFetchResult;
		try {
			fetchResult = await this.fetcher.fetch(url, {
				timeoutMs: this.config.timeoutMs,
				maxRedirects: this.config.maxRedirects,
			});
		} catch {
			return undefined;
		}

		if (fetchResult.status !== 200) {
			return undefined;
		}

		if (!isHtmlContentType(fetchResult.contentType)) {
			return undefined;
		}

		let article: ParsedContent | null;
		try {
			article = this.parser.parse(fetchResult.body, url);
		} catch {
			return undefined;
		}

		if (article === null) {
			return undefined;
		}

		let textContent = article.textContent;
		if (textContent.length > this.config.maxContentChars) {
			textContent = textContent.slice(0, this.config.maxContentChars);
		}

		const summary: ContentSummary = {
			title: article.title ?? undefined,
			content: textContent,
			byline: article.byline ?? undefined,
			excerpt: article.excerpt ?? undefined,
			siteName: article.siteName ?? undefined,
			wordCount: countWords(textContent),
		};

		return summary;
	};
}
