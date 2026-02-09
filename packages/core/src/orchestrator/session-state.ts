import type { SessionState } from '../types/session.js';

/**
 * Valid state transitions per ADR-021 session lifecycle.
 *
 * State machine rules:
 * - initializing → active (session ready)
 * - active → thinking (LLM reasoning), summarizing (end prep), ending (termination)
 * - thinking → active (reasoning done), tool_executing (tool needed), ending (abort)
 * - tool_executing → thinking (tool completed), ending (abort)
 * - summarizing → ending (summary ready)
 * - ending → ended (terminal state)
 * - ended → (no transitions, terminal)
 */
const VALID_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
	initializing: ['active'],
	active: ['thinking', 'summarizing', 'ending'],
	thinking: ['active', 'tool_executing', 'ending'],
	tool_executing: ['thinking', 'ending'],
	summarizing: ['ending'],
	ending: ['ended'],
	ended: [],
};

/**
 * Check if a state transition is valid according to the session lifecycle.
 *
 * @param from - Current state
 * @param to - Target state
 * @returns true if transition is allowed, false otherwise
 *
 * @example
 * ```ts
 * isValidTransition('active', 'thinking'); // true
 * isValidTransition('ended', 'active'); // false
 * ```
 */
export function isValidTransition(from: SessionState, to: SessionState): boolean {
	return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Assert a valid state transition, throwing an error if invalid.
 *
 * Use this for runtime validation in SessionStore implementations.
 *
 * @param from - Current state
 * @param to - Target state
 * @throws Error if transition is invalid
 *
 * @example
 * ```ts
 * assertTransition(currentState, 'thinking'); // throws if invalid
 * ```
 */
export function assertTransition(from: SessionState, to: SessionState): void {
	if (!isValidTransition(from, to)) {
		throw new Error(`Invalid session state transition: ${from} → ${to}`);
	}
}
