import type {
	AxelChannel,
	ChannelCapabilities,
	HealthStatus,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
	SpeechToTextProvider,
	TextToSpeechProvider,
	TranscriptionResult,
	SynthesisResult,
} from '@axel/core/types';

const VOICE_CAPABILITIES: ChannelCapabilities = {
	streaming: true,
	richMedia: true,
	reactions: false,
	threads: false,
	voiceInput: true,
	maxMessageLength: Number.MAX_SAFE_INTEGER,
	typingIndicator: false,
};

interface VoiceChannelOptions {
	readonly stt: SpeechToTextProvider;
	readonly tts: TextToSpeechProvider;
	readonly channelId?: string;
	readonly onSend?: (target: string, content: string) => void;
	readonly onError?: (err: unknown) => void;
}

/**
 * Voice I/O Channel — Whisper STT + TTS integration.
 *
 * Provides voice-to-text and text-to-voice capabilities.
 * DI-friendly: STT/TTS providers injected via constructor.
 */
export class VoiceChannel implements AxelChannel {
	readonly id: string;
	readonly capabilities = VOICE_CAPABILITIES;

	private readonly stt: SpeechToTextProvider;
	private readonly tts: TextToSpeechProvider;
	private readonly onSendCallback: ((target: string, content: string) => void) | undefined;
	private readonly onErrorCallback: ((err: unknown) => void) | undefined;
	private handler: InboundHandler | null = null;
	private running = false;

	constructor(options: VoiceChannelOptions) {
		this.id = options.channelId ?? 'voice';
		this.stt = options.stt;
		this.tts = options.tts;
		this.onSendCallback = options.onSend;
		this.onErrorCallback = options.onError;
	}

	async start(): Promise<void> {
		this.running = true;
	}

	async stop(): Promise<void> {
		this.running = false;
	}

	async healthCheck(): Promise<HealthStatus> {
		return {
			state: this.running ? 'healthy' : 'unhealthy',
			timestamp: new Date(),
			checks: {},
			uptime: 0,
		};
	}

	onMessage(handler: InboundHandler): void {
		this.handler = handler;
	}

	async send(target: string, msg: OutboundMessage): Promise<void> {
		this.onSendCallback?.(target, msg.content);
	}

	/**
	 * Transcribe audio buffer to text using configured STT provider.
	 */
	async transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult> {
		if (!this.running) throw new Error('Channel not started');
		return this.stt.transcribe(audio, mimeType);
	}

	/**
	 * Synthesize text to audio using configured TTS provider.
	 */
	async synthesize(text: string): Promise<SynthesisResult> {
		if (!this.running) throw new Error('Channel not started');
		return this.tts.synthesize(text);
	}

	/**
	 * Handle incoming audio — transcribe and route to inbound handler.
	 */
	async handleAudioInput(userId: string, audio: Buffer, mimeType: string): Promise<void> {
		if (!this.running) throw new Error('Channel not started');

		if (!this.stt.supportedFormats.includes(mimeType)) {
			throw new Error(`Unsupported audio format: ${mimeType}`);
		}

		const transcription = await this.stt.transcribe(audio, mimeType);

		if (this.handler) {
			const message: InboundMessage = {
				userId,
				channelId: this.id,
				content: transcription.text,
				timestamp: new Date(),
				media: [
					{
						type: 'audio',
						url: `audio://${Date.now()}`,
						mimeType,
						sizeBytes: audio.length,
					},
				],
			};

			try {
				await this.handler(message);
			} catch (err) {
				this.onErrorCallback?.(err);
			}
		}
	}
}
