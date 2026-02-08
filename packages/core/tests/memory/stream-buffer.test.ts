import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStreamBuffer } from '../../src/memory/stream-buffer.js';
import type { StreamEvent, StreamEventType } from '../../src/memory/types.js';

describe('InMemoryStreamBuffer', () => {
	let buffer: InMemoryStreamBuffer;

	beforeEach(() => {
		buffer = new InMemoryStreamBuffer();
	});

	describe('layerName', () => {
		it('should be "M0:stream"', () => {
			expect(buffer.layerName).toBe('M0:stream');
		});
	});

	describe('push', () => {
		it('should return a generated event ID', async () => {
			const id = await buffer.push({
				type: 'typing_start',
				userId: 'user-1',
				channelId: 'discord-123',
				timestamp: new Date(),
				metadata: {},
			});
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});

		it('should store events that can be consumed', async () => {
			await buffer.push({
				type: 'typing_start',
				userId: 'user-1',
				channelId: 'discord-123',
				timestamp: new Date(),
				metadata: {},
			});

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(10)) {
				events.push(event);
			}
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe('typing_start');
		});

		it('should support all event types', async () => {
			const types: readonly StreamEventType[] = [
				'typing_start',
				'channel_switch',
				'iot_trigger',
				'presence_change',
			];

			for (const type of types) {
				await buffer.push({
					type,
					userId: 'user-1',
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(10)) {
				events.push(event);
			}
			expect(events).toHaveLength(4);
		});
	});

	describe('consume', () => {
		it('should consume up to count events', async () => {
			for (let i = 0; i < 5; i++) {
				await buffer.push({
					type: 'typing_start',
					userId: `user-${i}`,
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(3)) {
				events.push(event);
			}
			expect(events).toHaveLength(3);
		});

		it('should return empty generator when buffer is empty', async () => {
			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(10)) {
				events.push(event);
			}
			expect(events).toHaveLength(0);
		});

		it('should consume events in FIFO order', async () => {
			for (let i = 0; i < 3; i++) {
				await buffer.push({
					type: 'typing_start',
					userId: `user-${i}`,
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(3)) {
				events.push(event);
			}
			expect(events[0]!.userId).toBe('user-0');
			expect(events[1]!.userId).toBe('user-1');
			expect(events[2]!.userId).toBe('user-2');
		});
	});

	describe('trim', () => {
		it('should trim events beyond maxLen', async () => {
			for (let i = 0; i < 10; i++) {
				await buffer.push({
					type: 'typing_start',
					userId: `user-${i}`,
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			const trimmed = await buffer.trim(5);
			expect(trimmed).toBe(5);

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(100)) {
				events.push(event);
			}
			expect(events).toHaveLength(5);
		});

		it('should return 0 when buffer is within maxLen', async () => {
			for (let i = 0; i < 3; i++) {
				await buffer.push({
					type: 'typing_start',
					userId: `user-${i}`,
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			const trimmed = await buffer.trim(10);
			expect(trimmed).toBe(0);
		});

		it('should keep the most recent events', async () => {
			for (let i = 0; i < 5; i++) {
				await buffer.push({
					type: 'typing_start',
					userId: `user-${i}`,
					channelId: 'ch-1',
					timestamp: new Date(),
					metadata: {},
				});
			}

			await buffer.trim(2);

			const events: StreamEvent[] = [];
			for await (const event of buffer.consume(100)) {
				events.push(event);
			}
			expect(events).toHaveLength(2);
			// Should keep the most recent (user-3, user-4)
			expect(events[0]!.userId).toBe('user-3');
			expect(events[1]!.userId).toBe('user-4');
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await buffer.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
