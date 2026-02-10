import type { ToolResult } from '@axel/core/types';
import { z } from 'zod';
import { defineTool } from '../mcp/tool-registry.js';

/** Configuration for web search provider */
export interface WebSearchConfig {
	readonly apiKey: string;
	readonly endpoint: string;
	readonly maxResultsPerQuery: number;
	readonly safeSearch: 'strict' | 'moderate' | 'off';
	readonly rateLimitMs: number;
}

/** Single search result */
export interface SearchResult {
	readonly title: string;
	readonly url: string;
	readonly snippet: string;
}

/** Fetch function type (injectable for testing) */
type FetchFn = (
	url: string,
	init: RequestInit,
) => Promise<{ ok: boolean; status?: number; statusText?: string; json: () => Promise<unknown> }>;

/**
 * Web Search Provider — Brave Search API adapter (RES-008).
 *
 * Phase 1: Brave Search API (Free 2K/mo, $5/1K queries, Zero Data Retention).
 * Phase 2: Tavily fallback (not yet implemented).
 */
export class WebSearchProvider {
	private readonly config: WebSearchConfig;
	private readonly fetchFn: FetchFn;
	private lastRequestTime = 0;

	constructor(config: WebSearchConfig, fetchFn?: FetchFn) {
		this.config = config;
		this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchFn);
	}

	async search(query: string, count?: number): Promise<readonly SearchResult[]> {
		if (!query.trim()) {
			throw new Error('Query must not be empty');
		}

		// Rate limiting
		if (this.config.rateLimitMs > 0) {
			const elapsed = Date.now() - this.lastRequestTime;
			if (elapsed < this.config.rateLimitMs) {
				await new Promise((resolve) => setTimeout(resolve, this.config.rateLimitMs - elapsed));
			}
		}

		const maxResults = count ?? this.config.maxResultsPerQuery;
		const params = new URLSearchParams({
			q: query,
			count: String(maxResults),
			safesearch: this.config.safeSearch,
		});

		const url = `${this.config.endpoint}?${params.toString()}`;
		this.lastRequestTime = Date.now();

		const response = await this.fetchFn(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Accept-Encoding': 'gzip',
				'X-Subscription-Token': this.config.apiKey,
			},
		});

		if (!response.ok) {
			throw new Error(`Search API error: ${response.status ?? 'unknown'}`);
		}

		const data = (await response.json()) as {
			web?: { results?: readonly { title: string; url: string; description: string }[] };
		};
		const results = data.web?.results ?? [];

		return results.slice(0, maxResults).map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.description,
		}));
	}
}

/** Format search results as Markdown for LLM consumption */
export function formatSearchResults(results: readonly SearchResult[]): string {
	if (results.length === 0) {
		return '검색 결과가 없습니다.';
	}

	return results
		.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
		.join('\n\n');
}

/** Zod schema for web_search tool input */
const WebSearchInputSchema = z.object({
	query: z.string().min(1).describe('Search query'),
	count: z.number().int().min(1).max(10).optional().describe('Number of results (1-10, default 5)'),
	freshness: z.enum(['day', 'week', 'month', 'year']).optional().describe('Freshness filter'),
});

/**
 * Create the web_search tool definition for ToolRegistry.
 *
 * Uses Brave Search API (RES-008 recommendation).
 * Returns formatted Markdown results.
 */
export function createWebSearchTool(provider: WebSearchProvider) {
	return defineTool({
		name: 'web_search',
		description:
			'Search the web for current information. Returns titles, URLs, and snippets from top results.',
		category: 'search',
		schema: WebSearchInputSchema,
		handler: async (args): Promise<ToolResult> => {
			try {
				const results = await provider.search(args.query, args.count);
				const formatted = formatSearchResults(results);

				return {
					callId: '',
					success: true,
					content: formatted,
					error: undefined,
					durationMs: 0,
				};
			} catch (error) {
				return {
					callId: '',
					success: false,
					content: null,
					error: error instanceof Error ? error.message : String(error),
					durationMs: 0,
				};
			}
		},
	});
}
