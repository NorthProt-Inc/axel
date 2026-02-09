import { PermanentError } from '@axel/core/types';
import { describe, expect, it, vi } from 'vitest';
import type { LlmChatChunk, LlmChatParams, LlmProvider } from '@axel/core/orchestrator';
import { FallbackLlmProvider } from '../../src/llm/fallback-provider.js';

const DUMMY_PARAMS: LlmChatParams = {
	messages: [
		{
			sessionId: '',
			turnId: 0,
			role: 'user',
			content: 'hi',
			channelId: 'test',
			timestamp: new Date(),
			emotionalContext: '',
			metadata: {},
		},
	],
	tools: [],
};

function makeProvider(chunks: LlmChatChunk[]): LlmProvider {
	return {
		async *chat() {
			for (const chunk of chunks) {
				yield chunk;
			}
		},
	};
}

function makeFailingProvider(error: Error): LlmProvider {
	return {
		async *chat() {
			throw error;
		},
	};
}

async function collectChunks(stream: AsyncIterable<LlmChatChunk>): Promise<LlmChatChunk[]> {
	const result: LlmChatChunk[] = [];
	for await (const chunk of stream) {
		result.push(chunk);
	}
	return result;
}

describe('FallbackLlmProvider', () => {
	it('uses first provider when available', async () => {
		const p1 = makeProvider([{ type: 'text', content: 'hello' }]);
		const fallback = new FallbackLlmProvider([{ name: 'p1', provider: p1 }]);

		const chunks = await collectChunks(fallback.chat(DUMMY_PARAMS));
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual({ type: 'text', content: 'hello' });
	});

	it('falls through to second provider when first fails', async () => {
		const p1 = makeFailingProvider(new Error('p1 down'));
		const p2 = makeProvider([{ type: 'text', content: 'from p2' }]);
		const fallback = new FallbackLlmProvider([
			{ name: 'p1', provider: p1 },
			{ name: 'p2', provider: p2 },
		]);

		const chunks = await collectChunks(fallback.chat(DUMMY_PARAMS));
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual({ type: 'text', content: 'from p2' });
	});

	it('throws PermanentError when all providers fail', async () => {
		const p1 = makeFailingProvider(new Error('p1 down'));
		const p2 = makeFailingProvider(new Error('p2 down'));
		const fallback = new FallbackLlmProvider([
			{ name: 'p1', provider: p1 },
			{ name: 'p2', provider: p2 },
		]);

		await expect(async () => {
			await collectChunks(fallback.chat(DUMMY_PARAMS));
		}).rejects.toThrow(PermanentError);
	});

	it('skips provider with open circuit', async () => {
		const p1 = makeFailingProvider(new Error('p1 down'));
		const p2 = makeProvider([{ type: 'text', content: 'p2 works' }]);
		const fallback = new FallbackLlmProvider([
			{ name: 'p1', provider: p1 },
			{ name: 'p2', provider: p2 },
		]);

		// Trigger p1 failure 5 times to open circuit
		for (let i = 0; i < 5; i++) {
			try {
				await collectChunks(fallback.chat(DUMMY_PARAMS));
			} catch {
				// Expected until p2 kicks in
			}
		}

		// Now p1 circuit should be open, p2 should be used directly
		const chunks = await collectChunks(fallback.chat(DUMMY_PARAMS));
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual({ type: 'text', content: 'p2 works' });
	});

	it('logs provider switch', async () => {
		const warnCalls: unknown[] = [];
		const mockLogger = {
			info: vi.fn(),
			warn: (...args: unknown[]) => warnCalls.push(args),
			error: vi.fn(),
			debug: vi.fn(),
			child: vi.fn().mockReturnThis(),
		};

		const p1 = makeFailingProvider(new Error('p1 down'));
		const p2 = makeProvider([{ type: 'text', content: 'p2' }]);
		const fallback = new FallbackLlmProvider(
			[
				{ name: 'anthropic', provider: p1 },
				{ name: 'google', provider: p2 },
			],
			mockLogger,
		);

		await collectChunks(fallback.chat(DUMMY_PARAMS));
		expect(warnCalls.length).toBeGreaterThan(0);
	});
});
