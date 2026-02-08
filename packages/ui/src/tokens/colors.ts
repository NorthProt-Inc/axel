/**
 * NorthProt brand color palette.
 * Source: ~/projects/.Axel/etc/ brand assets
 */
export const colors = {
	/** Primary background — deep navy */
	navy: '#0a1628',
	/** Mid-tone navy for panels/cards */
	navyMid: '#1e4a6d',
	/** Accent — cyan */
	cyan: '#06B6D4',
	/** Highlight — magenta */
	magenta: '#c73b6c',
	/** Text — white */
	white: '#ffffff',
	/** Muted text — light gray */
	gray: '#94a3b8',
	/** Dim text — dark gray */
	grayDim: '#64748b',
	/** Error — red */
	error: '#ef4444',
	/** Success — green */
	success: '#22c55e',
	/** Warning — amber */
	warning: '#f59e0b',
} as const;

export type ColorName = keyof typeof colors;
