/**
 * Vitest setup file for @axel/gateway
 *
 * Configure gateway-specific test utilities for HTTP/WebSocket testing.
 * Test utilities will be added during EDGE-005 implementation.
 */

import { afterAll, beforeAll, vi } from 'vitest';

beforeAll(() => {
	// Global test setup
	process.env.NODE_ENV = 'test';
});

afterAll(() => {
	// Global test teardown
	vi.clearAllMocks();
});

/**
 * Mock WebSocket server for gateway tests
 * Will be populated during EDGE-005 (Gateway HTTP+WS) implementation
 */
export const mockWebSocketServer = () => {
	// TODO: Add ws mocks when EDGE-005 starts
};

/**
 * Create test HTTP client for gateway integration tests
 * Will be populated during EDGE-005 implementation
 */
export const createTestHttpClient = () => {
	// TODO: Add HTTP test utilities when EDGE-005 starts
};
