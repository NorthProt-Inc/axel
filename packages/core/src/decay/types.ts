import { z } from 'zod';

/** Zod schema for decay calculation input (ADR-015) */
export const DecayInputSchema = z.object({
	importance: z.number().min(0).max(1),
	memoryType: z.enum(['fact', 'preference', 'insight', 'conversation']),
	hoursElapsed: z.number().min(0),
	accessCount: z.number().int().min(1),
	connectionCount: z.number().int().min(0),
	channelMentions: z.number().int().min(0),
	lastAccessedHoursAgo: z.number().min(0),
	ageHours: z.number().min(0),
});

/** Input for decay calculation */
export type DecayInput = z.infer<typeof DecayInputSchema>;

/** Zod schema for decay configuration */
export const DecayConfigSchema = z.object({
	baseRate: z.number().positive(),
	minRetention: z.number().min(0).max(1),
	deleteThreshold: z.number().min(0).max(1),
	accessStabilityK: z.number().min(0),
	relationResistanceK: z.number().min(0),
	channelDiversityK: z.number().min(0),
	recencyBoost: z.number().min(1),
	recencyAgeThreshold: z.number().positive(),
	recencyAccessThreshold: z.number().positive(),
	typeMultipliers: z.record(z.string(), z.number()),
});

/** Configuration for decay calculation */
export type DecayConfig = z.infer<typeof DecayConfigSchema>;

/** Default configuration matching ADR-015 spec */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
	baseRate: 0.001,
	minRetention: 0.3,
	deleteThreshold: 0.03,
	accessStabilityK: 0.3,
	relationResistanceK: 0.1,
	channelDiversityK: 0.2,
	recencyBoost: 1.3,
	recencyAgeThreshold: 168,
	recencyAccessThreshold: 24,
	typeMultipliers: {
		fact: 0.3,
		preference: 0.5,
		insight: 0.7,
		conversation: 1.0,
	},
} as const;
