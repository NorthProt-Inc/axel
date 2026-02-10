// Memory types
export type { MemoryType, Memory, MemorySearchResult } from './memory.js';

// Message types
export type { MessageRole, Message } from './message.js';

// Content block types (multi-modal, RES-009)
export {
	TextBlockSchema,
	ImageBlockSchema,
	FileBlockSchema,
	ContentBlockSchema,
	isMultiModalContent,
	extractTextContent,
	IMAGE_MAX_SIZE_BYTES,
	SUPPORTED_IMAGE_TYPES,
} from './content-block.js';
export type {
	TextBlock,
	ImageBlock,
	FileBlock,
	ContentBlock,
	MessageContent,
} from './content-block.js';

// Session types
export type { SessionState, SessionSummary } from './session.js';

// ReAct types
export type { ReActEvent, ToolCallRequest, AxelErrorInfo } from './react.js';

// Tool types
export type { ToolResult, ToolCategory, ToolDefinition } from './tool.js';

// Health types
export type {
	HealthState,
	HealthStatus,
	ComponentHealth,
} from './health.js';

// Engine types
export type { MemoryEngine, MemoryStats } from './engine.js';

// Common types
export type { TokenUsage } from './common.js';

// Channel types
export type {
	AxelChannel,
	ChannelCapabilities,
	InboundHandler,
	InboundMessage,
	MediaAttachment,
	OutboundMessage,
	PresenceStatus,
} from './channel.js';

// Voice types (STT/TTS, FEAT-CHAN-002)
export {
	SpeechToTextConfigSchema,
	TextToSpeechConfigSchema,
	VoiceEventSchema,
} from './voice.js';
export type {
	SpeechToTextConfig,
	TextToSpeechConfig,
	VoiceEvent,
	TranscriptionResult,
	SynthesisResult,
	SpeechToTextProvider,
	TextToSpeechProvider,
} from './voice.js';

// Link Understanding types (FEAT-LINK-001)
export {
	LinkInfoSchema,
	ContentSummarySchema,
	LinkExtractResultSchema,
	extractUrls,
} from './link.js';
export type {
	LinkInfo,
	ContentSummary,
	LinkExtractResult,
	LinkContentProvider,
} from './link.js';

// Intent Classifier types (FEAT-INTENT-001)
export {
	IntentTypeSchema,
	ClassificationResultSchema,
	INTENT_TYPES,
} from './intent.js';
export type {
	IntentType,
	ClassificationResult,
	ClassificationContext,
	IntentClassifier,
} from './intent.js';

// Error classes (runtime values — must use `export` not `export type`)
export {
	AxelError,
	TransientError,
	PermanentError,
	ValidationError,
	AuthError,
	ProviderError,
	ToolError,
	TimeoutError,
} from './errors.js';
