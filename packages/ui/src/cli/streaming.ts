import { renderAssistantMessage } from './output.js';

/**
 * Immutable streaming session state for CLI output.
 * Accumulates chunks during streaming, renders final markdown on completion.
 * Used by CliChannel to coordinate spinner + token-by-token output.
 */

export interface StreamSession {
	readonly accumulated: string;
	readonly chunkCount: number;
	readonly completed: boolean;
}

export function createStreamSession(): StreamSession {
	return {
		accumulated: '',
		chunkCount: 0,
		completed: false,
	};
}

export function feedChunk(session: StreamSession, chunk: string): StreamSession {
	return {
		accumulated: session.accumulated + chunk,
		chunkCount: session.chunkCount + 1,
		completed: session.completed,
	};
}

export function completeStream(session: StreamSession): StreamSession {
	return {
		accumulated: session.accumulated,
		chunkCount: session.chunkCount,
		completed: true,
	};
}

export function getStreamOutput(session: StreamSession): string {
	if (session.accumulated.length === 0) {
		return '';
	}
	if (session.completed) {
		return renderAssistantMessage(session.accumulated);
	}
	return session.accumulated;
}
