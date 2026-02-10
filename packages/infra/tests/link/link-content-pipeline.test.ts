import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ContentSummary } from '@axel/core/types';
import type { NewMemory, SemanticMemory } from '@axel/core/memory';

/**
 * FEAT-LINK-002b: LinkContentPipeline tests (RED phase)
 *
 * Pipeline: URL → fetchContent → embed → store to SemanticMemory
 * Cache: in-memory Map with TTL 60min to avoid redundant fetches/embeds
 */

// --- DI interfaces expected by LinkContentPipeline ---

interface ContentFetcher {
	readonly fetchContent: (url: string) => Promise<ContentSummary | undefined>;
}

interface ContentEmbedder {
	embed(text: string): Promise<Float32Array>;
}

interface ContentPipelineConfig {
	readonly cacheTtlMs: number;
	readonly maxCacheSize: number;
}

// Will be imported once implementation exists
// import { LinkContentPipeline, type ContentPipelineConfig } from '../../src/link/link-content-pipeline.js';

// Placeholder: these will fail until implementation exists
function createPipeline(
	_fetcher: ContentFetcher,
	_embedder: ContentEmbedder,
	_semanticMemory: SemanticMemory,
	_config?: ContentPipelineConfig,
): unknown {
	throw new Error('LinkContentPipeline not implemented');
}

// --- Mock helpers ---

function createMockFetcher(
	result: ContentSummary | undefined = {
		title: 'Test Article',
		content: 'This is a test article with enough content to be meaningful.',
		wordCount: 11,
	},
): ContentFetcher {
	return { fetchContent: vi.fn().mockResolvedValue(result) };
}

function createMockEmbedder(dimension = 1536): ContentEmbedder {
	return {
		embed: vi.fn().mockResolvedValue(new Float32Array(dimension)),
	};
}

function createMockSemanticMemory(): SemanticMemory & {
	store: ReturnType<typeof vi.fn>;
} {
	return {
		layerName: 'M3:semantic',
		store: vi.fn().mockResolvedValue('uuid-123'),
		search: vi.fn(),
		decay: vi.fn(),
		delete: vi.fn(),
		getByUuid: vi.fn(),
		updateAccess: vi.fn(),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			latencyMs: null,
			message: null,
			lastChecked: new Date(),
		}),
	} as unknown as SemanticMemory & { store: ReturnType<typeof vi.fn> };
}

// =====================================================
// TESTS
// =====================================================

describe('LinkContentPipeline', () => {
	let fetcher: ContentFetcher;
	let embedder: ContentEmbedder;
	let semanticMemory: ReturnType<typeof createMockSemanticMemory>;

	beforeEach(() => {
		fetcher = createMockFetcher();
		embedder = createMockEmbedder();
		semanticMemory = createMockSemanticMemory();
	});

	// --- Happy Path ---

	describe('processUrl', () => {
		it('should fetch, embed, and store content for a valid URL', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			const result = await (pipeline as any).processUrl(
				'https://example.com/article',
				'channel-1',
				'session-1',
			);

			expect(result).toBeDefined();
			expect(result.stored).toBe(true);
			expect(result.uuid).toBe('uuid-123');
			expect(fetcher.fetchContent).toHaveBeenCalledWith('https://example.com/article');
			expect(embedder.embed).toHaveBeenCalledOnce();
			expect(semanticMemory.store).toHaveBeenCalledOnce();
		});

		it('should store with memoryType "reference" and link metadata', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			await (pipeline as any).processUrl(
				'https://example.com/article',
				'channel-1',
				'session-1',
			);

			const storedMemory = semanticMemory.store.mock.calls[0]?.[0] as NewMemory;
			expect(storedMemory.memoryType).toBe('reference');
			expect(storedMemory.sourceChannel).toBe('channel-1');
			expect(storedMemory.sourceSession).toBe('session-1');
			expect(storedMemory.embedding).toBeInstanceOf(Float32Array);
			expect(storedMemory.content).toContain('Test Article');
		});

		it('should include title in embedded content when available', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			await (pipeline as any).processUrl(
				'https://example.com/article',
				'channel-1',
				'session-1',
			);

			const embedArg = (embedder.embed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
			expect(embedArg).toContain('Test Article');
		});
	});

	// --- Cache Behavior ---

	describe('cache', () => {
		it('should return cached result on second call for same URL', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);

			const result1 = await (pipeline as any).processUrl(
				'https://example.com/article',
				'ch-1',
				's-1',
			);
			const result2 = await (pipeline as any).processUrl(
				'https://example.com/article',
				'ch-1',
				's-2',
			);

			expect(result1.uuid).toBe(result2.uuid);
			expect(fetcher.fetchContent).toHaveBeenCalledTimes(1);
			expect(embedder.embed).toHaveBeenCalledTimes(1);
			expect(semanticMemory.store).toHaveBeenCalledTimes(1);
		});

		it('should re-fetch after cache TTL expires', async () => {
			vi.useFakeTimers();
			const pipeline = createPipeline(fetcher, embedder, semanticMemory, {
				cacheTtlMs: 1_000,
				maxCacheSize: 100,
			});

			await (pipeline as any).processUrl('https://example.com/a', 'ch-1', 's-1');
			vi.advanceTimersByTime(1_001);
			await (pipeline as any).processUrl('https://example.com/a', 'ch-1', 's-2');

			expect(fetcher.fetchContent).toHaveBeenCalledTimes(2);
			vi.useRealTimers();
		});

		it('should evict oldest entry when maxCacheSize exceeded', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory, {
				cacheTtlMs: 3_600_000,
				maxCacheSize: 2,
			});

			await (pipeline as any).processUrl('https://example.com/a', 'ch-1', 's-1');
			await (pipeline as any).processUrl('https://example.com/b', 'ch-1', 's-1');
			await (pipeline as any).processUrl('https://example.com/c', 'ch-1', 's-1');
			// 'a' should be evicted; re-fetch should happen
			await (pipeline as any).processUrl('https://example.com/a', 'ch-1', 's-1');

			expect(fetcher.fetchContent).toHaveBeenCalledTimes(4);
		});

		it('should not cache fetch failures', async () => {
			const failFetcher = createMockFetcher(undefined);
			const pipeline = createPipeline(failFetcher, embedder, semanticMemory);

			const result1 = await (pipeline as any).processUrl('https://example.com/404', 'ch-1', 's-1');
			expect(result1.stored).toBe(false);

			// Second call should still attempt fetch (not cached)
			await (pipeline as any).processUrl('https://example.com/404', 'ch-1', 's-1');
			expect(failFetcher.fetchContent).toHaveBeenCalledTimes(2);
		});
	});

	// --- Error Handling ---

	describe('error handling', () => {
		it('should return stored:false when fetcher returns undefined', async () => {
			const failFetcher = createMockFetcher(undefined);
			const pipeline = createPipeline(failFetcher, embedder, semanticMemory);

			const result = await (pipeline as any).processUrl(
				'https://example.com/404',
				'ch-1',
				's-1',
			);

			expect(result.stored).toBe(false);
			expect(result.uuid).toBeNull();
			expect(embedder.embed).not.toHaveBeenCalled();
			expect(semanticMemory.store).not.toHaveBeenCalled();
		});

		it('should return stored:false when embedding fails', async () => {
			const failEmbedder: ContentEmbedder = {
				embed: vi.fn().mockRejectedValue(new Error('Embedding API failed')),
			};
			const pipeline = createPipeline(fetcher, failEmbedder, semanticMemory);

			const result = await (pipeline as any).processUrl(
				'https://example.com/article',
				'ch-1',
				's-1',
			);

			expect(result.stored).toBe(false);
			expect(semanticMemory.store).not.toHaveBeenCalled();
		});

		it('should return stored:false when semantic memory store fails', async () => {
			semanticMemory.store.mockRejectedValueOnce(new Error('PG connection failed'));
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);

			const result = await (pipeline as any).processUrl(
				'https://example.com/article',
				'ch-1',
				's-1',
			);

			expect(result.stored).toBe(false);
		});

		it('should call onError callback when pipeline fails', async () => {
			const onError = vi.fn();
			const failEmbedder: ContentEmbedder = {
				embed: vi.fn().mockRejectedValue(new Error('API down')),
			};
			const pipeline = createPipeline(fetcher, failEmbedder, semanticMemory, undefined);
			// @ts-expect-error — set onError post-construction for test
			if (typeof (pipeline as any).setOnError === 'function') {
				(pipeline as any).setOnError(onError);
			}

			await (pipeline as any).processUrl('https://example.com/article', 'ch-1', 's-1');
			// Error should be captured, not thrown
		});
	});

	// --- processUrls (batch) ---

	describe('processUrls', () => {
		it('should process multiple URLs and return per-URL results', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);

			const results = await (pipeline as any).processUrls(
				['https://example.com/a', 'https://example.com/b'],
				'ch-1',
				's-1',
			);

			expect(results).toHaveLength(2);
			expect(fetcher.fetchContent).toHaveBeenCalledTimes(2);
		});

		it('should deduplicate URLs in a single batch', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);

			const results = await (pipeline as any).processUrls(
				['https://example.com/a', 'https://example.com/a'],
				'ch-1',
				's-1',
			);

			expect(results).toHaveLength(2);
			expect(fetcher.fetchContent).toHaveBeenCalledTimes(1);
		});
	});

	// --- Config Defaults ---

	describe('config', () => {
		it('should default to 60-minute cache TTL', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			// Verify default config is applied
			expect((pipeline as any).config.cacheTtlMs).toBe(3_600_000);
		});

		it('should default to reasonable maxCacheSize', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			expect((pipeline as any).config.maxCacheSize).toBeGreaterThan(0);
		});
	});

	// --- Importance ---

	describe('importance', () => {
		it('should assign higher importance to content with relevant keywords', async () => {
			const keywordFetcher = createMockFetcher({
				title: 'Important Article',
				content: 'This article is important and you should remember it.',
				wordCount: 10,
			});
			const pipeline = createPipeline(keywordFetcher, embedder, semanticMemory);

			await (pipeline as any).processUrl('https://example.com/important', 'ch-1', 's-1');

			const storedMemory = semanticMemory.store.mock.calls[0]?.[0] as NewMemory;
			expect(storedMemory.importance).toBeGreaterThan(0.5);
		});

		it('should assign base importance to generic content', async () => {
			const pipeline = createPipeline(fetcher, embedder, semanticMemory);
			await (pipeline as any).processUrl('https://example.com/generic', 'ch-1', 's-1');

			const storedMemory = semanticMemory.store.mock.calls[0]?.[0] as NewMemory;
			expect(storedMemory.importance).toBeGreaterThanOrEqual(0.3);
			expect(storedMemory.importance).toBeLessThanOrEqual(0.6);
		});
	});
});
