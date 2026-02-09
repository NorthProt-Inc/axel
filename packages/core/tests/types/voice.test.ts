import { describe, expect, it } from 'vitest';
import {
	SpeechToTextConfigSchema,
	TextToSpeechConfigSchema,
	VoiceEventSchema,
	type SpeechToTextProvider,
	type TextToSpeechProvider,
	type VoiceEvent,
} from '../../src/types/voice.js';

describe('SpeechToTextConfigSchema', () => {
	it('validates valid config', () => {
		const result = SpeechToTextConfigSchema.safeParse({
			model: 'whisper-1',
			language: 'en',
			maxDurationSeconds: 120,
		});
		expect(result.success).toBe(true);
	});

	it('provides defaults', () => {
		const result = SpeechToTextConfigSchema.parse({});
		expect(result.model).toBe('whisper-1');
		expect(result.language).toBeUndefined();
		expect(result.maxDurationSeconds).toBe(300);
	});

	it('rejects negative duration', () => {
		const result = SpeechToTextConfigSchema.safeParse({ maxDurationSeconds: -1 });
		expect(result.success).toBe(false);
	});
});

describe('TextToSpeechConfigSchema', () => {
	it('validates valid config', () => {
		const result = TextToSpeechConfigSchema.safeParse({
			model: 'tts-1',
			voice: 'alloy',
			speed: 1.0,
		});
		expect(result.success).toBe(true);
	});

	it('provides defaults', () => {
		const result = TextToSpeechConfigSchema.parse({});
		expect(result.model).toBe('tts-1');
		expect(result.voice).toBe('alloy');
		expect(result.speed).toBe(1.0);
	});

	it('rejects speed out of range', () => {
		expect(TextToSpeechConfigSchema.safeParse({ speed: 0.1 }).success).toBe(false);
		expect(TextToSpeechConfigSchema.safeParse({ speed: 5 }).success).toBe(false);
	});
});

describe('VoiceEventSchema', () => {
	it('validates transcription event', () => {
		const result = VoiceEventSchema.safeParse({
			type: 'transcription',
			text: 'Hello',
			confidence: 0.95,
			durationMs: 1500,
		});
		expect(result.success).toBe(true);
	});

	it('validates synthesis_complete event', () => {
		const result = VoiceEventSchema.safeParse({
			type: 'synthesis_complete',
			audioUrl: 'https://example.com/audio.mp3',
			durationMs: 2000,
		});
		expect(result.success).toBe(true);
	});

	it('validates error event', () => {
		const result = VoiceEventSchema.safeParse({
			type: 'error',
			error: 'Audio too short',
		});
		expect(result.success).toBe(true);
	});
});

describe('SpeechToTextProvider interface', () => {
	it('has expected shape', () => {
		const mockProvider: SpeechToTextProvider = {
			transcribe: async (_audio: Buffer, _mimeType: string) => ({
				text: 'Hello world',
				confidence: 0.98,
				durationMs: 1500,
				language: 'en',
			}),
			supportedFormats: ['audio/wav', 'audio/mp3', 'audio/webm'],
		};

		expect(mockProvider.supportedFormats).toContain('audio/wav');
		expect(typeof mockProvider.transcribe).toBe('function');
	});
});

describe('TextToSpeechProvider interface', () => {
	it('has expected shape', () => {
		const mockProvider: TextToSpeechProvider = {
			synthesize: async (_text: string) => ({
				audio: Buffer.from('fake-audio'),
				mimeType: 'audio/mp3',
				durationMs: 2000,
			}),
			supportedVoices: ['alloy', 'echo', 'fable'],
		};

		expect(mockProvider.supportedVoices).toContain('alloy');
		expect(typeof mockProvider.synthesize).toBe('function');
	});

	it('streaming synthesize has expected shape', () => {
		async function* fakeStream() {
			yield Buffer.from('chunk1');
			yield Buffer.from('chunk2');
		}
		const mockProvider: TextToSpeechProvider = {
			synthesize: async (_text: string) => ({
				audio: Buffer.from('fake-audio'),
				mimeType: 'audio/mp3',
				durationMs: 2000,
			}),
			synthesizeStreaming: (_text: string) => fakeStream(),
			supportedVoices: ['alloy'],
		};

		expect(typeof mockProvider.synthesizeStreaming).toBe('function');
	});
});
