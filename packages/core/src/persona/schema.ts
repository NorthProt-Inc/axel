import { z } from 'zod';

/** Zod schema for persona file structure (plan §L4, lines 1174-1195) */
export const PersonaSchema = z.object({
	core_identity: z.string(),
	voice_style: z.object({
		name: z.string(),
		nuances: z.array(z.string()),
		good_example: z.string(),
		bad_example: z.string(),
	}),
	honesty_directive: z.string(),
	learned_behaviors: z.array(
		z.object({
			insight: z.string(),
			confidence: z.number().min(0).max(1),
			source_count: z.number().int(),
			first_learned: z.string(),
		}),
	),
	user_preferences: z.record(z.string(), z.unknown()),
	relationship_notes: z.array(z.string()),
	constraints: z.array(z.string()),
	version: z.number().int(),
});

/** Persona type inferred from Zod schema */
export type Persona = z.infer<typeof PersonaSchema>;
