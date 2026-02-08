import type { StreamBuffer, StreamEvent, StreamEventType } from '../../../core/src/memory/types.js';
import type { ComponentHealth } from '../../../core/src/types/health.js';

/** Minimal Redis client interface for Streams */
interface RedisStreamClient {
	xadd(key: string, id: string, ...fieldValues: string[]): Promise<string>;
	xrange(
		key: string,
		start: string,
		end: string,
		...args: (string | number)[]
	): Promise<[string, string[]][]>;
	xtrim(key: string, strategy: string, approx: string, maxLen: number): Promise<number>;
	xlen(key: string): Promise<number>;
}

const STREAM_KEY = 'axel:stream:events';

/**
 * Redis Streams-backed Stream Buffer (ADR-013 M0).
 *
 * Uses Redis Streams (XADD/XRANGE/XTRIM) for real-time event buffering.
 * Events are serialized as JSON in the 'data' field.
 */
class RedisStreamBuffer implements StreamBuffer {
	readonly layerName = 'M0:stream' as const;

	private readonly redis: RedisStreamClient;

	constructor(redis: RedisStreamClient) {
		this.redis = redis;
	}

	async push(event: Omit<StreamEvent, 'eventId'>): Promise<string> {
		const data = JSON.stringify({
			type: event.type,
			userId: event.userId,
			channelId: event.channelId,
			timestamp: event.timestamp.toISOString(),
			metadata: event.metadata,
		});

		const eventId = await this.redis.xadd(STREAM_KEY, '*', 'data', data);
		return eventId;
	}

	async *consume(count: number): AsyncGenerator<StreamEvent> {
		const entries = await this.redis.xrange(STREAM_KEY, '-', '+', 'COUNT', count);

		for (const [id, fields] of entries) {
			const dataIndex = fields.indexOf('data');
			if (dataIndex === -1) continue;

			const dataValue = fields[dataIndex + 1];
			if (dataValue === undefined) continue;

			const raw = JSON.parse(dataValue) as {
				type: StreamEventType;
				userId: string;
				channelId: string;
				timestamp: string;
				metadata: Record<string, unknown>;
			};

			yield {
				eventId: id,
				type: raw.type,
				userId: raw.userId,
				channelId: raw.channelId,
				timestamp: new Date(raw.timestamp),
				metadata: raw.metadata,
			};
		}
	}

	async trim(maxLen: number): Promise<number> {
		return this.redis.xtrim(STREAM_KEY, 'MAXLEN', '~', maxLen);
	}

	async healthCheck(): Promise<ComponentHealth> {
		const now = new Date();
		try {
			const start = Date.now();
			await this.redis.xlen(STREAM_KEY);
			const latencyMs = Date.now() - start;
			return { state: 'healthy', latencyMs, message: null, lastChecked: now };
		} catch {
			return {
				state: 'unhealthy',
				latencyMs: null,
				message: 'Redis stream health check failed',
				lastChecked: now,
			};
		}
	}
}

export { RedisStreamBuffer, type RedisStreamClient };
