/** Logger interface for DI (ADR-011). No I/O — implementations in infra. */
export interface Logger {
	info(msg: string, context?: Record<string, unknown>): void;
	warn(msg: string, context?: Record<string, unknown>): void;
	error(msg: string, context?: Record<string, unknown>): void;
	debug(msg: string, context?: Record<string, unknown>): void;
	child(bindings: Record<string, unknown>): Logger;
}

/** No-op logger for tests and optional injection fallback */
export class NoopLogger implements Logger {
	info(_msg: string, _context?: Record<string, unknown>): void {}
	warn(_msg: string, _context?: Record<string, unknown>): void {}
	error(_msg: string, _context?: Record<string, unknown>): void {}
	debug(_msg: string, _context?: Record<string, unknown>): void {}
	child(_bindings: Record<string, unknown>): Logger {
		return this;
	}
}
