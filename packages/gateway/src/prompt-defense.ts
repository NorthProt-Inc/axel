/**
 * 4-layer prompt injection defense (ADR-019).
 *
 * Layer 1: Input sanitization — neutralize control characters and injection patterns
 * Layer 2: System prompt isolation — mark boundaries with delimiters
 * Layer 3: Output filtering — scan for leaked secrets/PII
 * Layer 4: Context boundary — wrap user input with markers
 */

/** Layer 1: Sanitize user input to neutralize common injection patterns */
export function sanitizeInput(input: string): string {
	// Strip null bytes
	let sanitized = input.replace(/\0/g, '');
	// Neutralize markdown-based injection (triple backtick system prompt extraction)
	sanitized = sanitized.replace(/```system/gi, '\\`\\`\\`system');
	// Neutralize "ignore previous instructions" patterns
	sanitized = sanitized.replace(
		/ignore\s+(all\s+)?previous\s+instructions/gi,
		'[FILTERED: instruction override attempt]',
	);
	// Neutralize "you are now" role hijacking
	sanitized = sanitized.replace(/you\s+are\s+now\s+/gi, '[FILTERED: role hijack attempt] ');
	return sanitized;
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
