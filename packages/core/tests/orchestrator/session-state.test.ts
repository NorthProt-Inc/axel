import { describe, expect, it } from 'vitest';
import { assertTransition, isValidTransition } from '../../src/orchestrator/session-state.js';
import type { SessionState } from '../../src/types/session.js';

describe('session-state', () => {
	describe('isValidTransition', () => {
		describe('initializing state', () => {
			it('allows transition to active', () => {
				expect(isValidTransition('initializing', 'active')).toBe(true);
			});

			it('rejects transition to thinking', () => {
				expect(isValidTransition('initializing', 'thinking')).toBe(false);
			});

			it('rejects transition to tool_executing', () => {
				expect(isValidTransition('initializing', 'tool_executing')).toBe(false);
			});

			it('rejects transition to summarizing', () => {
				expect(isValidTransition('initializing', 'summarizing')).toBe(false);
			});

			it('rejects transition to ending', () => {
				expect(isValidTransition('initializing', 'ending')).toBe(false);
			});

			it('rejects transition to ended', () => {
				expect(isValidTransition('initializing', 'ended')).toBe(false);
			});
		});

		describe('active state', () => {
			it('allows transition to thinking', () => {
				expect(isValidTransition('active', 'thinking')).toBe(true);
			});

			it('allows transition to summarizing', () => {
				expect(isValidTransition('active', 'summarizing')).toBe(true);
			});

			it('allows transition to ending', () => {
				expect(isValidTransition('active', 'ending')).toBe(true);
			});

			it('rejects transition to initializing', () => {
				expect(isValidTransition('active', 'initializing')).toBe(false);
			});

			it('rejects transition to tool_executing', () => {
				expect(isValidTransition('active', 'tool_executing')).toBe(false);
			});

			it('rejects transition to ended', () => {
				expect(isValidTransition('active', 'ended')).toBe(false);
			});
		});

		describe('thinking state', () => {
			it('allows transition to active', () => {
				expect(isValidTransition('thinking', 'active')).toBe(true);
			});

			it('allows transition to tool_executing', () => {
				expect(isValidTransition('thinking', 'tool_executing')).toBe(true);
			});

			it('allows transition to ending', () => {
				expect(isValidTransition('thinking', 'ending')).toBe(true);
			});

			it('rejects transition to initializing', () => {
				expect(isValidTransition('thinking', 'initializing')).toBe(false);
			});

			it('rejects transition to summarizing', () => {
				expect(isValidTransition('thinking', 'summarizing')).toBe(false);
			});

			it('rejects transition to ended', () => {
				expect(isValidTransition('thinking', 'ended')).toBe(false);
			});
		});

		describe('tool_executing state', () => {
			it('allows transition to thinking', () => {
				expect(isValidTransition('tool_executing', 'thinking')).toBe(true);
			});

			it('allows transition to ending', () => {
				expect(isValidTransition('tool_executing', 'ending')).toBe(true);
			});

			it('rejects transition to initializing', () => {
				expect(isValidTransition('tool_executing', 'initializing')).toBe(false);
			});

			it('rejects transition to active', () => {
				expect(isValidTransition('tool_executing', 'active')).toBe(false);
			});

			it('rejects transition to summarizing', () => {
				expect(isValidTransition('tool_executing', 'summarizing')).toBe(false);
			});

			it('rejects transition to ended', () => {
				expect(isValidTransition('tool_executing', 'ended')).toBe(false);
			});
		});

		describe('summarizing state', () => {
			it('allows transition to ending', () => {
				expect(isValidTransition('summarizing', 'ending')).toBe(true);
			});

			it('rejects transition to initializing', () => {
				expect(isValidTransition('summarizing', 'initializing')).toBe(false);
			});

			it('rejects transition to active', () => {
				expect(isValidTransition('summarizing', 'active')).toBe(false);
			});

			it('rejects transition to thinking', () => {
				expect(isValidTransition('summarizing', 'thinking')).toBe(false);
			});

			it('rejects transition to tool_executing', () => {
				expect(isValidTransition('summarizing', 'tool_executing')).toBe(false);
			});

			it('rejects transition to ended', () => {
				expect(isValidTransition('summarizing', 'ended')).toBe(false);
			});
		});

		describe('ending state', () => {
			it('allows transition to ended', () => {
				expect(isValidTransition('ending', 'ended')).toBe(true);
			});

			it('rejects transition to initializing', () => {
				expect(isValidTransition('ending', 'initializing')).toBe(false);
			});

			it('rejects transition to active', () => {
				expect(isValidTransition('ending', 'active')).toBe(false);
			});

			it('rejects transition to thinking', () => {
				expect(isValidTransition('ending', 'thinking')).toBe(false);
			});

			it('rejects transition to tool_executing', () => {
				expect(isValidTransition('ending', 'tool_executing')).toBe(false);
			});

			it('rejects transition to summarizing', () => {
				expect(isValidTransition('ending', 'summarizing')).toBe(false);
			});
		});

		describe('ended state', () => {
			it('rejects transition to initializing', () => {
				expect(isValidTransition('ended', 'initializing')).toBe(false);
			});

			it('rejects transition to active', () => {
				expect(isValidTransition('ended', 'active')).toBe(false);
			});

			it('rejects transition to thinking', () => {
				expect(isValidTransition('ended', 'thinking')).toBe(false);
			});

			it('rejects transition to tool_executing', () => {
				expect(isValidTransition('ended', 'tool_executing')).toBe(false);
			});

			it('rejects transition to summarizing', () => {
				expect(isValidTransition('ended', 'summarizing')).toBe(false);
			});

			it('rejects transition to ending', () => {
				expect(isValidTransition('ended', 'ending')).toBe(false);
			});

			it('rejects transition to itself', () => {
				expect(isValidTransition('ended', 'ended')).toBe(false);
			});
		});

		describe('symmetry property', () => {
			it('A→B valid does not imply B→A valid (initializing→active)', () => {
				expect(isValidTransition('initializing', 'active')).toBe(true);
				expect(isValidTransition('active', 'initializing')).toBe(false);
			});

			it('A→B valid does not imply B→A valid (thinking→tool_executing)', () => {
				expect(isValidTransition('thinking', 'tool_executing')).toBe(true);
				expect(isValidTransition('tool_executing', 'thinking')).toBe(true); // this is symmetric
			});

			it('A→B valid does not imply B→A valid (ending→ended)', () => {
				expect(isValidTransition('ending', 'ended')).toBe(true);
				expect(isValidTransition('ended', 'ending')).toBe(false);
			});
		});
	});

	describe('assertTransition', () => {
		it('does not throw for valid transitions', () => {
			expect(() => assertTransition('initializing', 'active')).not.toThrow();
			expect(() => assertTransition('active', 'thinking')).not.toThrow();
			expect(() => assertTransition('thinking', 'tool_executing')).not.toThrow();
			expect(() => assertTransition('tool_executing', 'thinking')).not.toThrow();
			expect(() => assertTransition('summarizing', 'ending')).not.toThrow();
			expect(() => assertTransition('ending', 'ended')).not.toThrow();
		});

		it('throws for invalid transitions', () => {
			expect(() => assertTransition('initializing', 'thinking')).toThrow(
				'Invalid session state transition: initializing → thinking',
			);
		});

		it('throws for ended state transitions', () => {
			expect(() => assertTransition('ended', 'active')).toThrow(
				'Invalid session state transition: ended → active',
			);
		});

		it('throws with descriptive error message', () => {
			expect(() => assertTransition('active', 'tool_executing')).toThrow(
				/Invalid session state transition: active → tool_executing/,
			);
		});
	});

	describe('complete lifecycle paths', () => {
		it('validates happy path: initializing → active → thinking → tool_executing → thinking → active → summarizing → ending → ended', () => {
			const states: SessionState[] = [
				'initializing',
				'active',
				'thinking',
				'tool_executing',
				'thinking',
				'active',
				'summarizing',
				'ending',
				'ended',
			];

			for (let i = 0; i < states.length - 1; i++) {
				const from = states[i];
				const to = states[i + 1];
				expect(isValidTransition(from, to)).toBe(true);
			}
		});

		it('validates abort path: thinking → ending → ended', () => {
			expect(isValidTransition('thinking', 'ending')).toBe(true);
			expect(isValidTransition('ending', 'ended')).toBe(true);
		});

		it('validates simple path: initializing → active → ending → ended', () => {
			expect(isValidTransition('initializing', 'active')).toBe(true);
			expect(isValidTransition('active', 'ending')).toBe(true);
			expect(isValidTransition('ending', 'ended')).toBe(true);
		});
	});
});
