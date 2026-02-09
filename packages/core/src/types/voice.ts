import { z } from 'zod';

// ─── STT Configuration ───

const SpeechToTextConfigSchema = z.object({
	model: z.string().default('whisper-1'),
	language: z.string().optional(),
	maxDurationSeconds: z.number().positive().default(300),
});

type SpeechToTextConfig = z.infer<typeof SpeechToTextConfigSchema>;

// ─── TTS Configuration ───

const TextToSpeechConfigSchema = z.object({
	model: z.string().default('tts-1'),
	voice: z.string().default('alloy'),
	speed: z.number().min(0.25).max(4.0).default(1.0),
});

type TextToSpeechConfig = z.infer<typeof TextToSpeechConfigSchema>;

// ─── Voice Events ───

const VoiceEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('transcription'),
		text: z.string(),
		confidence: z.number().min(0).max(1),
		durationMs: z.number().nonnegative(),
	}),
	z.object({
		type: z.literal('synthesis_complete'),
		audioUrl: z.string().optional(),
		durationMs: z.number().nonnegative(),
	}),
	z.object({
		type: z.literal('error'),
		error: z.string(),
	}),
]);

type VoiceEvent = z.infer<typeof VoiceEventSchema>;

// ─── Transcription Result ───

interface TranscriptionResult {
	readonly text: string;
	readonly confidence: number;
	readonly durationMs: number;
	readonly language?: string;
}

// ─── Synthesis Result ───

interface SynthesisResult {
	readonly audio: Buffer;
	readonly mimeType: string;
	readonly durationMs: number;
}

// ─── STT Provider Interface (DI Contract) ───

interface SpeechToTextProvider {
	readonly supportedFormats: readonly string[];
	transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

// ─── TTS Provider Interface (DI Contract) ───

interface TextToSpeechProvider {
	readonly supportedVoices: readonly string[];
	synthesize(text: string): Promise<SynthesisResult>;
	synthesizeStreaming?(text: string): AsyncIterable<Buffer>;
}

export {
	SpeechToTextConfigSchema,
	TextToSpeechConfigSchema,
	VoiceEventSchema,
	type SpeechToTextConfig,
	type TextToSpeechConfig,
	type VoiceEvent,
	type TranscriptionResult,
	type SynthesisResult,
	type SpeechToTextProvider,
	type TextToSpeechProvider,
};
