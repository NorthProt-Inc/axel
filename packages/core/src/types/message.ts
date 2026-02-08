/** Message sender role */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Conversation message */
export interface Message {
	readonly sessionId: string;
	readonly turnId: number;
	readonly role: MessageRole;
	readonly content: string;
	readonly channelId: string | null;
	readonly timestamp: Date;
	readonly emotionalContext: string;
	readonly metadata: Readonly<Record<string, unknown>>;
}
