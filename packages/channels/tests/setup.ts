/**
 * Vitest setup file for @axel/channels
 *
 * Configure channel-specific mocks for readline, discord.js, grammy.
 * Mocks will be added as needed during EDGE-002~004 implementation.
 */

import { afterAll, beforeAll, vi } from 'vitest';

beforeAll(() => {
	// Global test setup
	// Mock environment variables if needed
	process.env.NODE_ENV = 'test';
});

afterAll(() => {
	// Global test teardown
	vi.clearAllMocks();
});

/**
 * Mock readline for CLI channel tests
 * Will be populated during EDGE-002 (CLI Channel) implementation
 */
export const mockReadline = () => {
	// TODO: Add readline mocks when EDGE-002 starts
};

/**
 * Mock discord.js for Discord channel tests
 * Will be populated during EDGE-003 (Discord Channel) implementation
 */
export const mockDiscord = () => {
	// TODO: Add discord.js mocks when EDGE-003 starts
};

/**
 * Mock grammy for Telegram channel tests
 * Will be populated during EDGE-004 (Telegram Channel) implementation
 */
export const mockTelegram = () => {
	// TODO: Add grammy mocks when EDGE-004 starts
};
