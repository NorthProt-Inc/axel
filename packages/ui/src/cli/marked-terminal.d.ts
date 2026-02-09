/**
 * Type declarations for marked-terminal@7.3.0
 *
 * marked-terminal is a custom renderer for marked that outputs to the terminal.
 * @see https://github.com/mikaelbr/marked-terminal
 */

declare module 'marked-terminal' {
	import type { MarkedExtension } from 'marked';

	/**
	 * Options for markedTerminal renderer.
	 * Defines color/style functions for various markdown elements.
	 */
	export interface MarkedTerminalOptions {
		/** Code block color */
		code?: (code: string) => string;
		/** Blockquote color */
		blockquote?: (quote: string) => string;
		/** HTML tag color */
		html?: (html: string) => string;
		/** Heading color (function or array of functions for h1-h6) */
		heading?: (text: string) => string | Array<(text: string) => string>;
		/** First-level heading color */
		firstHeading?: (text: string) => string;
		/** Horizontal rule character */
		hr?: string;
		/** List item bullet/number */
		listitem?: (text: string) => string;
		/** Table styling */
		table?: (table: string) => string;
		/** Paragraph styling */
		paragraph?: (text: string) => string;
		/** Strong/bold text */
		strong?: (text: string) => string;
		/** Emphasis/italic text */
		em?: (text: string) => string;
		/** Inline code span */
		codespan?: (code: string) => string;
		/** Deleted text */
		del?: (text: string) => string;
		/** Link text */
		link?: (text: string) => string;
		/** Link href */
		href?: (href: string) => string;
		/** Text styling */
		text?: (text: string) => string;
		/** Unordered list symbol */
		unescape?: boolean;
		/** Emoji rendering */
		emoji?: boolean;
		/** Image alt text */
		image?: (href: string, title: string, text: string) => string;
		/** Table cell alignment */
		tableOptions?: {
			chars?: Record<string, string>;
			style?: {
				head?: string[];
				border?: string[];
			};
		};
		/** Code highlighting language */
		highlight?: (code: string, lang: string) => string;
		/** Width of output (default: 80) */
		width?: number;
		/** Indentation for nested elements */
		indent?: number;
		/** Show section prefix */
		showSectionPrefix?: boolean;
		/** Reflect heading depth */
		reflowText?: boolean;
		/** Tab width */
		tab?: number;
		/** Line break */
		br?: string;
	}

	/**
	 * Create a marked extension for terminal output.
	 *
	 * @param options - Styling options for terminal rendering
	 * @returns Marked extension object
	 *
	 * @example
	 * ```typescript
	 * import { Marked } from 'marked';
	 * import { markedTerminal } from 'marked-terminal';
	 * import chalk from 'chalk';
	 *
	 * const marked = new Marked();
	 * marked.use(markedTerminal({
	 *   code: chalk.yellow,
	 *   strong: chalk.bold,
	 *   em: chalk.italic,
	 * }));
	 *
	 * const output = marked.parse('# Hello, **world**!');
	 * console.log(output);
	 * ```
	 */
	export function markedTerminal(options?: MarkedTerminalOptions): MarkedExtension;
}
