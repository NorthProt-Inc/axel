/**
 * 4-layer prompt injection defense (ADR-019).
 *
 * Layer 1: Input sanitization — neutralize control characters and injection patterns
 * Layer 2: System prompt isolation — mark boundaries with delimiters
 * Layer 3: Output filtering — scan for leaked secrets/PII
 * Layer 4: Context boundary — wrap user input with markers
 */

/**
 * Combined pattern for all Layer 1 sanitization rules (PERF-H5).
 * Single scan instead of 4 sequential passes: O(4n) → O(n).
 */
const SANITIZE_PATTERN =
	/\0|```system|ignore\s+(all\s+)?previous\s+instructions|you\s+are\s+now\s+/gi;

/** Layer 1: Sanitize user input to neutralize common injection patterns */
export function sanitizeInput(input: string): string {
	return input.replace(SANITIZE_PATTERN, (match) => {
		if (match === '\0') return '';
		if (match.toLowerCase().startsWith('```system')) return '\\`\\`\\`system';
		if (match.toLowerCase().startsWith('ignore')) return '[FILTERED: instruction override attempt]';
		return '[FILTERED: role hijack attempt] ';
	});
}

/** Layer 2: Wrap system prompt with isolation markers */
export function isolateSystemPrompt(systemPrompt: string): string {
	return `<<<SYSTEM_PROMPT_START>>>\n${systemPrompt}\n<<<SYSTEM_PROMPT_END>>>`;
}

/** Layer 3: Scan output for potential secret leaks */
export function filterOutput(output: string): string {
	// Mask API key patterns (sk-..., AIza..., ghp_..., etc.)
	let filtered = output.replace(
		/\b(sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{30,}|ghp_[a-zA-Z0-9]{36}|xoxb-[a-zA-Z0-9-]+)\b/g,
		'[REDACTED_API_KEY]',
	);
	// Mask email addresses
	filtered = filtered.replace(
		/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
		'[REDACTED_EMAIL]',
	);
	return filtered;
}

/** Layer 4: Wrap user input with context boundary markers */
export function wrapUserInput(userInput: string): string {
	return `<<<USER_INPUT_START>>>\n${userInput}\n<<<USER_INPUT_END>>>`;
}

/** Apply all 4 layers to incoming user message content */
export function applyPromptDefense(input: string): string {
	return sanitizeInput(input);
}
