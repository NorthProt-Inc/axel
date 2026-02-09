import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SemanticMemory, NewMemory } from '@axel/core/memory';
import type { ComponentHealth } from '@axel/core/types';
import {
	SemanticMemoryWriter,
	type EmbeddingProvider,
	type ImportanceConfig,
} from '../../src/memory/semantic-memory-writer.js';

// ─── Test Doubles ───

function createMockEmbeddingProvider(): EmbeddingProvider {
	return {
		embed: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3])),
	};
}

function createMockSemanticMemory(): SemanticMemory {
	return {
		layerName: 'M3:semantic',
		store: vi.fn().mockResolvedValue('mem-uuid-1'),
		search: vi.fn().mockResolvedValue([]),
		decay: vi.fn().mockResolvedValue({
			processed: 0,
			deleted: 0,
			minImportance: 0,
			maxImportance: 0,
			avgImportance: 0,
		}),
		delete: vi.fn().mockResolvedValue(undefined),
		getByUuid: vi.fn().mockResolvedValue(null),
		updateAccess: vi.fn().mockResolvedValue(undefined),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy' as const,
			latencyMs: 1,
			message: null,
			lastChecked: new Date(),
		} satisfies ComponentHealth),
	};
}

const DEFAULT_CONFIG: ImportanceConfig = {
	minContentLength: 100,
	keywords: ['remember', 'important', '기억', '중요'],
	baseImportance: 0.5,
	keywordBoost: 0.2,
	lengthBoost: 0.1,
	lengthThreshold: 500,
};

describe('SemanticMemoryWriter', () => {
	let writer: SemanticMemoryWriter;
	let mockEmbedding: EmbeddingProvider;
	let mockSemantic: SemanticMemory;

	beforeEach(() => {
		mockEmbedding = createMockEmbeddingProvider();
		mockSemantic = createMockSemanticMemory();
		writer = new SemanticMemoryWriter(mockEmbedding, mockSemantic, DEFAULT_CONFIG);
	});

	describe('storeConversationMemory', () => {
		it('should store memory when content exceeds minContentLength', async () => {
			const longContent = 'a'.repeat(150);
			const result = await writer.storeConversationMemory({
				userContent: longContent,
				assistantContent: 'some response',
				channelId: 'cli',
				sessionId: 'sess-1',
			});

			expect(result).not.toBeNull();
			expect(mockEmbedding.embed).toHaveBeenCalledOnce();
			expect(mockSemantic.store).toHaveBeenCalledOnce();

			const storedArg = (mockSemantic.store as ReturnType<typeof vi.fn>).mock
				.calls[0]![0] as NewMemory;
			expect(storedArg.memoryType).toBe('conversation');
			expect(storedArg.sourceChannel).toBe('cli');
			expect(storedArg.sourceSession).toBe('sess-1');
			expect(storedArg.embedding).toBeInstanceOf(Float32Array);
		});

		it('should store memory when content contains a keyword', async () => {
			const shortContent = 'Please remember this fact';
			const result = await writer.storeConversationMemory({
				userContent: shortContent,
				assistantContent: 'Noted.',
				channelId: 'discord',
				sessionId: 'sess-2',
			});

			expect(result).not.toBeNull();
			expect(mockEmbedding.embed).toHaveBeenCalledOnce();
			expect(mockSemantic.store).toHaveBeenCalledOnce();
		});

		it('should skip storage when content is short and has no keywords', async () => {
			const shortContent = 'Hi there';
			const result = await writer.storeConversationMemory({
				userContent: shortContent,
				assistantContent: 'Hello!',
				channelId: 'cli',
				sessionId: 'sess-3',
			});

			expect(result).toBeNull();
			expect(mockEmbedding.embed).not.toHaveBeenCalled();
			expect(mockSemantic.store).not.toHaveBeenCalled();
		});

		it('should combine user and assistant content for embedding', async () => {
			const content = 'This is important information about the project';
			const response = 'I will remember this for you';
			await writer.storeConversationMemory({
				userContent: content,
				assistantContent: response,
				channelId: 'cli',
				sessionId: 'sess-4',
			});

			const embedCall = (mockEmbedding.embed as ReturnType<typeof vi.fn>).mock.calls[0]!;
			const embeddedText = embedCall[0] as string;
			expect(embeddedText).toContain(content);
			expect(embeddedText).toContain(response);
		});

		it('should calculate higher importance for keyword matches', async () => {
			const keywordContent = 'This is really important and you must remember it';
			await writer.storeConversationMemory({
				userContent: keywordContent,
				assistantContent: 'Understood.',
				channelId: 'cli',
				sessionId: 'sess-5',
			});

			const storedArg = (mockSemantic.store as ReturnType<typeof vi.fn>).mock
				.calls[0]![0] as NewMemory;
			// baseImportance (0.5) + keywordBoost (0.2) * 2 keywords = 0.9
			expect(storedArg.importance).toBeGreaterThan(DEFAULT_CONFIG.baseImportance);
		});

		it('should calculate higher importance for long content', async () => {
			const longContent = 'a'.repeat(600);
			await writer.storeConversationMemory({
				userContent: longContent,
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-6',
			});

			const storedArg = (mockSemantic.store as ReturnType<typeof vi.fn>).mock
				.calls[0]![0] as NewMemory;
			// baseImportance (0.5) + lengthBoost (0.1) = 0.6
			expect(storedArg.importance).toBeGreaterThanOrEqual(
				DEFAULT_CONFIG.baseImportance + DEFAULT_CONFIG.lengthBoost,
			);
		});

		it('should cap importance at 1.0', async () => {
			const keywordHeavy =
				'remember this important thing, 기억해 중요한 것 remember remember important 기억 중요';
			await writer.storeConversationMemory({
				userContent: keywordHeavy,
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-7',
			});

			const storedArg = (mockSemantic.store as ReturnType<typeof vi.fn>).mock
				.calls[0]![0] as NewMemory;
			expect(storedArg.importance).toBeLessThanOrEqual(1.0);
		});

		it('should return the stored memory UUID', async () => {
			const content = 'This is something important to save';
			const result = await writer.storeConversationMemory({
				userContent: content,
				assistantContent: 'Saved.',
				channelId: 'cli',
				sessionId: 'sess-8',
			});

			expect(result).toBe('mem-uuid-1');
		});
	});

	describe('error handling', () => {
		it('should return null when embedding fails', async () => {
			(mockEmbedding.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Embedding API unavailable'),
			);

			const result = await writer.storeConversationMemory({
				userContent: 'remember this important fact',
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-err-1',
			});

			expect(result).toBeNull();
			expect(mockSemantic.store).not.toHaveBeenCalled();
		});

		it('should return null when semantic store fails', async () => {
			(mockSemantic.store as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('PG connection lost'),
			);

			const result = await writer.storeConversationMemory({
				userContent: 'remember this important fact',
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-err-2',
			});

			expect(result).toBeNull();
		});

		it('should call onError callback on embedding failure', async () => {
			const onError = vi.fn();
			const writerWithCallback = new SemanticMemoryWriter(
				mockEmbedding,
				mockSemantic,
				DEFAULT_CONFIG,
				onError,
			);

			const embeddingError = new Error('Rate limited');
			(mockEmbedding.embed as ReturnType<typeof vi.fn>).mockRejectedValue(embeddingError);

			await writerWithCallback.storeConversationMemory({
				userContent: 'remember this',
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-err-3',
			});

			expect(onError).toHaveBeenCalledWith(embeddingError);
		});

		it('should call onError callback on store failure', async () => {
			const onError = vi.fn();
			const writerWithCallback = new SemanticMemoryWriter(
				mockEmbedding,
				mockSemantic,
				DEFAULT_CONFIG,
				onError,
			);

			const storeError = new Error('Disk full');
			(mockSemantic.store as ReturnType<typeof vi.fn>).mockRejectedValue(storeError);

			await writerWithCallback.storeConversationMemory({
				userContent: 'important fact to remember',
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-err-4',
			});

			expect(onError).toHaveBeenCalledWith(storeError);
		});

		it('should not throw when onError callback itself fails', async () => {
			const failingOnError = vi.fn().mockImplementation(() => {
				throw new Error('callback exploded');
			});
			const writerWithBadCallback = new SemanticMemoryWriter(
				mockEmbedding,
				mockSemantic,
				DEFAULT_CONFIG,
				failingOnError,
			);

			(mockEmbedding.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('API down'),
			);

			const result = await writerWithBadCallback.storeConversationMemory({
				userContent: 'remember this',
				assistantContent: 'OK.',
				channelId: 'cli',
				sessionId: 'sess-err-5',
			});

			expect(result).toBeNull();
		});
	});

	describe('shouldStore (importance heuristic)', () => {
		it('should return true for Korean keyword 기억', async () => {
			const result = await writer.storeConversationMemory({
				userContent: '이것을 기억해줘',
				assistantContent: '알겠습니다.',
				channelId: 'cli',
				sessionId: 'sess-kr-1',
			});

			expect(result).not.toBeNull();
		});

		it('should return true for Korean keyword 중요', async () => {
			const result = await writer.storeConversationMemory({
				userContent: '이건 중요한 정보야',
				assistantContent: '알겠습니다.',
				channelId: 'cli',
				sessionId: 'sess-kr-2',
			});

			expect(result).not.toBeNull();
		});

		it('should be case-insensitive for keyword matching', async () => {
			const result = await writer.storeConversationMemory({
				userContent: 'REMEMBER this please',
				assistantContent: 'Got it.',
				channelId: 'cli',
				sessionId: 'sess-case-1',
			});

			expect(result).not.toBeNull();
		});
	});

	describe('DEFAULT_IMPORTANCE_CONFIG', () => {
		it('should use default config when none provided', async () => {
			const defaultWriter = new SemanticMemoryWriter(mockEmbedding, mockSemantic);

			// Default config should also skip short non-keyword content
			const result = await defaultWriter.storeConversationMemory({
				userContent: 'hello',
				assistantContent: 'hi',
				channelId: 'cli',
				sessionId: 'sess-def-1',
			});

			expect(result).toBeNull();
		});

		it('should store with default config when content is long enough', async () => {
			const defaultWriter = new SemanticMemoryWriter(mockEmbedding, mockSemantic);

			const result = await defaultWriter.storeConversationMemory({
				userContent: 'a'.repeat(200),
				assistantContent: 'response',
				channelId: 'cli',
				sessionId: 'sess-def-2',
			});

			expect(result).not.toBeNull();
		});
	});
});
