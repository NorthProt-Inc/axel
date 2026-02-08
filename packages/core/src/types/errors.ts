/** Base error class for all Axel errors (ADR-020) */
export abstract class AxelError extends Error {
	abstract readonly code: string;
	abstract readonly isRetryable: boolean;
	abstract readonly httpStatus: number;
	readonly timestamp: Date = new Date();
	readonly requestId?: string | undefined;

	constructor(message: string, options?: { cause?: Error; requestId?: string }) {
		super(message, { cause: options?.cause });
		this.name = this.constructor.name;
		this.requestId = options?.requestId;
	}
}

/** Transient error — safe to retry */
export class TransientError extends AxelError {
	readonly code = 'TRANSIENT' as const;
	readonly isRetryable = true as const;
	readonly httpStatus = 503 as const;
}

/** Permanent error — do not retry */
export class PermanentError extends AxelError {
	readonly code = 'PERMANENT' as const;
	readonly isRetryable = false as const;
	readonly httpStatus = 500 as const;
}

/** Validation error — includes field-specific messages */
export class ValidationError extends AxelError {
	readonly code = 'VALIDATION' as const;
	readonly isRetryable = false as const;
	readonly httpStatus = 400 as const;
	readonly fields: Readonly<Record<string, string>>;

	constructor(message: string, fields: Record<string, string>) {
		super(message);
		this.fields = fields;
	}
}

/** Authentication/authorization error */
export class AuthError extends AxelError {
	readonly code = 'AUTH' as const;
	readonly isRetryable = false as const;
	readonly httpStatus: 401 | 403;

	constructor(message: string, status: 401 | 403 = 401) {
		super(message);
		this.httpStatus = status;
	}
}

/** External provider error (LLM, embedding, etc.) */
export class ProviderError extends AxelError {
	readonly code = 'PROVIDER' as const;
	readonly isRetryable: boolean;
	readonly httpStatus = 502 as const;
	readonly provider: string;

	constructor(
		message: string,
		provider: string,
		isRetryable: boolean,
		options?: { cause?: Error },
	) {
		super(message, options);
		this.provider = provider;
		this.isRetryable = isRetryable;
	}
}

/** Tool execution error */
export class ToolError extends AxelError {
	readonly code = 'TOOL' as const;
	readonly isRetryable: boolean;
	readonly httpStatus = 500 as const;
	readonly toolName: string;

	constructor(message: string, toolName: string, isRetryable = false) {
		super(message);
		this.toolName = toolName;
		this.isRetryable = isRetryable;
	}
}

/** Timeout error — safe to retry */
export class TimeoutError extends AxelError {
	readonly code = 'TIMEOUT' as const;
	readonly isRetryable = true as const;
	readonly httpStatus = 504 as const;
	readonly timeoutMs: number;

	constructor(message: string, timeoutMs: number) {
		super(message);
		this.timeoutMs = timeoutMs;
	}
}
