import { describe, it, expect } from "vitest";
import type {
	MemoryType,
	Memory,
	MemorySearchResult,
} from "../../src/types/memory.js";

describe("Memory types", () => {
	describe("MemoryType", () => {
		it("accepts valid memory types", () => {
			const types: MemoryType[] = [
				"fact",
				"preference",
				"insight",
				"conversation",
			];
			expect(types).toHaveLength(4);
		});
	});

	describe("Memory", () => {
		it("represents a complete semantic memory unit", () => {
			const memory: Memory = {
				uuid: "550e8400-e29b-41d4-a716-446655440000",
				content: "User prefers dark mode",
				memoryType: "preference",
				importance: 0.8,
				embedding: new Float32Array([0.1, 0.2, 0.3]),
				createdAt: new Date("2025-01-01"),
				lastAccessed: new Date("2025-06-01"),
				accessCount: 5,
				sourceChannel: "discord",
				channelMentions: { discord: 3, telegram: 2 },
				sourceSession: "session-123",
				decayedImportance: 0.65,
				lastDecayedAt: new Date("2025-06-01"),
			};

			expect(memory.uuid).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(memory.memoryType).toBe("preference");
			expect(memory.importance).toBe(0.8);
			expect(memory.embedding).toBeInstanceOf(Float32Array);
			expect(memory.accessCount).toBe(5);
			expect(memory.channelMentions).toEqual({ discord: 3, telegram: 2 });
		});

		it("allows null for optional nullable fields", () => {
			const memory: Memory = {
				uuid: "test-uuid",
				content: "test content",
				memoryType: "fact",
				importance: 1.0,
				embedding: new Float32Array(0),
				createdAt: new Date(),
				lastAccessed: new Date(),
				accessCount: 1,
				sourceChannel: null,
				channelMentions: {},
				sourceSession: null,
				decayedImportance: null,
				lastDecayedAt: null,
			};

			expect(memory.sourceChannel).toBeNull();
			expect(memory.sourceSession).toBeNull();
			expect(memory.decayedImportance).toBeNull();
			expect(memory.lastDecayedAt).toBeNull();
		});
	});

	describe("MemorySearchResult", () => {
		it("wraps a Memory with a relevance score and source", () => {
			const result: MemorySearchResult = {
				memory: {
					uuid: "test-uuid",
					content: "test",
					memoryType: "fact",
					importance: 0.9,
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
				score: 0.95,
				source: "semantic",
			};

			expect(result.score).toBe(0.95);
			expect(result.source).toBe("semantic");
		});

		it("accepts all valid source types", () => {
			const sources: MemorySearchResult["source"][] = [
				"semantic",
				"graph",
				"prefetch",
			];
			expect(sources).toHaveLength(3);
		});
	});
});
