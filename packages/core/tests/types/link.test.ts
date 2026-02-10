import { describe, expect, it } from 'vitest';
import {
	ContentSummarySchema,
	LinkExtractResultSchema,
	LinkInfoSchema,
	extractUrls,
} from '../../src/types/link.js';
import type {
	ContentSummary,
	LinkContentProvider,
	LinkExtractResult,
	LinkInfo,
} from '../../src/types/link.js';

describe('Link Understanding types', () => {
	describe('LinkInfo', () => {
		it('represents a detected URL with position info', () => {
			const link: LinkInfo = {
				url: 'https://example.com',
				start: 6,
				end: 26,
				type: 'url',
			};

			expect(link.url).toBe('https://example.com');
			expect(link.start).toBe(6);
			expect(link.end).toBe(26);
			expect(link.type).toBe('url');
		});

		it('validates via Zod schema', () => {
			const valid = LinkInfoSchema.safeParse({
				url: 'https://example.com',
				start: 0,
				end: 20,
				type: 'url',
			});
			expect(valid.success).toBe(true);
		});

		it('rejects invalid LinkInfo (negative start)', () => {
			const invalid = LinkInfoSchema.safeParse({
				url: 'https://example.com',
				start: -1,
				end: 20,
				type: 'url',
			});
			expect(invalid.success).toBe(false);
		});

		it('rejects invalid LinkInfo (empty url)', () => {
			const invalid = LinkInfoSchema.safeParse({
				url: '',
				start: 0,
				end: 0,
				type: 'url',
			});
			expect(invalid.success).toBe(false);
		});

		it('supports email type', () => {
			const link: LinkInfo = {
				url: 'mailto:user@example.com',
				start: 0,
				end: 22,
				type: 'email',
			};
			expect(link.type).toBe('email');
		});
	});

	describe('ContentSummary', () => {
		it('represents extracted web page content', () => {
			const summary: ContentSummary = {
				title: 'Example Page',
				content: 'This is the main content of the page.',
				byline: 'John Doe',
				excerpt: 'A brief excerpt.',
				siteName: 'Example Site',
				wordCount: 42,
			};

			expect(summary.title).toBe('Example Page');
			expect(summary.wordCount).toBe(42);
		});

		it('validates via Zod schema', () => {
			const valid = ContentSummarySchema.safeParse({
				title: 'Test',
				content: 'Some content',
			});
			expect(valid.success).toBe(true);
		});

		it('requires content field', () => {
			const invalid = ContentSummarySchema.safeParse({
				title: 'Test',
			});
			expect(invalid.success).toBe(false);
		});

		it('allows optional fields to be omitted', () => {
			const result = ContentSummarySchema.parse({
				title: 'Minimal',
				content: 'Just content',
			});
			expect(result.byline).toBeUndefined();
			expect(result.excerpt).toBeUndefined();
			expect(result.siteName).toBeUndefined();
			expect(result.wordCount).toBeUndefined();
		});
	});

	describe('LinkExtractResult', () => {
		it('represents a URL extraction result with content', () => {
			const result: LinkExtractResult = {
				link: {
					url: 'https://example.com/article',
					start: 10,
					end: 38,
					type: 'url',
				},
				summary: {
					title: 'Great Article',
					content: 'Article body here.',
					wordCount: 3,
				},
				fetchedAt: new Date('2026-02-09'),
				error: undefined,
			};

			expect(result.link.url).toBe('https://example.com/article');
			expect(result.summary?.title).toBe('Great Article');
			expect(result.error).toBeUndefined();
		});

		it('represents a failed fetch', () => {
			const result: LinkExtractResult = {
				link: {
					url: 'https://unreachable.test',
					start: 0,
					end: 25,
					type: 'url',
				},
				summary: undefined,
				fetchedAt: new Date(),
				error: 'ECONNREFUSED',
			};

			expect(result.summary).toBeUndefined();
			expect(result.error).toBe('ECONNREFUSED');
		});

		it('validates via Zod schema', () => {
			const valid = LinkExtractResultSchema.safeParse({
				link: {
					url: 'https://example.com',
					start: 0,
					end: 20,
					type: 'url',
				},
				fetchedAt: new Date().toISOString(),
			});
			expect(valid.success).toBe(true);
		});
	});

	describe('extractUrls', () => {
		it('extracts URLs from plain text', () => {
			const text = 'Check out https://example.com and http://test.org for more info';
			const urls = extractUrls(text);

			expect(urls.length).toBeGreaterThanOrEqual(2);
			expect(urls.some((u) => u.url === 'https://example.com')).toBe(true);
			expect(urls.some((u) => u.url === 'http://test.org')).toBe(true);
		});

		it('returns empty array for text without URLs', () => {
			const urls = extractUrls('Hello world, no links here!');
			expect(urls).toEqual([]);
		});

		it('includes start and end positions', () => {
			const text = 'Visit https://example.com today';
			const urls = extractUrls(text);

			expect(urls.length).toBe(1);
			expect(urls[0]?.start).toBe(6);
			expect(urls[0]?.end).toBe(25);
		});

		it('handles multiple URLs in one line', () => {
			const text = 'https://first.com and https://second.com and https://third.com';
			const urls = extractUrls(text);
			expect(urls.length).toBe(3);
		});

		it('detects email addresses', () => {
			const text = 'Contact us at support@example.com for help';
			const urls = extractUrls(text);

			expect(urls.length).toBe(1);
			expect(urls[0]?.type).toBe('email');
		});

		it('handles URLs with paths and query params', () => {
			const text = 'See https://example.com/path?q=search&page=1#section for details';
			const urls = extractUrls(text);

			expect(urls.length).toBe(1);
			expect(urls[0]?.url).toContain('example.com/path');
		});

		it('handles empty string', () => {
			expect(extractUrls('')).toEqual([]);
		});

		it('handles text with only whitespace', () => {
			expect(extractUrls('   \n\t  ')).toEqual([]);
		});
	});

	describe('LinkContentProvider (DI interface)', () => {
		it('defines the contract for link content fetching', () => {
			const mockProvider: LinkContentProvider = {
				fetchContent: async (url: string) => ({
					title: 'Mock Page',
					content: `Content from ${url}`,
					wordCount: 3,
				}),
			};

			expect(mockProvider.fetchContent).toBeDefined();
		});

		it('handles fetch errors via return value', async () => {
			const failingProvider: LinkContentProvider = {
				fetchContent: async (_url: string) => undefined,
			};

			const result = await failingProvider.fetchContent('https://unreachable.test');
			expect(result).toBeUndefined();
		});
	});
});
