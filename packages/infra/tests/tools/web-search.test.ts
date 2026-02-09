import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	WebSearchProvider,
	createWebSearchTool,
	formatSearchResults,
	type WebSearchConfig,
	type SearchResult,
} from '../../src/tools/web-search.js';

describe('Web Search Tool', () => {
	describe('WebSearchProvider', () => {
		const mockConfig: WebSearchConfig = {
			apiKey: 'test-api-key',
			endpoint: 'https://api.search.brave.com/res/v1/web/search',
			maxResultsPerQuery: 5,
			safeSearch: 'strict',
			rateLimitMs: 0, // no rate limit in tests
		};

		let provider: WebSearchProvider;

		beforeEach(() => {
			provider = new WebSearchProvider(mockConfig);
		});

		it('creates provider with config', () => {
			expect(provider).toBeDefined();
		});

		it('search throws on empty query', async () => {
			await expect(provider.search('')).rejects.toThrow('Query must not be empty');
		});

		it('search sends correct request (mocked fetch)', async () => {
			const mockResults: SearchResult[] = [
				{
					title: 'Test Result',
					url: 'https://example.com',
					snippet: 'A test result snippet',
				},
			];

			const mockResponse = {
				ok: true,
				json: async () => ({
					web: { results: mockResults.map((r) => ({ ...r, description: r.snippet })) },
				}),
			};

			const fetchSpy = vi.fn().mockResolvedValue(mockResponse);
			const customProvider = new WebSearchProvider(mockConfig, fetchSpy);

			const results = await customProvider.search('test query');
			expect(results).toHaveLength(1);
			expect(results[0]?.title).toBe('Test Result');
			expect(results[0]?.url).toBe('https://example.com');
			expect(results[0]?.snippet).toBe('A test result snippet');

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toContain('q=test+query');
			expect(url).toContain('count=5');
			expect(url).toContain('safesearch=strict');
			expect((options.headers as Record<string, string>)['X-Subscription-Token']).toBe(
				'test-api-key',
			);
		});

		it('search handles API error gracefully', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
			});

			const customProvider = new WebSearchProvider(mockConfig, fetchSpy);
			await expect(customProvider.search('test')).rejects.toThrow('Search API error: 429');
		});

		it('search handles network error', async () => {
			const fetchSpy = vi.fn().mockRejectedValue(new Error('Network failure'));

			const customProvider = new WebSearchProvider(mockConfig, fetchSpy);
			await expect(customProvider.search('test')).rejects.toThrow('Network failure');
		});

		it('search handles empty results', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ web: { results: [] } }),
			});

			const customProvider = new WebSearchProvider(mockConfig, fetchSpy);
			const results = await customProvider.search('obscure query');
			expect(results).toHaveLength(0);
		});

		it('search handles missing web field', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});

			const customProvider = new WebSearchProvider(mockConfig, fetchSpy);
			const results = await customProvider.search('query');
			expect(results).toHaveLength(0);
		});

		it('respects maxResultsPerQuery', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					web: {
						results: Array.from({ length: 10 }, (_, i) => ({
							title: `Result ${i}`,
							url: `https://example.com/${i}`,
							description: `Snippet ${i}`,
						})),
					},
				}),
			});

			const limitedConfig: WebSearchConfig = { ...mockConfig, maxResultsPerQuery: 3 };
			const customProvider = new WebSearchProvider(limitedConfig, fetchSpy);
			const results = await customProvider.search('test');
			expect(results).toHaveLength(3);
		});

		it('rate limits consecutive requests', async () => {
			const rateLimitedConfig: WebSearchConfig = { ...mockConfig, rateLimitMs: 100 };
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ web: { results: [] } }),
			});

			const customProvider = new WebSearchProvider(rateLimitedConfig, fetchSpy);
			const start = Date.now();
			await customProvider.search('first');
			await customProvider.search('second');
			const elapsed = Date.now() - start;
			expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small timing tolerance
		});
	});

	describe('formatSearchResults', () => {
		it('formats results as markdown', () => {
			const results: SearchResult[] = [
				{
					title: 'First Result',
					url: 'https://example.com/1',
					snippet: 'First snippet text',
				},
				{
					title: 'Second Result',
					url: 'https://example.com/2',
					snippet: 'Second snippet text',
				},
			];

			const formatted = formatSearchResults(results);
			expect(formatted).toContain('**First Result**');
			expect(formatted).toContain('https://example.com/1');
			expect(formatted).toContain('First snippet text');
			expect(formatted).toContain('**Second Result**');
		});

		it('returns no results message for empty array', () => {
			const formatted = formatSearchResults([]);
			expect(formatted).toContain('검색 결과가 없습니다');
		});
	});

	describe('createWebSearchTool', () => {
		it('returns a valid tool definition', () => {
			const mockProvider = new WebSearchProvider(
				{
					apiKey: 'test',
					endpoint: 'https://api.search.brave.com/res/v1/web/search',
					maxResultsPerQuery: 5,
					safeSearch: 'strict',
					rateLimitMs: 0,
				},
				vi.fn(),
			);

			const tool = createWebSearchTool(mockProvider);
			expect(tool.name).toBe('web_search');
			expect(tool.category).toBe('search');
			expect(tool.description).toBeDefined();
			expect(tool.inputSchema).toBeDefined();
		});

		it('tool handler calls provider and formats results', async () => {
			const mockResults: SearchResult[] = [
				{ title: 'Test', url: 'https://test.com', snippet: 'Snippet' },
			];
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					web: { results: mockResults.map((r) => ({ ...r, description: r.snippet })) },
				}),
			});

			const mockProvider = new WebSearchProvider(
				{
					apiKey: 'test',
					endpoint: 'https://api.search.brave.com/res/v1/web/search',
					maxResultsPerQuery: 5,
					safeSearch: 'strict',
					rateLimitMs: 0,
				},
				fetchSpy,
			);

			const tool = createWebSearchTool(mockProvider);
			// Access the internal handler via __handler
			const result = await (tool as { __handler: (args: Record<string, unknown>) => Promise<unknown> }).__handler({
				query: 'test query',
			});
			expect(result).toBeDefined();
			expect((result as { success: boolean }).success).toBe(true);
			expect((result as { content: string }).content).toContain('**Test**');
		});
	});
});
