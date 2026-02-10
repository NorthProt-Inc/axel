import { z } from 'zod';

// --- Constants ---

export const INTENT_TYPES = [
	'chat',
	'search',
	'tool_use',
	'memory_query',
	'command',
	'creative',
] as const;

// --- Schemas ---

export const IntentTypeSchema = z.enum(INTENT_TYPES);

export const ClassificationResultSchema = z.object({
	intent: IntentTypeSchema,
	confidence: z.number().min(0).max(1),
	secondaryIntent: IntentTypeSchema.optional(),
	secondaryConfidence: z.number().min(0).max(1).optional(),
});

// --- Types ---

export type IntentType = z.infer<typeof IntentTypeSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// --- DI Interface ---

export interface ClassificationContext {
	readonly userId: string;
	readonly channelId: string;
}

export interface IntentClassifier {
	readonly classify: (
		message: string,
		context?: ClassificationContext,
	) => Promise<ClassificationResult>;
}
