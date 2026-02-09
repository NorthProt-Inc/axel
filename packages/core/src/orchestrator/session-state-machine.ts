import type { SessionState } from '../types/session.js';

/**
 * Session state transition rules per ADR-021 Section 1.
 *
 * Each key is a source state; the value is the array of valid target states.
 */
const TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
	initializing: ['active'],
	active: ['thinking', 'summarizing'],
	thinking: ['tool_executing', 'active'],
	tool_executing: ['thinking'],
	summarizing: ['ending'],
	ending: ['ended'],
	ended: ['initializing'],
};

/** Error thrown when an invalid session state transition is attempted */
export class SessionTransitionError extends Error {
	readonly from: SessionState;
	readonly to: SessionState;
	readonly validTransitions: readonly SessionState[];

	constructor(from: SessionState, to: SessionState, validTransitions: readonly SessionState[]) {
		super(
			`Invalid session state transition: ${from} → ${to}. Valid transitions from '${from}': [${validTransitions.join(', ')}]`,
		);
		this.name = 'SessionTransitionError';
		this.from = from;
		this.to = to;
		this.validTransitions = validTransitions;
	}
}

/** Check if a state transition is valid per ADR-021 rules */
export function isValidTransition(from: SessionState, to: SessionState): boolean {
	return TRANSITIONS[from].includes(to);
}

/** Get the list of valid target states from the given state */
export function getValidTransitions(state: SessionState): readonly SessionState[] {
	return TRANSITIONS[state];
}

/**
 * Attempt a state transition; returns the target state if valid.
 *
 * @throws {SessionTransitionError} if the transition is not allowed
 */
export function transition(from: SessionState, to: SessionState): SessionState {
	const valid = TRANSITIONS[from];
	if (!valid.includes(to)) {
		throw new SessionTransitionError(from, to, valid);
	}
	return to;
}
