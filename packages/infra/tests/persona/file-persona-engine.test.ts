import type { Persona } from '@axel/core/persona';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock fs module ───

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();

vi.mock('node:fs/promises', () => ({
	readFile: (...args: unknown[]) => mockReadFile(...args),
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
	rename: (...args: unknown[]) => mockRename(...args),
}));

// ─── Mock fs.watch ───

const mockWatchClose = vi.fn();
let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;

vi.mock('node:fs', () => ({
	watch: (_path: string, cb: (eventType: string, filename: string | null) => void) => {
		watchCallback = cb;
		return { close: mockWatchClose };
	},
}));

const importModule = async () => import('../../src/persona/file-persona-engine.js');

// ─── Fixtures ───

function makePersona(overrides?: Partial<Persona>): Persona {
	return {
		core_identity: 'I am Axel, an AI assistant.',
		voice_style: {
			name: 'casual-warm',
			nuances: ['friendly', 'concise'],
			good_example: 'Hey, good question!',
			bad_example: 'As an AI language model...',
		},
		honesty_directive: 'Always be honest.',
		learned_behaviors: [],
		user_preferences: {},
		relationship_notes: [],
		constraints: ['Do not reveal API keys.'],
		version: 1,
		...overrides,
	};
}

const TEST_PATH = '/tmp/test-persona.json';

function setupReadFile(persona: Persona): void {
	mockReadFile.mockResolvedValue(JSON.stringify(persona));
}

function setupReadFileError(error: Error): void {
	mockReadFile.mockRejectedValue(error);
}

describe('FilePersonaEngine', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		watchCallback = null;
		mockWriteFile.mockResolvedValue(undefined);
		mockRename.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('load()', () => {
		it('should parse valid JSON and return Persona', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			const result = await engine.load();
			expect(result).toEqual(persona);
			expect(mockReadFile).toHaveBeenCalledWith(TEST_PATH, 'utf-8');
		});

		it('should throw when file does not exist', async () => {
			setupReadFileError(new Error('ENOENT: no such file or directory'));

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await expect(engine.load()).rejects.toThrow('ENOENT');
		});

		it('should throw on invalid JSON (Zod validation failure)', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ core_identity: 123 }));

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await expect(engine.load()).rejects.toThrow();
		});
	});

	describe('reload()', () => {
		it('should reflect updated file data', async () => {
			const original = makePersona({ version: 1 });
			const updated = makePersona({ version: 2, core_identity: 'Updated Axel' });

			setupReadFile(original);
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await engine.load();

			setupReadFile(updated);
			const result = await engine.reload();
			expect(result.version).toBe(2);
			expect(result.core_identity).toBe('Updated Axel');
		});

		it('should keep last-known-good on invalid reload', async () => {
			const original = makePersona({ version: 1 });
			setupReadFile(original);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await engine.load();

			// Next read returns invalid JSON
			mockReadFile.mockResolvedValue('{ invalid json');
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const result = await engine.reload();
			expect(result).toEqual(original);
			expect(warnSpy).toHaveBeenCalled();

			warnSpy.mockRestore();
		});

		it('should throw if no last-known-good exists and reload fails', async () => {
			setupReadFileError(new Error('ENOENT'));

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await expect(engine.reload()).rejects.toThrow('ENOENT');
		});
	});

	describe('getSystemPrompt()', () => {
		it('should return channel-adapted prompt after load', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			const prompt = engine.getSystemPrompt('discord');
			expect(prompt).toContain('# Identity');
			expect(prompt).toContain('I am Axel');
			expect(prompt).toContain('# Channel: discord');
			expect(prompt).toContain('Formality:');
		});

		it('should return different adaptation for different channels', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			const discord = engine.getSystemPrompt('discord');
			const email = engine.getSystemPrompt('email');
			expect(discord).not.toEqual(email);
		});

		it('should throw if persona not loaded', async () => {
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			expect(() => engine.getSystemPrompt('discord')).toThrow('Persona not loaded');
		});
	});

	describe('evolve()', () => {
		it('should add learned_behavior and bump version', async () => {
			const persona = makePersona({ version: 1 });
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			await engine.evolve('User prefers bullet points', 0.7);

			// Verify atomic write was called
			expect(mockWriteFile).toHaveBeenCalledTimes(1);
			expect(mockRename).toHaveBeenCalledTimes(1);

			// Verify written content
			const writtenJson = mockWriteFile.mock.calls[0]![1] as string;
			const written = JSON.parse(writtenJson) as Persona;
			expect(written.version).toBe(2);
			expect(written.learned_behaviors).toHaveLength(1);
			expect(written.learned_behaviors[0]!.insight).toBe('User prefers bullet points');
			expect(written.learned_behaviors[0]!.confidence).toBe(0.7);
		});

		it('should use atomic write (tmp → rename)', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			await engine.evolve('test', 0.5);

			expect(mockWriteFile).toHaveBeenCalledWith(`${TEST_PATH}.tmp`, expect.any(String), 'utf-8');
			expect(mockRename).toHaveBeenCalledWith(`${TEST_PATH}.tmp`, TEST_PATH);
		});

		it('should throw if persona not loaded', async () => {
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await expect(engine.evolve('test', 0.5)).rejects.toThrow('Persona not loaded');
		});
	});

	describe('updatePreference()', () => {
		it('should update preference and bump version', async () => {
			const persona = makePersona({ version: 3, user_preferences: { lang: 'en' } });
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			await engine.updatePreference('theme', 'dark');

			const writtenJson = mockWriteFile.mock.calls[0]![1] as string;
			const written = JSON.parse(writtenJson) as Persona;
			expect(written.version).toBe(4);
			expect(written.user_preferences).toEqual({ lang: 'en', theme: 'dark' });
		});

		it('should overwrite existing preference', async () => {
			const persona = makePersona({ version: 1, user_preferences: { lang: 'en' } });
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			await engine.updatePreference('lang', 'ko');

			const writtenJson = mockWriteFile.mock.calls[0]![1] as string;
			const written = JSON.parse(writtenJson) as Persona;
			expect(written.user_preferences).toEqual({ lang: 'ko' });
		});

		it('should throw if persona not loaded', async () => {
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			await expect(engine.updatePreference('k', 'v')).rejects.toThrow('Persona not loaded');
		});
	});

	describe('start() / stop()', () => {
		it('should start fs.watch when hotReload is true', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: true });
			await engine.load();

			engine.start();
			expect(watchCallback).not.toBeNull();

			engine.stop();
			expect(mockWatchClose).toHaveBeenCalled();
		});

		it('should not start watcher when hotReload is false', async () => {
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			engine.start();
			expect(watchCallback).toBeNull();
		});

		it('should debounce reload on file change', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({
				personaPath: TEST_PATH,
				hotReload: true,
				debounceMs: 100,
			});
			await engine.load();
			engine.start();

			// Simulate rapid file changes
			watchCallback!('change', 'dynamic_persona.json');
			watchCallback!('change', 'dynamic_persona.json');
			watchCallback!('change', 'dynamic_persona.json');

			// readFile called once for initial load
			expect(mockReadFile).toHaveBeenCalledTimes(1);

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(150);

			// Should only reload once (debounced)
			expect(mockReadFile).toHaveBeenCalledTimes(2);

			engine.stop();
		});

		it('should not start duplicate watcher', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: true });
			await engine.load();

			engine.start();
			engine.start(); // second call should be no-op

			engine.stop();
			// close should only be called once
			expect(mockWatchClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when file is accessible', async () => {
			const persona = makePersona();
			setupReadFile(persona);

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });
			await engine.load();

			const health = await engine.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.message).toContain('last loaded');
			expect(health.latencyMs).toBeTypeOf('number');
		});

		it('should return unhealthy when file is inaccessible', async () => {
			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			setupReadFileError(new Error('ENOENT: no such file'));

			const health = await engine.healthCheck();
			expect(health.state).toBe('unhealthy');
			expect(health.message).toContain('ENOENT');
		});

		it('should report "not yet loaded" if file accessible but load not called', async () => {
			setupReadFile(makePersona());

			const { FilePersonaEngine } = await importModule();
			const engine = new FilePersonaEngine({ personaPath: TEST_PATH, hotReload: false });

			const health = await engine.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.message).toContain('not yet loaded');
		});
	});
});
