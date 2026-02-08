import { describe, it, expect } from "vitest";
import type { MemoryEngine, MemoryStats } from "../../src/types/engine.js";

describe("Engine types", () => {
	describe("MemoryStats", () => {
		it("represents memory system statistics", () => {
			const stats: MemoryStats = {
				totalMemories: 1500,
				byType: {
					fact: 400,
					preference: 200,
					insight: 300,
					conversation: 600,
				},
				avgImportance: 0.65,
				oldestMemory: new Date("2024-01-01"),
				lastConsolidation: new Date("2025-06-01"),
			};

			expect(stats.totalMemories).toBe(1500);
			expect(stats.byType.fact).toBe(400);
			expect(stats.avgImportance).toBe(0.65);
		});

		it("handles empty memory store", () => {
			const stats: MemoryStats = {
				totalMemories: 0,
				byType: {
					fact: 0,
					preference: 0,
					insight: 0,
					conversation: 0,
				},
				avgImportance: 0,
				oldestMemory: null,
				lastConsolidation: null,
			};

			expect(stats.totalMemories).toBe(0);
			expect(stats.oldestMemory).toBeNull();
			expect(stats.lastConsolidation).toBeNull();
		});
	});

	describe("MemoryEngine interface", () => {
		it("defines the contract for memory operations", () => {
			// Verify the interface can be implemented as a mock
			const mockEngine: MemoryEngine = {
				store: async (
					_content: string,
					_memoryType: "fact" | "preference" | "insight" | "conversation",
					_importance: number,
					_channelId: string | null,
				) => "uuid-123",

				search: async (_query: string, _limit: number) => [],

				decay: async (_threshold: number) => 0,

				consolidate: async () => {},

				getStats: async () => ({
					totalMemories: 0,
					byType: { fact: 0, preference: 0, insight: 0, conversation: 0 },
					avgImportance: 0,
					oldestMemory: null,
					lastConsolidation: null,
				}),
			};

			expect(mockEngine.store).toBeDefined();
			expect(mockEngine.search).toBeDefined();
			expect(mockEngine.decay).toBeDefined();
			expect(mockEngine.consolidate).toBeDefined();
			expect(mockEngine.getStats).toBeDefined();
		});

		it("store returns a uuid string", async () => {
			const mockStore: MemoryEngine["store"] = async () => "new-uuid";
			const result = await mockStore("test", "fact", 0.5, null);
			expect(result).toBe("new-uuid");
		});

		it("search returns scored results", async () => {
			const mockSearch: MemoryEngine["search"] = async () => [
				{
					memory: {
						uuid: "uuid-1",
						content: "test memory",
						memoryType: "fact",
						importance: 0.8,
						embedding: new Float32Array(0),
						createdAt: new Date(),
						lastAccessed: new Date(),
						accessCount: 1,
						sourceChannel: null,
						channelMentions: {},
						sourceSession: null,
						decayedImportance: null,
						lastDecayedAt: null,
					},
					score: 0.92,
					source: "semantic",
				},
			];

			const results = await mockSearch("query", 10);
			expect(results).toHaveLength(1);
			expect(results[0]?.score).toBe(0.92);
		});

		it("decay returns count of deleted memories", async () => {
			const mockDecay: MemoryEngine["decay"] = async () => 5;
			const deleted = await mockDecay(0.03);
			expect(deleted).toBe(5);
		});
	});
});
