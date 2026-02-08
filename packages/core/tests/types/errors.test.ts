import { describe, it, expect } from "vitest";
import {
	AxelError,
	TransientError,
	PermanentError,
	ValidationError,
	AuthError,
	ProviderError,
	ToolError,
	TimeoutError,
} from "../../src/types/errors.js";

describe("Error types (ADR-020)", () => {
	describe("AxelError base class", () => {
		it("is an abstract base with common fields", () => {
			const error = new TransientError("test");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(AxelError);
			expect(error.timestamp).toBeInstanceOf(Date);
			expect(error.name).toBe("TransientError");
		});

		it("supports cause chaining", () => {
			const cause = new Error("original");
			const error = new TransientError("wrapped", { cause });
			expect(error.cause).toBe(cause);
		});

		it("supports requestId", () => {
			const error = new TransientError("test", {
				requestId: "req-123",
			});
			expect(error.requestId).toBe("req-123");
		});
	});

	describe("TransientError", () => {
		it("is retryable with 503 status", () => {
			const error = new TransientError("Service temporarily unavailable");
			expect(error.code).toBe("TRANSIENT");
			expect(error.isRetryable).toBe(true);
			expect(error.httpStatus).toBe(503);
			expect(error.message).toBe("Service temporarily unavailable");
		});
	});

	describe("PermanentError", () => {
		it("is not retryable with 500 status", () => {
			const error = new PermanentError("Unrecoverable failure");
			expect(error.code).toBe("PERMANENT");
			expect(error.isRetryable).toBe(false);
			expect(error.httpStatus).toBe(500);
		});
	});

	describe("ValidationError", () => {
		it("includes field-specific error messages", () => {
			const error = new ValidationError("Invalid input", {
				email: "Invalid email format",
				age: "Must be positive",
			});
			expect(error.code).toBe("VALIDATION");
			expect(error.isRetryable).toBe(false);
			expect(error.httpStatus).toBe(400);
			expect(error.fields).toEqual({
				email: "Invalid email format",
				age: "Must be positive",
			});
		});
	});

	describe("AuthError", () => {
		it("defaults to 401 status", () => {
			const error = new AuthError("Authentication required");
			expect(error.code).toBe("AUTH");
			expect(error.isRetryable).toBe(false);
			expect(error.httpStatus).toBe(401);
		});

		it("supports 403 status for authorization failures", () => {
			const error = new AuthError("Insufficient permissions", 403);
			expect(error.httpStatus).toBe(403);
		});
	});

	describe("ProviderError", () => {
		it("includes provider name and retryability", () => {
			const error = new ProviderError(
				"Rate limit exceeded",
				"anthropic",
				true,
			);
			expect(error.code).toBe("PROVIDER");
			expect(error.httpStatus).toBe(502);
			expect(error.provider).toBe("anthropic");
			expect(error.isRetryable).toBe(true);
		});

		it("supports cause chaining", () => {
			const cause = new Error("ECONNRESET");
			const error = new ProviderError("Connection lost", "openai", true, {
				cause,
			});
			expect(error.cause).toBe(cause);
		});

		it("can be non-retryable", () => {
			const error = new ProviderError(
				"Invalid API key",
				"anthropic",
				false,
			);
			expect(error.isRetryable).toBe(false);
		});
	});

	describe("ToolError", () => {
		it("includes tool name", () => {
			const error = new ToolError("Execution failed", "file_read");
			expect(error.code).toBe("TOOL");
			expect(error.httpStatus).toBe(500);
			expect(error.toolName).toBe("file_read");
			expect(error.isRetryable).toBe(false);
		});

		it("supports retryable tool errors", () => {
			const error = new ToolError(
				"Temporary failure",
				"api_call",
				true,
			);
			expect(error.isRetryable).toBe(true);
		});
	});

	describe("TimeoutError", () => {
		it("includes timeout duration", () => {
			const error = new TimeoutError("Request timed out", 30000);
			expect(error.code).toBe("TIMEOUT");
			expect(error.isRetryable).toBe(true);
			expect(error.httpStatus).toBe(504);
			expect(error.timeoutMs).toBe(30000);
		});
	});

	describe("Error hierarchy", () => {
		it("all errors extend AxelError", () => {
			const errors = [
				new TransientError("t"),
				new PermanentError("p"),
				new ValidationError("v", {}),
				new AuthError("a"),
				new ProviderError("pr", "test", false),
				new ToolError("to", "test"),
				new TimeoutError("ti", 1000),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(AxelError);
				expect(error).toBeInstanceOf(Error);
				expect(typeof error.code).toBe("string");
				expect(typeof error.isRetryable).toBe("boolean");
				expect(typeof error.httpStatus).toBe("number");
				expect(error.timestamp).toBeInstanceOf(Date);
			}
		});
	});
});
