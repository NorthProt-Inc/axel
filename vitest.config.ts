import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		environment: 'node',
		pool: 'forks',
		isolate: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules', 'dist', 'build', '**/*.config.ts', '**/*.d.ts'],
		},
	},
});
