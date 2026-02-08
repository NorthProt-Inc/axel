import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		environment: 'node',
		pool: 'forks',
		isolate: true,
		include: ['tests/**/*.test.ts'],
	},
});
