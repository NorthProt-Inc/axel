import { describe, expect, it } from 'vitest';
import {
	type SessionTransitionError,
	getValidTransitions,
	isValidTransition,
	transition,
} from '../../src/orchestrator/session-state-machine.js';
import type { SessionState } from '../../src/types/session.js';

// ─── ADR-021 Session State Machine Tests ───
// State transitions from ADR-021 Section 1:
//
// initializing → active       (session created)
// active       → thinking     (message received)
// thinking     → tool_executing (LLM requests tool)
// tool_executing → thinking   (tool result received)
// thinking     → active       (response complete)
// active       → summarizing  (inactivity timeout / explicit end)
// summarizing  → ending       (summary saved)
// ending       → ended        (cleanup done)
// ended        → initializing (new message from same user)

describe('session-state-machine', () => {
	describe('isValidTransition', () => {
		it('should allow initializing → active', () => {
			expect(isValidTransition('initializing', 'active')).toBe(true);
		});

		it('should allow active → thinking', () => {
			expect(isValidTransition('active', 'thinking')).toBe(true);
		});

		it('should allow thinking → tool_executing', () => {
			expect(isValidTransition('thinking', 'tool_executing')).toBe(true);
		});

		it('should allow tool_executing → thinking', () => {
			expect(isValidTransition('tool_executing', 'thinking')).toBe(true);
		});

		it('should allow thinking → active', () => {
			expect(isValidTransition('thinking', 'active')).toBe(true);
		});

		it('should allow active → summarizing', () => {
			expect(isValidTransition('active', 'summarizing')).toBe(true);
		});

		it('should allow summarizing → ending', () => {
			expect(isValidTransition('summarizing', 'ending')).toBe(true);
		});

		it('should allow ending → ended', () => {
			expect(isValidTransition('ending', 'ended')).toBe(true);
		});

		it('should allow ended → initializing', () => {
			expect(isValidTransition('ended', 'initializing')).toBe(true);
		});

		// Invalid transitions
		it('should reject initializing → thinking', () => {
			expect(isValidTransition('initializing', 'thinking')).toBe(false);
		});

		it('should reject active → ended', () => {
			expect(isValidTransition('active', 'ended')).toBe(false);
		});

		it('should reject thinking → ended', () => {
			expect(isValidTransition('thinking', 'ended')).toBe(false);
		});

		it('should reject tool_executing → active', () => {
			expect(isValidTransition('tool_executing', 'active')).toBe(false);
		});

		it('should reject ended → active', () => {
			expect(isValidTransition('ended', 'active')).toBe(false);
		});

		it('should reject self-transition (active → active)', () => {
			expect(isValidTransition('active', 'active')).toBe(false);
		});

		it('should reject self-transition (thinking → thinking)', () => {
			expect(isValidTransition('thinking', 'thinking')).toBe(false);
		});

		it('should reject summarizing → active', () => {
			expect(isValidTransition('summarizing', 'active')).toBe(false);
		});

		it('should reject ending → active', () => {
			expect(isValidTransition('ending', 'active')).toBe(false);
		});

		it('should reject initializing → ended', () => {
			expect(isValidTransition('initializing', 'ended')).toBe(false);
		});
	});

	describe('getValidTransitions', () => {
		it('should return [active] for initializing', () => {
			expect(getValidTransitions('initializing')).toEqual(['active']);
		});

		it('should return [thinking, summarizing] for active', () => {
			const transitions = getValidTransitions('active');
			expect(transitions).toContain('thinking');
			expect(transitions).toContain('summarizing');
			expect(transitions).toHaveLength(2);
		});

		it('should return [tool_executing, active] for thinking', () => {
			const transitions = getValidTransitions('thinking');
			expect(transitions).toContain('tool_executing');
			expect(transitions).toContain('active');
			expect(transitions).toHaveLength(2);
		});

		it('should return [thinking] for tool_executing', () => {
			expect(getValidTransitions('tool_executing')).toEqual(['thinking']);
		});

		it('should return [ending] for summarizing', () => {
			expect(getValidTransitions('summarizing')).toEqual(['ending']);
		});

		it('should return [ended] for ending', () => {
			expect(getValidTransitions('ending')).toEqual(['ended']);
		});

		it('should return [initializing] for ended', () => {
			expect(getValidTransitions('ended')).toEqual(['initializing']);
		});
	});

	describe('transition', () => {
		it('should return the target state for valid transitions', () => {
			expect(transition('initializing', 'active')).toBe('active');
			expect(transition('active', 'thinking')).toBe('thinking');
			expect(transition('thinking', 'tool_executing')).toBe('tool_executing');
			expect(transition('tool_executing', 'thinking')).toBe('thinking');
			expect(transition('thinking', 'active')).toBe('active');
			expect(transition('active', 'summarizing')).toBe('summarizing');
			expect(transition('summarizing', 'ending')).toBe('ending');
			expect(transition('ending', 'ended')).toBe('ended');
			expect(transition('ended', 'initializing')).toBe('initializing');
		});

		it('should throw SessionTransitionError for invalid transitions', () => {
			expect(() => transition('initializing', 'thinking')).toThrow();
		});

		it('should include from and to states in error', () => {
			try {
				transition('active', 'ended');
				expect.fail('Should have thrown');
			} catch (err: unknown) {
				const error = err as SessionTransitionError;
				expect(error.from).toBe('active');
				expect(error.to).toBe('ended');
				expect(error.message).toContain('active');
				expect(error.message).toContain('ended');
			}
		});

		it('should include valid transitions in error message', () => {
			try {
				transition('active', 'ended');
				expect.fail('Should have thrown');
			} catch (err: unknown) {
				const error = err as SessionTransitionError;
				expect(error.validTransitions).toContain('thinking');
				expect(error.validTransitions).toContain('summarizing');
			}
		});

		it('should throw for self-transitions', () => {
			expect(() => transition('active', 'active')).toThrow();
		});
	});

	describe('full lifecycle', () => {
		it('should support a complete session lifecycle (happy path)', () => {
			let state: SessionState = 'initializing';
			state = transition(state, 'active');
			state = transition(state, 'thinking');
			state = transition(state, 'active'); // response complete
			state = transition(state, 'summarizing');
			state = transition(state, 'ending');
			state = transition(state, 'ended');
			expect(state).toBe('ended');
		});

		it('should support tool execution cycle', () => {
			let state: SessionState = 'initializing';
			state = transition(state, 'active');
			state = transition(state, 'thinking');
			state = transition(state, 'tool_executing');
			state = transition(state, 'thinking'); // tool done
			state = transition(state, 'tool_executing'); // another tool
			state = transition(state, 'thinking'); // tool done again
			state = transition(state, 'active'); // response complete
			expect(state).toBe('active');
		});

		it('should support multiple message cycles before ending', () => {
			let state: SessionState = 'initializing';
			state = transition(state, 'active');

			// First message
			state = transition(state, 'thinking');
			state = transition(state, 'active');

			// Second message
			state = transition(state, 'thinking');
			state = transition(state, 'active');

			// End
			state = transition(state, 'summarizing');
			state = transition(state, 'ending');
			state = transition(state, 'ended');
			expect(state).toBe('ended');
		});

		it('should support session restart (ended → initializing → active)', () => {
			let state: SessionState = 'ended';
			state = transition(state, 'initializing');
			state = transition(state, 'active');
			expect(state).toBe('active');
		});
	});
});
