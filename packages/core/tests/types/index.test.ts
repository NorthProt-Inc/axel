import { describe, it, expect } from "vitest";

describe("types barrel export", () => {
	it("re-exports all type modules", async () => {
		// Verify the barrel export can be imported without errors
		const types = await import("../../src/types/index.js");
		expect(types).toBeDefined();
	});

	it("exports error classes (runtime values)", async () => {
		const { AxelError, TransientError, PermanentError, ValidationError } =
			await import("../../src/types/index.js");
		expect(AxelError).toBeDefined();
		expect(TransientError).toBeDefined();
		expect(PermanentError).toBeDefined();
		expect(ValidationError).toBeDefined();
	});
});
