import type { ComponentHealth } from '../types/health.js';
import type { WorkingMemory, Turn } from './types.js';

const MAX_TURNS = 20;

/** In-memory stub for M1 Working Memory (ADR-013, ADR-003). Production uses Redis. */
export class InMemoryWorkingMemory implements WorkingMemory {
	readonly layerName = 'M1:working' as const;
	private readonly turns = new Map<string, Turn[]>();
	private readonly summaries = new Map<string, string>();

	async pushTurn(userId: string, turn: Turn): Promise<void> {
		let userTurns = this.turns.get(userId);
		if (!userTurns) {
			userTurns = [];
			this.turns.set(userId, userTurns);
		}
		userTurns.push(turn);
		if (userTurns.length > MAX_TURNS) {
			userTurns.splice(0, userTurns.length - MAX_TURNS);
		}
	}

	async getTurns(userId: string, limit: number): Promise<readonly Turn[]> {
		const userTurns = this.turns.get(userId) ?? [];
		if (limit >= userTurns.length) {
			return [...userTurns];
		}
		return userTurns.slice(userTurns.length - limit);
	}

	async getSummary(userId: string): Promise<string | null> {
		return this.summaries.get(userId) ?? null;
	}

	async compress(userId: string): Promise<void> {
		const userTurns = this.turns.get(userId);
		if (!userTurns || userTurns.length === 0) {
			return;
		}
		const contentParts = userTurns.map((t) => `${t.role}: ${t.content}`);
		this.summaries.set(userId, `Summary of ${userTurns.length} turns: ${contentParts.join('; ')}`);
	}

	async flush(_userId: string): Promise<void> {
		// No-op in memory stub. Production flushes Redis → PostgreSQL.
	}

	async clear(userId: string): Promise<void> {
		this.turns.delete(userId);
		this.summaries.delete(userId);
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
