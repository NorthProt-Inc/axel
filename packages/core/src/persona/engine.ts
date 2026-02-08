import { CHANNEL_ADAPTATIONS } from './channel-adaptations.js';
import type { Persona } from './schema.js';

/** Minimum confidence for a learned behavior to appear in system prompt */
const MIN_BEHAVIOR_CONFIDENCE = 0.5;

/**
 * PersonaEngine interface — DI contract for persona management.
 *
 * Concrete implementation (file I/O, fs.watch, hot-reload) lives in packages/infra.
 * Core defines the contract and pure logic (buildSystemPrompt).
 */
export interface PersonaEngine {
	/** Load persona from storage */
	load(): Promise<Persona>;

	/** Hot-reload persona from storage (debounced, validates with Zod) */
	reload(): Promise<Persona>;

	/** Get channel-adapted system prompt */
	getSystemPrompt(channel: string): string;

	/** Add a learned behavior insight */
	evolve(insight: string, confidence: number): Promise<void>;

	/** Update a user preference */
	updatePreference(key: string, value: unknown): Promise<void>;
}

/**
 * Build a system prompt from persona data and channel context.
 *
 * Pure function — no I/O. Assembles persona fields into a structured
 * prompt string with channel-specific adaptation hints.
 *
 * @param persona - Parsed persona data
 * @param channel - Target channel identifier
 * @returns Formatted system prompt string
 */
export function buildSystemPrompt(persona: Persona, channel: string): string {
	const adaptation = CHANNEL_ADAPTATIONS[channel];

	const sections: string[] = [];

	// Core identity
	sections.push(`# Identity\n${persona.core_identity}`);

	// Voice style
	sections.push(
		`# Voice Style: ${persona.voice_style.name}\n` +
			`Nuances: ${persona.voice_style.nuances.join(', ')}\n` +
			`Good: ${persona.voice_style.good_example}\n` +
			`Bad: ${persona.voice_style.bad_example}`,
	);

	// Honesty directive
	sections.push(`# Honesty\n${persona.honesty_directive}`);

	// Constraints
	if (persona.constraints.length > 0) {
		sections.push(`# Constraints\n${persona.constraints.map((c) => `- ${c}`).join('\n')}`);
	}

	// Learned behaviors (only high-confidence)
	const highConfBehaviors = persona.learned_behaviors.filter(
		(b) => b.confidence >= MIN_BEHAVIOR_CONFIDENCE,
	);
	if (highConfBehaviors.length > 0) {
		sections.push(
			`# Learned Behaviors\n${highConfBehaviors.map((b) => `- ${b.insight} (confidence: ${b.confidence})`).join('\n')}`,
		);
	}

	// Relationship notes
	if (persona.relationship_notes.length > 0) {
		sections.push(`# Relationship\n${persona.relationship_notes.map((n) => `- ${n}`).join('\n')}`);
	}

	// Channel adaptation
	if (adaptation) {
		sections.push(
			`# Channel: ${channel}\nFormality: ${adaptation.formality}, Verbosity: ${adaptation.verbosity}`,
		);
	} else {
		sections.push(`# Channel: ${channel}\nNo specific adaptation configured.`);
	}

	return sections.join('\n\n');
}
