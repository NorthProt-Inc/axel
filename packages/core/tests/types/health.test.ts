import { describe, it, expect } from "vitest";
import type {
	HealthState,
	HealthStatus,
	ComponentHealth,
} from "../../src/types/health.js";

describe("Health types", () => {
	describe("HealthState", () => {
		it("covers all system states", () => {
			const states: HealthState[] = ["healthy", "degraded", "unhealthy"];
			expect(states).toHaveLength(3);
		});
	});

	describe("ComponentHealth", () => {
		it("represents a healthy component", () => {
			const health: ComponentHealth = {
				state: "healthy",
				latencyMs: 5,
				message: null,
				lastChecked: new Date(),
			};

			expect(health.state).toBe("healthy");
			expect(health.latencyMs).toBe(5);
			expect(health.message).toBeNull();
		});

		it("represents a degraded component with message", () => {
			const health: ComponentHealth = {
				state: "degraded",
				latencyMs: 2500,
				message: "High latency detected",
				lastChecked: new Date(),
			};

			expect(health.state).toBe("degraded");
			expect(health.message).toBe("High latency detected");
		});

		it("represents an unhealthy component with null latency", () => {
			const health: ComponentHealth = {
				state: "unhealthy",
				latencyMs: null,
				message: "Connection refused",
				lastChecked: new Date(),
			};

			expect(health.latencyMs).toBeNull();
		});
	});

	describe("HealthStatus", () => {
		it("aggregates multiple component health checks", () => {
			const status: HealthStatus = {
				state: "degraded",
				checks: {
					database: {
						state: "healthy",
						latencyMs: 3,
						message: null,
						lastChecked: new Date(),
					},
					redis: {
						state: "degraded",
						latencyMs: 150,
						message: "Slow response",
						lastChecked: new Date(),
					},
				},
				timestamp: new Date(),
				uptime: 86400,
			};

			expect(status.state).toBe("degraded");
			expect(Object.keys(status.checks)).toHaveLength(2);
			expect(status.uptime).toBe(86400);
		});
	});
});
