import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VoiceChannel } from '../../src/voice/voice-channel.js';
import type { SpeechToTextProvider, TextToSpeechProvider } from '@axel/core/types';

function createMockStt(): SpeechToTextProvider {
	return {
		supportedFormats: ['audio/wav', 'audio/mp3', 'audio/webm'],
		transcribe: vi.fn().mockResolvedValue({
			text: 'Hello world',
			confidence: 0.95,
			durationMs: 1500,
			language: 'en',
		}),
	};
}

function createMockTts(): TextToSpeechProvider {
	return {
		supportedVoices: ['alloy', 'echo'],
		synthesize: vi.fn().mockResolvedValue({
			audio: Buffer.from('fake-audio-data'),
			mimeType: 'audio/mp3',
			durationMs: 2000,
		}),
	};
}

describe('VoiceChannel', () => {
	let stt: SpeechToTextProvider;
	let tts: TextToSpeechProvider;

	beforeEach(() => {
		stt = createMockStt();
		tts = createMockTts();
	});

	it('has correct id', () => {
		const channel = new VoiceChannel({ stt, tts });
		expect(channel.id).toBe('voice');
	});

	it('has correct capabilities (voiceInput = true)', () => {
		const channel = new VoiceChannel({ stt, tts });
		expect(channel.capabilities.voiceInput).toBe(true);
		expect(channel.capabilities.streaming).toBe(true);
		expect(channel.capabilities.richMedia).toBe(true);
	});

	it('starts and stops without error', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();
		await channel.stop();
	});

	it('reports healthy status', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();
		const health = await channel.healthCheck();
		expect(health.state).toBe('healthy');
	});

	it('reports unhealthy when stopped', async () => {
		const channel = new VoiceChannel({ stt, tts });
		const health = await channel.healthCheck();
		expect(health.state).toBe('unhealthy');
	});

	it('transcribes audio to text via STT', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();

		const result = await channel.transcribe(Buffer.from('audio-data'), 'audio/wav');

		expect(result.text).toBe('Hello world');
		expect(result.confidence).toBe(0.95);
		expect(stt.transcribe).toHaveBeenCalledWith(Buffer.from('audio-data'), 'audio/wav');
	});

	it('synthesizes text to audio via TTS', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();

		const result = await channel.synthesize('Hello');

		expect(result.mimeType).toBe('audio/mp3');
		expect(result.audio).toBeInstanceOf(Buffer);
		expect(tts.synthesize).toHaveBeenCalledWith('Hello');
	});

	it('sends text message via send()', async () => {
		const onSend = vi.fn();
		const channel = new VoiceChannel({ stt, tts, onSend });
		await channel.start();

		await channel.send('user-1', { content: 'Hello' });

		expect(onSend).toHaveBeenCalledWith('user-1', 'Hello');
	});

	it('registers and triggers inbound handler with transcribed audio', async () => {
		const handler = vi.fn().mockResolvedValue(undefined);
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();
		channel.onMessage(handler);

		await channel.handleAudioInput('user-1', Buffer.from('audio'), 'audio/wav');

		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				channelId: 'voice',
				content: 'Hello world',
			}),
		);
	});

	it('rejects unsupported audio format', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await channel.start();

		await expect(
			channel.handleAudioInput('user-1', Buffer.from('audio'), 'video/mp4'),
		).rejects.toThrow('Unsupported audio format');
	});

	it('custom channel id', () => {
		const channel = new VoiceChannel({ stt, tts, channelId: 'voice-discord' });
		expect(channel.id).toBe('voice-discord');
	});

	it('rejects operations when not started', async () => {
		const channel = new VoiceChannel({ stt, tts });
		await expect(channel.transcribe(Buffer.from('audio'), 'audio/wav')).rejects.toThrow(
			'Channel not started',
		);
	});
});
