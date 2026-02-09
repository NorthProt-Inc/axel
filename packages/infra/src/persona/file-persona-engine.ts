import { type FSWatcher, watch } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { PersonaSchema, buildSystemPrompt } from '@axel/core/persona';
import type { Persona, PersonaEngine } from '@axel/core/persona';
import type { ComponentHealth } from '@axel/core/types';

export interface FilePersonaEngineConfig {
	readonly personaPath: string;
	readonly hotReload: boolean;
	readonly debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * File-based PersonaEngine implementation (ADR-013 §L4).
 *
 * Reads persona from a JSON file, validates with Zod,
 * supports hot-reload via fs.watch, and atomic writes for evolve/updatePreference.
 */
class FilePersonaEngine implements PersonaEngine {
	private readonly personaPath: string;
	private readonly hotReload: boolean;
	private readonly debounceMs: number;

	private persona: Persona | null = null;
	private lastLoadedAt: Date | null = null;
	private watcher: FSWatcher | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: FilePersonaEngineConfig) {
		this.personaPath = config.personaPath;
		this.hotReload = config.hotReload;
		this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	}

	async load(): Promise<Persona> {
		const raw = await readFile(this.personaPath, 'utf-8');
		const parsed = PersonaSchema.parse(JSON.parse(raw));
		this.persona = parsed;
		this.lastLoadedAt = new Date();
		return parsed;
	}

	async reload(): Promise<Persona> {
		try {
			return await this.load();
		} catch (error: unknown) {
			if (this.persona) {
				console.warn(
					'[FilePersonaEngine] reload failed, keeping last-known-good persona:',
					error instanceof Error ? error.message : error,
				);
				return this.persona;
			}
			throw error;
		}
	}

	getSystemPrompt(channel: string): string {
		if (!this.persona) {
			throw new Error('Persona not loaded. Call load() first.');
		}
		return buildSystemPrompt(this.persona, channel);
	}

	async evolve(insight: string, confidence: number): Promise<void> {
		if (!this.persona) {
			throw new Error('Persona not loaded. Call load() first.');
		}

		const updated: Persona = {
			...this.persona,
			learned_behaviors: [
				...this.persona.learned_behaviors,
				{
					insight,
					confidence,
					source_count: 1,
					first_learned: new Date().toISOString(),
				},
			],
			version: this.persona.version + 1,
		};

		await this.atomicWrite(updated);
		this.persona = updated;
	}

	async updatePreference(key: string, value: unknown): Promise<void> {
		if (!this.persona) {
			throw new Error('Persona not loaded. Call load() first.');
		}

		const updated: Persona = {
			...this.persona,
			user_preferences: {
				...this.persona.user_preferences,
				[key]: value,
			},
			version: this.persona.version + 1,
		};

		await this.atomicWrite(updated);
		this.persona = updated;
	}

	start(): void {
		if (!this.hotReload) return;
		if (this.watcher) return;

		this.watcher = watch(this.personaPath, (_eventType) => {
			this.scheduleReload();
		});
	}

	stop(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await readFile(this.personaPath, 'utf-8');
			return {
				state: 'healthy',
				latencyMs: Date.now() - start,
				message: this.lastLoadedAt
					? `last loaded: ${this.lastLoadedAt.toISOString()}`
					: 'file accessible, not yet loaded',
				lastChecked: new Date(),
			};
		} catch (error: unknown) {
			return {
				state: 'unhealthy',
				latencyMs: Date.now() - start,
				message: error instanceof Error ? error.message : 'Unknown error',
				lastChecked: new Date(),
			};
		}
	}

	private scheduleReload(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.reload();
		}, this.debounceMs);
	}

	private async atomicWrite(persona: Persona): Promise<void> {
		const tmpPath = `${this.personaPath}.tmp`;
		await writeFile(tmpPath, JSON.stringify(persona, null, '\t'), 'utf-8');
		await rename(tmpPath, this.personaPath);
	}
}

export { FilePersonaEngine };
