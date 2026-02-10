import { z } from 'zod';

/** Supported image MIME types (RES-009: JPEG/PNG/WebP/GIF) */
export const SUPPORTED_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
] as const;

/** Maximum image size in bytes (5MB per RES-009) */
export const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// ─── Content Block Schemas (Zod) ───

/** Text content block */
export const TextBlockSchema = z.object({
	type: z.literal('text'),
	text: z.string().min(1),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

/** Image content block — base64 inline or URL */
export const ImageBlockSchema = z.discriminatedUnion('source', [
	z.object({
		type: z.literal('image'),
		source: z.literal('base64'),
		mediaType: z.enum(SUPPORTED_IMAGE_TYPES),
		data: z.string().min(1),
	}),
	z.object({
		type: z.literal('image'),
		source: z.literal('url'),
		mediaType: z.enum(SUPPORTED_IMAGE_TYPES),
		url: z.string().url(),
	}),
]);
export type ImageBlock = z.infer<typeof ImageBlockSchema>;

/** File content block */
export const FileBlockSchema = z.object({
	type: z.literal('file'),
	fileName: z.string().min(1),
	mimeType: z.string().min(1),
	data: z.string().min(1),
	sizeBytes: z.number().int().positive().optional(),
});
export type FileBlock = z.infer<typeof FileBlockSchema>;

/** Discriminated union of all content block types */
export const ContentBlockSchema = z.discriminatedUnion('type', [
	TextBlockSchema,
	z
		.object({
			type: z.literal('image'),
			source: z.enum(['base64', 'url']),
			mediaType: z.enum(SUPPORTED_IMAGE_TYPES),
			data: z.string().optional(),
			url: z.string().url().optional(),
		})
		.refine((val) => (val.source === 'base64' ? !!val.data : !!val.url), {
			message: 'base64 requires data, url requires url field',
		}),
	FileBlockSchema,
]);
export type ContentBlock = TextBlock | ImageBlock | FileBlock;

/** Message content — plain string or multi-modal content blocks */
export type MessageContent = string | readonly ContentBlock[];

/** Type guard: is content multi-modal (ContentBlock array with items)? */
export function isMultiModalContent(
	content: string | readonly ContentBlock[],
): content is readonly ContentBlock[] {
	return Array.isArray(content) && content.length > 0;
}

/** Extract text from MessageContent (joins text blocks, ignores media) */
export function extractTextContent(content: string | readonly ContentBlock[]): string {
	if (typeof content === 'string') {
		return content;
	}
	return content
		.filter((block): block is TextBlock => block.type === 'text')
		.map((block) => block.text)
		.join('\n');
}
