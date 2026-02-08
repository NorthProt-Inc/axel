import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Redis } from 'ioredis';
import pg from 'pg';

import type { AxelConfig } from './config.js';
import type { ContainerDeps } from './container.js';

/**
 * Create runtime dependencies (external SDK clients) from validated config.
 *
 * This is the only place in the codebase where real SDK instances are created.
 * Tests inject mocks/fakes via the ContainerDeps interface instead.
 */
export function createRuntimeDeps(config: AxelConfig): ContainerDeps {
	const pgPool = new pg.Pool({ connectionString: config.db.url });
	const redis = new Redis(config.redis.url);

	const anthropic = new Anthropic({ apiKey: config.llm.anthropic.apiKey });
	const google = new GoogleGenerativeAI(config.llm.google.apiKey);

	const embeddingModel = google.getGenerativeModel({
		model: config.llm.google.embeddingModel,
	});

	// Anthropic SDK's messages.create({stream:true}) returns Promise<Stream>,
	// but ContainerDeps expects a synchronous AsyncIterable return.
	// Bridge the gap with an async generator that awaits the stream first.
	const anthropicClient: ContainerDeps['anthropicClient'] = {
		messages: {
			create(params: Record<string, unknown>) {
				return (async function* () {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK overload bridge
					const stream = (await (anthropic.messages as any).create(params)) as AsyncIterable<
						Record<string, unknown>
					>;
					yield* stream;
				})() as ReturnType<ContainerDeps['anthropicClient']['messages']['create']>;
			},
		},
	};

	return {
		pgPool: pgPool as unknown as ContainerDeps['pgPool'],
		redis: redis as unknown as ContainerDeps['redis'],
		anthropicClient,
		googleClient: google as unknown as ContainerDeps['googleClient'],
		embeddingClient: embeddingModel as unknown as ContainerDeps['embeddingClient'],
	};
}
