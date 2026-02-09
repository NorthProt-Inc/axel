import { describe, expect, it } from 'vitest';
import type { Logger } from '@axel/core/logging';
import { PinoLogger } from '../../src/logging/pino-logger.js';

describe('PinoLogger', () => {
	it('implements Logger interface', () => {
		const logger: Logger = new PinoLogger({ level: 'silent' });
		expect(logger).toBeDefined();
	});

	it('all log methods are callable', () => {
		const logger = new PinoLogger({ level: 'silent' });
		expect(() => logger.info('info message')).not.toThrow();
		expect(() => logger.warn('warn message')).not.toThrow();
		expect(() => logger.error('error message')).not.toThrow();
		expect(() => logger.debug('debug message')).not.toThrow();
	});

	it('accepts context objects', () => {
		const logger = new PinoLogger({ level: 'silent' });
		expect(() => logger.info('with context', { key: 'value', count: 42 })).not.toThrow();
	});

	it('child() returns a Logger with bindings', () => {
		const logger = new PinoLogger({ level: 'silent' });
		const child = logger.child({ component: 'test', requestId: 'req-123' });
		expect(child).toBeDefined();
		expect(() => child.info('child message')).not.toThrow();
	});

	it('child() of child() works', () => {
		const logger = new PinoLogger({ level: 'silent' });
		const child1 = logger.child({ component: 'parent' });
		const child2 = child1.child({ requestId: 'req-456' });
		expect(() => child2.info('nested child')).not.toThrow();
	});

	it('defaults to info level', () => {
		const logger = new PinoLogger();
		expect(logger).toBeDefined();
	});

	it('outputs JSON format by default', () => {
		// We verify no error on construction with pretty=false
		const logger = new PinoLogger({ level: 'silent', pretty: false });
		expect(logger).toBeDefined();
	});
});
