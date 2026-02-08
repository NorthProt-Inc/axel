import type { ComponentHealth } from '../types/health.js';
import type { StreamBuffer, StreamEvent } from './types.js';

/** In-memory stub for M0 Stream Buffer (ADR-013). Production uses Redis Streams. */
export class InMemoryStreamBuffer implements StreamBuffer {
	readonly layerName = 'M0:stream' as const;
	private readonly events: StreamEvent[] = [];
	private nextId = 0;

	async push(event: Omit<StreamEvent, 'eventId'>): Promise<string> {
		const eventId = `stream-${++this.nextId}`;
		this.events.push({ ...event, eventId });
		return eventId;
	}

	async *consume(count: number): AsyncGenerator<StreamEvent> {
		const toConsume = Math.min(count, this.events.length);
		for (let i = 0; i < toConsume; i++) {
			yield this.events[i]!;
		}
	}

	async trim(maxLen: number): Promise<number> {
		if (this.events.length <= maxLen) {
			return 0;
		}
		const trimCount = this.events.length - maxLen;
		this.events.splice(0, trimCount);
		return trimCount;
	}

	async healthCheck(): Promise<ComponentHealth> {
		return {
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		};
	}
}
