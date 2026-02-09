import { describe, expect, it } from 'vitest';
import {
	validateFileUpload,
	fileToContentBlock,
	formatFileSize,
	isImageFile,
	type FileUploadError,
} from '../src/lib/utils/file-upload.js';

describe('WebChat File Upload — Validation', () => {
	it('accepts a valid image file under size limit', () => {
		const result = validateFileUpload({
			name: 'photo.jpg',
			size: 1024 * 1024, // 1MB
			type: 'image/jpeg',
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it('rejects file exceeding 5MB limit', () => {
		const result = validateFileUpload({
			name: 'huge.png',
			size: 6 * 1024 * 1024,
			type: 'image/png',
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some((e: FileUploadError) => e.code === 'FILE_TOO_LARGE')).toBe(true);
	});

	it('accepts supported image types', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
			const result = validateFileUpload({ name: 'img.ext', size: 1024, type });
			expect(result.valid).toBe(true);
		}
	});

	it('accepts text files', () => {
		const result = validateFileUpload({
			name: 'readme.txt',
			size: 512,
			type: 'text/plain',
		});
		expect(result.valid).toBe(true);
	});

	it('rejects empty file name', () => {
		const result = validateFileUpload({
			name: '',
			size: 1024,
			type: 'text/plain',
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some((e: FileUploadError) => e.code === 'INVALID_NAME')).toBe(true);
	});

	it('rejects zero-size file', () => {
		const result = validateFileUpload({
			name: 'empty.txt',
			size: 0,
			type: 'text/plain',
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some((e: FileUploadError) => e.code === 'FILE_EMPTY')).toBe(true);
	});
});

describe('WebChat File Upload — ContentBlock Conversion', () => {
	it('converts image file to ImageBlock', () => {
		const block = fileToContentBlock({
			name: 'photo.jpg',
			type: 'image/jpeg',
			data: 'base64data',
			size: 1024,
		});
		expect(block.type).toBe('image');
		if (block.type === 'image') {
			expect(block.source).toBe('base64');
			expect(block.mediaType).toBe('image/jpeg');
			expect(block.data).toBe('base64data');
		}
	});

	it('converts non-image file to FileBlock', () => {
		const block = fileToContentBlock({
			name: 'readme.md',
			type: 'text/markdown',
			data: 'base64data',
			size: 512,
		});
		expect(block.type).toBe('file');
		if (block.type === 'file') {
			expect(block.fileName).toBe('readme.md');
			expect(block.mimeType).toBe('text/markdown');
			expect(block.sizeBytes).toBe(512);
		}
	});
});

describe('WebChat File Upload — Utilities', () => {
	it('formats file sizes correctly', () => {
		expect(formatFileSize(512)).toBe('512 B');
		expect(formatFileSize(1024)).toBe('1.0 KB');
		expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
	});

	it('detects image files', () => {
		expect(isImageFile('image/jpeg')).toBe(true);
		expect(isImageFile('image/png')).toBe(true);
		expect(isImageFile('text/plain')).toBe(false);
		expect(isImageFile('application/pdf')).toBe(false);
	});
});
