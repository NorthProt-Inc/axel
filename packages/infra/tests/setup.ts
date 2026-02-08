/**
 * Testcontainers setup for integration tests.
 *
 * Launches PostgreSQL 17 (with pgvector) and Redis 7 containers for the infra package test suite.
 * Containers are started once before all tests and stopped after all tests complete.
 *
 * Environment variables are set for each container to allow test code to connect.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from 'testcontainers';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll } from 'vitest';

let postgresContainer: StartedPostgreSqlContainer | undefined;
let redisContainer: StartedTestContainer | undefined;

/**
 * Start PostgreSQL 17 (pgvector/pgvector:pg17) and Redis 7 (redis:7-alpine) containers.
 */
beforeAll(async () => {
	// PostgreSQL with pgvector extension
	postgresContainer = await new PostgreSqlContainer('pgvector/pgvector:pg17')
		.withDatabase('axel_test')
		.withUsername('axel_test')
		.withPassword('axel_test')
		.withExposedPorts(5432)
		.start();

	// Set environment variables for PG connection
	process.env.PGHOST = postgresContainer.getHost();
	process.env.PGPORT = String(postgresContainer.getPort());
	process.env.PGDATABASE = postgresContainer.getDatabase();
	process.env.PGUSER = postgresContainer.getUsername();
	process.env.PGPASSWORD = postgresContainer.getPassword();

	// Redis 7 Alpine
	redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

	// Set environment variables for Redis connection
	process.env.REDIS_HOST = redisContainer.getHost();
	process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));
}, 120_000); // 2-minute timeout for container startup

/**
 * Stop all containers after tests complete.
 */
afterAll(async () => {
	if (postgresContainer) {
		await postgresContainer.stop();
	}
	if (redisContainer) {
		await redisContainer.stop();
	}
}, 30_000); // 30-second timeout for container shutdown
