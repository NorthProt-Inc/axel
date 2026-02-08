import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	AxelChannel,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import { CliChannel } from '../../src/cli/cli-channel.js';

/** Stub readline.Interface for testing without real stdin/stdout */
function createMockReadline() {
	const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

	const rl = {
		on(event: string, handler: (...args: unknown[]) => void) {
			const existing = listeners.get(event) ?? [];
			existing.push(handler);
			listeners.set(event, existing);
			return rl;
		},
		close: vi.fn(),
		prompt: vi.fn(),
		setPrompt: vi.fn(),
	};

	function emit(event: string, ...args: unknown[]) {
		const handlers = listeners.get(event) ?? [];
		for (const h of handlers) {
			h(...args);
		}
	}

	return { rl, emit, listeners };
}

describe('CliChannel', () => {
	let channel: CliChannel;

	beforeEach(() => {
		channel = new CliChannel();
	});

	afterEach(async () => {
		try {
			await channel.stop();
		} catch {
			// already stopped or never started
		}
	});

	describe('interface compliance', () => {
		it('has id "cli"', () => {
			expect(channel.id).toBe('cli');
		});

		it('declares correct capabilities', () => {
			const caps = channel.capabilities;

			expect(caps.streaming).toBe(true);
			expect(caps.richMedia).toBe(false);
			expect(caps.reactions).toBe(false);
			expect(caps.threads).toBe(false);
			expect(caps.voiceInput).toBe(false);
			expect(caps.maxMessageLength).toBe(Number.MAX_SAFE_INTEGER);
			expect(caps.typingIndicator).toBe(false);
		});

		it('implements AxelChannel interface', () => {
			const asChannel: AxelChannel = channel;
			expect(asChannel.start).toBeTypeOf('function');
			expect(asChannel.stop).toBeTypeOf('function');
			expect(asChannel.healthCheck).toBeTypeOf('function');
			expect(asChannel.onMessage).toBeTypeOf('function');
			expect(asChannel.send).toBeTypeOf('function');
			expect(asChannel.sendStreaming).toBeTypeOf('function');
		});
	});

	describe('lifecycle', () => {
		it('starts and transitions to healthy', async () => {
			const { rl } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			await channel.start();
			const health = await channel.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('stops and transitions to unhealthy', async () => {
			const { rl } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			await channel.start();
			await channel.stop();
			const health = await channel.healthCheck();

			expect(health.state).toBe('unhealthy');
			expect(rl.close).toHaveBeenCalled();
		});

		it('is unhealthy before start', async () => {
			const health = await channel.healthCheck();
			expect(health.state).toBe('unhealthy');
		});

		it('throws when starting twice', async () => {
			const { rl } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			await channel.start();
			await expect(channel.start()).rejects.toThrow(
				'CLI channel already started',
			);
		});

		it('is safe to stop when not started', async () => {
			// stop() before start() should not throw
			await expect(channel.stop()).resolves.toBeUndefined();
		});

		it('healthCheck returns uptime', async () => {
			const { rl } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			await channel.start();
			// Small delay to ensure uptime > 0
			await new Promise((r) => setTimeout(r, 10));
			const health = await channel.healthCheck();

			expect(health.uptime).toBeGreaterThan(0);
			expect(health.timestamp).toBeInstanceOf(Date);
			expect(health.checks).toEqual({});
		});
	});

	describe('inbound messages', () => {
		it('calls handler with normalized InboundMessage when line is received', async () => {
			const { rl, emit } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			const received: InboundMessage[] = [];
			const handler: InboundHandler = async (msg) => {
				received.push(msg);
			};

			channel.onMessage(handler);
			await channel.start();

			emit('line', 'Hello Axel');

			// Handler is async, give it a tick
			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(1);
			expect(received[0]?.userId).toBe('cli-user');
			expect(received[0]?.channelId).toBe('cli');
			expect(received[0]?.content).toBe('Hello Axel');
			expect(received[0]?.timestamp).toBeInstanceOf(Date);
		});

		it('ignores empty lines', async () => {
			const { rl, emit } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});
			await channel.start();

			emit('line', '');
			emit('line', '   ');
			emit('line', '\t');

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(0);
		});

		it('trims whitespace from input', async () => {
			const { rl, emit } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});
			await channel.start();

			emit('line', '  Hello  ');

			await new Promise((r) => setTimeout(r, 10));

			expect(received[0]?.content).toBe('Hello');
		});

		it('supports multiple handlers', async () => {
			const { rl, emit } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			const received1: string[] = [];
			const received2: string[] = [];

			channel.onMessage(async (msg) => {
				received1.push(msg.content);
			});
			channel.onMessage(async (msg) => {
				received2.push(msg.content);
			});

			await channel.start();
			emit('line', 'test');

			await new Promise((r) => setTimeout(r, 10));

			expect(received1).toEqual(['test']);
			expect(received2).toEqual(['test']);
		});
	});

	describe('outbound messages', () => {
		it('send() writes content to output', async () => {
			const output: string[] = [];
			const { rl } = createMockReadline();
			channel = new CliChannel({
				createReadline: () => rl as never,
				write: (text: string) => {
					output.push(text);
				},
			});

			await channel.start();
			await channel.send('cli-user', { content: 'Hello from Axel!' });

			expect(output.join('')).toContain('Hello from Axel!');
		});

		it('send() throws when not started', async () => {
			await expect(
				channel.send('cli-user', { content: 'test' }),
			).rejects.toThrow('CLI channel not started');
		});

		it('sendStreaming() writes chunks incrementally', async () => {
			const output: string[] = [];
			const { rl } = createMockReadline();
			channel = new CliChannel({
				createReadline: () => rl as never,
				write: (text: string) => {
					output.push(text);
				},
			});

			await channel.start();

			async function* testStream(): AsyncIterable<string> {
				yield 'Hello ';
				yield 'World';
				yield '!';
			}

			await channel.sendStreaming!('cli-user', testStream());

			const fullOutput = output.join('');
			expect(fullOutput).toContain('Hello ');
			expect(fullOutput).toContain('World');
			expect(fullOutput).toContain('!');
		});

		it('sendStreaming() throws when not started', async () => {
			async function* stream(): AsyncIterable<string> {
				yield 'test';
			}

			await expect(
				channel.sendStreaming!('cli-user', stream()),
			).rejects.toThrow('CLI channel not started');
		});
	});

	describe('close event', () => {
		it('handles readline close event gracefully', async () => {
			const { rl, emit } = createMockReadline();
			channel = new CliChannel({ createReadline: () => rl as never });

			await channel.start();
			emit('close');

			const health = await channel.healthCheck();
			expect(health.state).toBe('unhealthy');
		});
	});

	describe('error handling', () => {
		it('catches handler errors without crashing', async () => {
			const { rl, emit } = createMockReadline();
			const errors: unknown[] = [];
			channel = new CliChannel({
				createReadline: () => rl as never,
				onError: (err: unknown) => {
					errors.push(err);
				},
			});

			channel.onMessage(async () => {
				throw new Error('handler failed');
			});

			await channel.start();
			emit('line', 'trigger error');

			await new Promise((r) => setTimeout(r, 10));

			expect(errors).toHaveLength(1);
			expect((errors[0] as Error).message).toBe('handler failed');
		});
	});
});
