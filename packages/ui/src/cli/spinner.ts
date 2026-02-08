import ora, { type Ora } from 'ora';
import { createCliTheme } from './theme.js';

/**
 * Streaming wait indicator for CLI.
 * Shows a spinner while Axel is generating a response.
 */

export function createSpinner(text?: string): Ora {
	const theme = createCliTheme();
	return ora({
		text: text ?? theme.dim('thinking...'),
		color: 'cyan',
		spinner: 'dots',
	});
}
