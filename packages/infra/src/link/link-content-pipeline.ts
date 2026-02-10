/**
 * FEAT-LINK-002b: LinkContentPipeline
 *
 * Pipeline: URL → fetchContent → embed → store to SemanticMemory (M3).
 * In-memory cache with configurable TTL (default 60min) prevents
 * redundant fetches and embeddings for the same URL.
 *
 * DI-injected: ContentFetcher (ReadabilityContentProvider), ContentEmbedder
 * (GeminiEmbeddingService), SemanticMemory (PgSemanticMemory).
 */

import type { ContentSummary } from '@axel/core/types';
import type { NewMemory, SemanticMemory } from '@axel/core/memory';

// --- DI Interfaces ---

export interface ContentFetcher {
	readonly fetchContent: (url: string) => Promise<ContentSummary | undefined>;
}

export interface ContentEmbedder {
	embed(text: string): Promise<Float32Array>;
}

export interface ContentPipelineConfig {
	readonly cacheTtlMs: number;
	readonly maxCacheSize: number;
}

export interface PipelineResult {
	readonly stored: boolean;
	readonly uuid: string | null;
	readonly url: string;
}

// --- Constants ---

const DEFAULT_CONFIG: ContentPipelineConfig = {
	cacheTtlMs: 3_600_000, // 60 minutes
	maxCacheSize: 500,
};

const IMPORTANCE_KEYWORDS = ['important', 'remember', '중요', '기억'] as const;
const BASE_IMPORTANCE = 0.4;
const KEYWORD_BOOST = 0.15;

// --- Cache Entry ---

interface CacheEntry {
	readonly uuid: string;
	readonly expiresAt: number;
}

// --- Implementation ---

function formatEmbeddingText(url: string, summary: ContentSummary): string {
	const parts: string[] = [];
	if (summary.title) {
		parts.push(summary.title);
	}
	if (summary.excerpt) {
		parts.push(summary.excerpt);
	}
	parts.push(summary.content);
	parts.push(`Source: ${url}`);
	return parts.join('\n\n');
}

function calculateImportance(content: string): number {
	let importance = BASE_IMPORTANCE;
	const lower = content.toLowerCase();

	for (const keyword of IMPORTANCE_KEYWORDS) {
		if (lower.includes(keyword.toLowerCase())) {
			importance += KEYWORD_BOOST;
		}
	}

	if (content.length > 500) {
		importance += 0.1;
	}

	return Math.min(importance, 1.0);
}

class LinkContentPipeline {
	private readonly fetcher: ContentFetcher;
	private readonly embedder: ContentEmbedder;
	private readonly semanticMemory: SemanticMemory;
	readonly config: ContentPipelineConfig;
	private readonly cache = new Map<string, CacheEntry>();
	private onError: ((error: unknown) => void) | undefined;

	constructor(
		fetcher: ContentFetcher,
		embedder: ContentEmbedder,
		semanticMemory: SemanticMemory,
		config?: ContentPipelineConfig,
	) {
		this.fetcher = fetcher;
		this.embedder = embedder;
		this.semanticMemory = semanticMemory;
		this.config = config ?? DEFAULT_CONFIG;
	}

	setOnError(handler: (error: unknown) => void): void {
		this.onError = handler;
	}

	async processUrl(
		url: string,
		channelId: string,
		sessionId: string,
	): Promise<PipelineResult> {
		// Check cache first
		const cached = this.getCached(url);
		if (cached !== undefined) {
			return { stored: true, uuid: cached.uuid, url };
		}

		// Fetch content
		const summary = await this.safeFetch(url);
		if (summary === undefined) {
			return { stored: false, uuid: null, url };
		}

		// Embed + Store
		try {
			const embeddingText = formatEmbeddingText(url, summary);
			const embedding = await this.embedder.embed(embeddingText);
			const importance = calculateImportance(summary.content);

			const newMemory: NewMemory = {
				content: embeddingText,
				memoryType: 'reference',
				importance,
				embedding,
				sourceChannel: channelId,
				sourceSession: sessionId,
			};

			const uuid = await this.semanticMemory.store(newMemory);
			this.setCache(url, uuid);
			return { stored: true, uuid, url };
		} catch (error: unknown) {
			this.reportError(error);
			return { stored: false, uuid: null, url };
		}
	}

	async processUrls(
		urls: readonly string[],
		channelId: string,
		sessionId: string,
	): Promise<readonly PipelineResult[]> {
		const seen = new Map<string, PipelineResult>();
		const results: PipelineResult[] = [];

		for (const url of urls) {
			const existing = seen.get(url);
			if (existing !== undefined) {
				results.push(existing);
				continue;
			}

			const result = await this.processUrl(url, channelId, sessionId);
			seen.set(url, result);
			results.push(result);
		}

		return results;
	}

	private getCached(url: string): CacheEntry | undefined {
		const entry = this.cache.get(url);
		if (entry === undefined) {
			return undefined;
		}
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(url);
			return undefined;
		}
		return entry;
	}

	private setCache(url: string, uuid: string): void {
		// Evict oldest if over capacity
		if (this.cache.size >= this.config.maxCacheSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(url, {
			uuid,
			expiresAt: Date.now() + this.config.cacheTtlMs,
		});
	}

	private async safeFetch(url: string): Promise<ContentSummary | undefined> {
		try {
			return await this.fetcher.fetchContent(url);
		} catch (error: unknown) {
			this.reportError(error);
			return undefined;
		}
	}

	private reportError(error: unknown): void {
		if (!this.onError) return;
		try {
			this.onError(error);
		} catch {
			// onError itself failed — silently ignore
		}
	}
}

export { LinkContentPipeline, DEFAULT_CONFIG };
