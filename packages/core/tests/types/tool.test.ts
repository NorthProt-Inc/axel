import { describe, it, expect } from "vitest";
import type { ToolResult, ToolDefinition } from "../../src/types/tool.js";

describe("Tool types", () => {
	describe("ToolResult", () => {
		it("represents a successful tool execution", () => {
			const result: ToolResult = {
				callId: "call-001",
				success: true,
				content: { data: [1, 2, 3] },
				durationMs: 150,
			};

			expect(result.success).toBe(true);
			expect(result.durationMs).toBe(150);
			expect(result.error).toBeUndefined();
		});

		it("represents a failed tool execution with error", () => {
			const result: ToolResult = {
				callId: "call-002",
				success: false,
				content: null,
				error: "File not found",
				durationMs: 5,
			};

			expect(result.success).toBe(false);
			expect(result.error).toBe("File not found");
		});
	});

	describe("ToolDefinition", () => {
		it("defines a tool with all required fields", () => {
			const tool: ToolDefinition = {
				name: "memory_search",
				description: "Search semantic memory by query",
				category: "memory",
				inputSchema: {
					type: "object",
					properties: {
						query: { type: "string" },
						limit: { type: "number" },
					},
				},
				requiresApproval: false,
			};

			expect(tool.name).toBe("memory_search");
			expect(tool.category).toBe("memory");
			expect(tool.requiresApproval).toBe(false);
		});

		it("accepts all valid tool categories", () => {
			const categories: ToolDefinition["category"][] = [
				"memory",
				"file",
				"iot",
				"research",
				"system",
				"agent",
			];
			expect(categories).toHaveLength(6);
		});

		it("supports tools requiring approval", () => {
			const tool: ToolDefinition = {
				name: "iot_control",
				description: "Control IoT devices",
				category: "iot",
				inputSchema: {},
				requiresApproval: true,
			};

			expect(tool.requiresApproval).toBe(true);
		});
	});
});
