import type { Logger } from '@axel/core/logging';
import pino from 'pino';

export interface PinoLoggerConfig {
	readonly level: string;
	readonly pretty: boolean;
}

const DEFAULT_CONFIG: PinoLoggerConfig = {
	level: 'info',
	pretty: false,
};

/**
 * Pino-backed Logger implementation (ADR-011).
 *
 * JSON output in production, pino-pretty in development.
 * Supports child() for requestId/component binding.
 */
export class PinoLogger implements Logger {
	private readonly pino: pino.Logger;

	constructor(config?: Partial<PinoLoggerConfig>) {
		const merged = { ...DEFAULT_CONFIG, ...config };
		this.pino = pino({
			level: merged.level,
			...(merged.pretty
				? { transport: { target: 'pino-pretty', options: { colorize: true } } }
				: {}),
		});
	}

	/** Wrap an existing pino instance (used by child()) */
	private static fromPino(instance: pino.Logger): PinoLogger {
		const logger = Object.create(PinoLogger.prototype) as PinoLogger;
		Object.defineProperty(logger, 'pino', { value: instance, writable: false });
		return logger;
	}

	info(msg: string, context?: Record<string, unknown>): void {
		context ? this.pino.info(context, msg) : this.pino.info(msg);
	}

	warn(msg: string, context?: Record<string, unknown>): void {
		context ? this.pino.warn(context, msg) : this.pino.warn(msg);
	}

	error(msg: string, context?: Record<string, unknown>): void {
		context ? this.pino.error(context, msg) : this.pino.error(msg);
	}

	debug(msg: string, context?: Record<string, unknown>): void {
		context ? this.pino.debug(context, msg) : this.pino.debug(msg);
	}

	child(bindings: Record<string, unknown>): Logger {
		return PinoLogger.fromPino(this.pino.child(bindings));
	}
}
