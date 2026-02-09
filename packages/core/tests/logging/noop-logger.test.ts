import { describe, expect, it } from 'vitest';
import { NoopLogger } from '../../src/logging/types.js';
import type { Logger } from '../../src/logging/types.js';

describe('NoopLogger', () => {
	it('implements Logger interface', () => {
		const logger: Logger = new NoopLogger();
		expect(logger).toBeDefined();
	});

	it('all methods are callable without errors', () => {
		const logger = new NoopLogger();
		expect(() => logger.info('test')).not.toThrow();
		expect(() => logger.warn('test', { key: 'value' })).not.toThrow();
		expect(() => logger.error('test')).not.toThrow();
		expect(() => logger.debug('test')).not.toThrow();
	});

	it('child() returns a Logger', () => {
		const logger = new NoopLogger();
		const child = logger.child({ component: 'test' });
		expect(child).toBeDefined();
		expect(() => child.info('child message')).not.toThrow();
	});

	it('child() returns a NoopLogger instance', () => {
		const logger = new NoopLogger();
		const child = logger.child({ requestId: 'abc' });
		expect(child).toBeInstanceOf(NoopLogger);
	});
});
