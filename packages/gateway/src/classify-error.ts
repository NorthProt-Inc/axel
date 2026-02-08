/** Classified error result per ADR-011 */
export interface ClassifiedError {
	readonly status: number;
	readonly code: string;
	readonly message: string;
}

/**
 * Classify an error into HTTP status + error code per ADR-011.
 *
 * In production, error messages are redacted to prevent information leakage.
 */
export function classifyError(err: unknown, env = 'production'): ClassifiedError {
	if (err instanceof TypeError || err instanceof SyntaxError) {
		return {
			status: 400,
			code: 'bad_request',
			message: env === 'development' && err instanceof Error ? err.message : 'Bad Request',
		};
	}

	const message =
		env === 'development' && err instanceof Error ? err.message : 'Internal Server Error';

	return { status: 500, code: 'internal_error', message };
}
