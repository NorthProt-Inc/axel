// Types and schemas
export {
	DEFAULT_REACT_CONFIG,
	ReActConfigSchema,
	type ChannelContext,
	type LlmChatChunk,
	type LlmChatParams,
	type LlmProvider,
	type ReActConfig,
	type ResolvedSession,
	type SessionStats,
	type SessionStore,
	type ToolExecutor,
	type UnifiedSession,
} from './types.js';

// ReAct loop
export { reactLoop, type ReActLoopParams } from './react-loop.js';

// Session router
export { SessionRouter } from './session-router.js';

// Session state validation (legacy — assertTransition only)
export { assertTransition } from './session-state.js';

// Memory persistence
export {
	estimateTokenCount,
	persistToMemory,
	type ConceptualMemoryLike,
	type EntityExtractorLike,
	type MemoryPersistenceParams,
	type SemanticMemoryWriterLike,
} from './memory-persistence.js';

// Inbound handler
export {
	createInboundHandler,
	type ErrorInfo,
	type InboundHandlerDeps,
	type SendCallback,
} from './inbound-handler.js';

// Interaction logging
export type { InteractionLog, InteractionLogger } from './interaction-log.js';

// Notification scheduler
export {
	NotificationScheduler,
	parseCronExpression,
	shouldTrigger,
	NotificationRuleSchema,
	type NotificationRule,
	type NotificationResult,
	type NotificationSender,
	type ParsedCron,
} from './notification.js';

// Session state machine (ADR-021)
export {
	SessionTransitionError,
	getValidTransitions,
	isValidTransition,
	transition,
} from './session-state-machine.js';
