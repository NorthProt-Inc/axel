import { z } from 'zod';

// --- Schemas ---

export const LinkInfoSchema = z.object({
	url: z.string().min(1),
	start: z.number().int().min(0),
	end: z.number().int().min(0),
	type: z.enum(['url', 'email']),
});

export const ContentSummarySchema = z.object({
	title: z.string().optional(),
	content: z.string().min(1),
	byline: z.string().optional(),
	excerpt: z.string().optional(),
	siteName: z.string().optional(),
	wordCount: z.number().int().min(0).optional(),
});

export const LinkExtractResultSchema = z.object({
	link: LinkInfoSchema,
	summary: ContentSummarySchema.optional(),
	fetchedAt: z.coerce.date(),
	error: z.string().optional(),
});

// --- Types ---

export type LinkInfo = z.infer<typeof LinkInfoSchema>;
export type ContentSummary = z.infer<typeof ContentSummarySchema>;
export type LinkExtractResult = z.infer<typeof LinkExtractResultSchema>;

// --- DI Interface ---

export interface LinkContentProvider {
	readonly fetchContent: (url: string) => Promise<ContentSummary | undefined>;
}

// --- Pure Functions ---

const URL_REGEX = /https?:\/\/[^\s<>\"')\]},;]+[^\s<>\"')\]},;.!?:]/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractUrls(text: string): readonly LinkInfo[] {
	if (!text.trim()) return [];

	const results: LinkInfo[] = [];

	// Extract URLs
	const urlRegex = new RegExp(URL_REGEX.source, 'g');
	for (const match of text.matchAll(urlRegex)) {
		results.push({
			url: match[0],
			start: match.index,
			end: match.index + match[0].length,
			type: 'url',
		});
	}

	// Extract emails (only if not already part of a URL)
	const emailRegex = new RegExp(EMAIL_REGEX.source, 'g');
	for (const match of text.matchAll(emailRegex)) {
		const emailStart = match.index;
		const emailEnd = match.index + match[0].length;
		const overlapsUrl = results.some((r) => emailStart >= r.start && emailEnd <= r.end);
		if (!overlapsUrl) {
			results.push({
				url: `mailto:${match[0]}`,
				start: emailStart,
				end: emailEnd,
				type: 'email',
			});
		}
	}

	results.sort((a, b) => a.start - b.start);
	return results;
}
