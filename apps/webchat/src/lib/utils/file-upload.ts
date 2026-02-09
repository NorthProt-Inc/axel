import type { ContentBlock, FileBlock, ImageBlock } from '@axel/core/types';

/**
 * File upload utilities for WebChat.
 * Validates files and converts them to ContentBlock for multi-modal messages.
 */

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (per FEAT-CORE-001)
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface FileUploadError {
	readonly code: 'FILE_TOO_LARGE' | 'INVALID_NAME' | 'FILE_EMPTY';
	readonly message: string;
}

export interface ValidationResult {
	readonly valid: boolean;
	readonly errors: readonly FileUploadError[];
}

interface FileInfo {
	readonly name: string;
	readonly size: number;
	readonly type: string;
}

export function validateFileUpload(file: FileInfo): ValidationResult {
	const errors: FileUploadError[] = [];

	if (file.name.length === 0) {
		errors.push({ code: 'INVALID_NAME', message: 'File name is required' });
	}

	if (file.size === 0) {
		errors.push({ code: 'FILE_EMPTY', message: 'File is empty' });
	}

	if (file.size > MAX_FILE_SIZE_BYTES) {
		errors.push({
			code: 'FILE_TOO_LARGE',
			message: `File exceeds ${formatFileSize(MAX_FILE_SIZE_BYTES)} limit`,
		});
	}

	return { valid: errors.length === 0, errors };
}

interface FileData {
	readonly name: string;
	readonly type: string;
	readonly data: string;
	readonly size: number;
}

export function fileToContentBlock(file: FileData): ContentBlock {
	if (isImageFile(file.type)) {
		return {
			type: 'image',
			source: 'base64',
			mediaType: file.type as ImageBlock['mediaType'],
			data: file.data,
		} satisfies ImageBlock;
	}

	return {
		type: 'file',
		fileName: file.name,
		mimeType: file.type,
		data: file.data,
		sizeBytes: file.size,
	} satisfies FileBlock;
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(mimeType: string): boolean {
	return SUPPORTED_IMAGE_TYPES.has(mimeType);
}
