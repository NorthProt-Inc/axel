import { describe, expect, it } from 'vitest';
import {
	createStreamSession,
	feedChunk,
	completeStream,
	getStreamOutput,
	type StreamSession,
} from '../src/cli/streaming.js';

describe('CLI Streaming — StreamSession lifecycle', () => {
	describe('createStreamSession', () => {
		it('creates a session with empty accumulated content', () => {
			const session = createStreamSession();
			expect(session.accumulated).toBe('');
			expect(session.chunkCount).toBe(0);
			expect(session.completed).toBe(false);
		});
	});

	describe('feedChunk', () => {
		it('appends chunk to accumulated content', () => {
			const session = createStreamSession();
			const updated = feedChunk(session, 'Hello');
			expect(updated.accumulated).toBe('Hello');
			expect(updated.chunkCount).toBe(1);
		});

		it('concatenates multiple chunks', () => {
			let session = createStreamSession();
			session = feedChunk(session, 'Hel');
			session = feedChunk(session, 'lo ');
			session = feedChunk(session, 'world');
			expect(session.accumulated).toBe('Hello world');
			expect(session.chunkCount).toBe(3);
		});

		it('handles empty chunk gracefully', () => {
			const session = createStreamSession();
			const updated = feedChunk(session, '');
			expect(updated.accumulated).toBe('');
			expect(updated.chunkCount).toBe(1);
		});

		it('does not modify original session (immutable)', () => {
			const session = createStreamSession();
			feedChunk(session, 'test');
			expect(session.accumulated).toBe('');
			expect(session.chunkCount).toBe(0);
		});
	});

	describe('completeStream', () => {
		it('marks session as completed', () => {
			let session = createStreamSession();
			session = feedChunk(session, 'done');
			const completed = completeStream(session);
			expect(completed.completed).toBe(true);
		});

		it('preserves accumulated content', () => {
			let session = createStreamSession();
			session = feedChunk(session, 'content');
			const completed = completeStream(session);
			expect(completed.accumulated).toBe('content');
		});

		it('does not modify original session (immutable)', () => {
			const session = createStreamSession();
			completeStream(session);
			expect(session.completed).toBe(false);
		});
	});

	describe('getStreamOutput', () => {
		it('returns rendered markdown for completed session', () => {
			let session = createStreamSession();
			session = feedChunk(session, '**bold** text');
			session = completeStream(session);
			const output = getStreamOutput(session);
			expect(output).toContain('bold');
			expect(output).toContain('Axel');
		});

		it('returns raw accumulated for incomplete session', () => {
			let session = createStreamSession();
			session = feedChunk(session, 'partial content');
			const output = getStreamOutput(session);
			expect(output).toBe('partial content');
		});

		it('returns empty string for empty completed session', () => {
			const session = completeStream(createStreamSession());
			const output = getStreamOutput(session);
			expect(output).toBe('');
		});
	});
});

describe('CLI Streaming — Tool call interleaving', () => {
	it('preserves accumulated content across tool call', () => {
		let session = createStreamSession();
		session = feedChunk(session, 'Let me check ');
		// Tool call happens here — session state persists
		session = feedChunk(session, 'the result is 42.');
		expect(session.accumulated).toBe('Let me check the result is 42.');
	});
});
