import { describe, expect, it } from 'vitest';
import {
	TextBlockSchema,
	ImageBlockSchema,
	FileBlockSchema,
	ContentBlockSchema,
	type TextBlock,
	type ImageBlock,
	type FileBlock,
	type ContentBlock,
	isMultiModalContent,
	extractTextContent,
	IMAGE_MAX_SIZE_BYTES,
	SUPPORTED_IMAGE_TYPES,
} from '../../src/types/content-block.js';

describe('ContentBlock types', () => {
	describe('TextBlock', () => {
		it('validates a valid text block', () => {
			const block: TextBlock = { type: 'text', text: 'Hello world' };
			const result = TextBlockSchema.safeParse(block);
			expect(result.success).toBe(true);
		});

		it('rejects empty text', () => {
			const result = TextBlockSchema.safeParse({ type: 'text', text: '' });
			expect(result.success).toBe(false);
		});

		it('rejects wrong type', () => {
			const result = TextBlockSchema.safeParse({ type: 'image', text: 'hello' });
			expect(result.success).toBe(false);
		});
	});

	describe('ImageBlock', () => {
		it('validates a base64 inline image', () => {
			const block: ImageBlock = {
				type: 'image',
				source: 'base64',
				mediaType: 'image/png',
				data: 'iVBORw0KGgoAAAANSUhEUg==',
			};
			const result = ImageBlockSchema.safeParse(block);
			expect(result.success).toBe(true);
		});

		it('validates a URL image', () => {
			const block: ImageBlock = {
				type: 'image',
				source: 'url',
				mediaType: 'image/jpeg',
				url: 'https://example.com/photo.jpg',
			};
			const result = ImageBlockSchema.safeParse(block);
			expect(result.success).toBe(true);
		});

		it('rejects unsupported media type', () => {
			const result = ImageBlockSchema.safeParse({
				type: 'image',
				source: 'base64',
				mediaType: 'image/bmp',
				data: 'abc123',
			});
			expect(result.success).toBe(false);
		});

		it('rejects base64 without data', () => {
			const result = ImageBlockSchema.safeParse({
				type: 'image',
				source: 'base64',
				mediaType: 'image/png',
			});
			expect(result.success).toBe(false);
		});

		it('rejects url source without url', () => {
			const result = ImageBlockSchema.safeParse({
				type: 'image',
				source: 'url',
				mediaType: 'image/png',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('FileBlock', () => {
		it('validates a file block', () => {
			const block: FileBlock = {
				type: 'file',
				fileName: 'report.pdf',
				mimeType: 'application/pdf',
				data: 'base64data==',
			};
			const result = FileBlockSchema.safeParse(block);
			expect(result.success).toBe(true);
		});

		it('validates a file block with sizeBytes', () => {
			const block: FileBlock = {
				type: 'file',
				fileName: 'data.csv',
				mimeType: 'text/csv',
				data: 'col1,col2',
				sizeBytes: 1024,
			};
			const result = FileBlockSchema.safeParse(block);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sizeBytes).toBe(1024);
			}
		});

		it('rejects file block without fileName', () => {
			const result = FileBlockSchema.safeParse({
				type: 'file',
				mimeType: 'text/plain',
				data: 'abc',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('ContentBlock discriminated union', () => {
		it('parses text block correctly', () => {
			const result = ContentBlockSchema.safeParse({ type: 'text', text: 'hi' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.type).toBe('text');
			}
		});

		it('parses image block correctly', () => {
			const result = ContentBlockSchema.safeParse({
				type: 'image',
				source: 'base64',
				mediaType: 'image/png',
				data: 'abc',
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.type).toBe('image');
			}
		});

		it('parses file block correctly', () => {
			const result = ContentBlockSchema.safeParse({
				type: 'file',
				fileName: 'doc.txt',
				mimeType: 'text/plain',
				data: 'content',
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.type).toBe('file');
			}
		});

		it('rejects unknown block type', () => {
			const result = ContentBlockSchema.safeParse({ type: 'video', data: 'abc' });
			expect(result.success).toBe(false);
		});
	});

	describe('isMultiModalContent', () => {
		it('returns false for string content', () => {
			expect(isMultiModalContent('hello')).toBe(false);
		});

		it('returns true for ContentBlock array', () => {
			const blocks: ContentBlock[] = [{ type: 'text', text: 'hi' }];
			expect(isMultiModalContent(blocks)).toBe(true);
		});

		it('returns false for empty array', () => {
			expect(isMultiModalContent([])).toBe(false);
		});

		it('returns true for array with image block', () => {
			const blocks: ContentBlock[] = [
				{ type: 'text', text: 'Look at this:' },
				{ type: 'image', source: 'base64', mediaType: 'image/png', data: 'abc' },
			];
			expect(isMultiModalContent(blocks)).toBe(true);
		});
	});

	describe('extractTextContent', () => {
		it('returns string content as-is', () => {
			expect(extractTextContent('hello world')).toBe('hello world');
		});

		it('extracts text from ContentBlock array', () => {
			const blocks: ContentBlock[] = [
				{ type: 'text', text: 'First' },
				{ type: 'image', source: 'base64', mediaType: 'image/png', data: 'abc' },
				{ type: 'text', text: 'Second' },
			];
			expect(extractTextContent(blocks)).toBe('First\nSecond');
		});

		it('returns empty string for no text blocks', () => {
			const blocks: ContentBlock[] = [
				{ type: 'image', source: 'base64', mediaType: 'image/png', data: 'abc' },
			];
			expect(extractTextContent(blocks)).toBe('');
		});

		it('returns empty string for empty array', () => {
			expect(extractTextContent([])).toBe('');
		});
	});

	describe('constants', () => {
		it('IMAGE_MAX_SIZE_BYTES is 5MB', () => {
			expect(IMAGE_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
		});

		it('SUPPORTED_IMAGE_TYPES includes required formats', () => {
			expect(SUPPORTED_IMAGE_TYPES).toContain('image/jpeg');
			expect(SUPPORTED_IMAGE_TYPES).toContain('image/png');
			expect(SUPPORTED_IMAGE_TYPES).toContain('image/webp');
			expect(SUPPORTED_IMAGE_TYPES).toContain('image/gif');
		});
	});
});
