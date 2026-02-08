import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		testTimeout: 60000,
		hookTimeout: 60000,
	},
});
