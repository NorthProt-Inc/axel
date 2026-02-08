import { describe, it, expect } from "vitest";
import type { SessionState, SessionSummary } from "../../src/types/session.js";

describe("Session types", () => {
	describe("SessionState", () => {
		it("covers the full session lifecycle", () => {
			const states: SessionState[] = [
				"initializing",
				"active",
				"thinking",
				"tool_executing",
				"summarizing",
				"ending",
				"ended",
			];
			expect(states).toHaveLength(7);
		});
	});

	describe("SessionSummary", () => {
		it("represents a complete session summary for episodic memory", () => {
			const summary: SessionSummary = {
				sessionId: "session-001",
				summary: "User discussed project planning and task delegation.",
				keyTopics: ["planning", "delegation", "architecture"],
				emotionalTone: "productive",
				turnCount: 15,
				channelHistory: ["discord", "telegram"],
				startedAt: new Date("2025-06-01T10:00:00Z"),
				endedAt: new Date("2025-06-01T11:30:00Z"),
			};

			expect(summary.sessionId).toBe("session-001");
			expect(summary.keyTopics).toHaveLength(3);
			expect(summary.turnCount).toBe(15);
			expect(summary.channelHistory).toEqual(["discord", "telegram"]);
		});

		it("supports empty topics and single channel", () => {
			const summary: SessionSummary = {
				sessionId: "session-002",
				summary: "Brief greeting.",
				keyTopics: [],
				emotionalTone: "casual",
				turnCount: 2,
				channelHistory: ["cli"],
				startedAt: new Date(),
				endedAt: new Date(),
			};

			expect(summary.keyTopics).toHaveLength(0);
			expect(summary.channelHistory).toHaveLength(1);
		});
	});
});
