/**
 * FEAT-INTENT-002: GeminiIntentClassifier
 *
 * Implements IntentClassifier (core/types/intent.ts) using a DI-injected
 * LLM client (designed for Gemini Flash structured output).
 *
 * Fallback chain: LLM → keyword matching → default "chat".
 * Circuit breaker protects against cascading LLM failures.
 */

import type { IntentClassifier, ClassificationResult, ClassificationContext } from '@axel/core/types';
import { CircuitBreaker, type CircuitBreakerConfig } from '../common/circuit-breaker.js';

// --- DI interfaces ---

export interface GenerateResult {
  readonly intent: string;
  readonly confidence: number;
  readonly reasoning?: string;
}

export interface IntentLlmClient {
  readonly generateStructured: (
    prompt: string,
    systemPrompt: string,
  ) => Promise<GenerateResult>;
}

export interface IntentClassifierConfig {
  readonly highConfidenceThreshold: number;
  readonly lowConfidenceThreshold: number;
  readonly fallbackIntent: string;
  readonly timeoutMs: number;
}

// --- Constants ---

const DEFAULT_CONFIG: IntentClassifierConfig = {
  highConfidenceThreshold: 0.80,
  lowConfidenceThreshold: 0.50,
  fallbackIntent: 'chat',
  timeoutMs: 3_000,
};

const VALID_INTENTS = new Set([
  'chat',
  'search',
  'tool_use',
  'memory_query',
  'command',
  'creative',
]);

const INTENT_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  search: ['검색', '찾아', 'search', 'find', 'look up', '알려줘'],
  tool_use: ['파일', '실행', '코드', 'file', 'run', 'execute', '읽어'],
  memory_query: ['기억', '지난번', '이전에', 'remember', 'last time', 'before'],
  command: ['/', '설정', 'config', 'setting', '알림'],
  creative: ['써줘', '만들어', 'generate', 'create', 'write', '작성'],
};

const SYSTEM_PROMPT = `You are an intent classifier for Axel, a personal AI assistant.
Classify the user's message into exactly one intent category.

## Intent Categories
- chat: General conversation, greetings, emotional expressions, small talk, opinions
- search: Requests for information lookup, web search, factual queries about external world
- tool_use: Requests involving file operations, code execution, system commands, API calls
- memory_query: Questions about past conversations, "do you remember?", references to previous context
- command: System configuration changes, notification settings, slash commands, Axel behavior control
- creative: Content generation requests — writing, coding, brainstorming, ideation, creative tasks

## Rules
1. Choose PRIMARY intent if multiple seem applicable
2. "command" takes priority if message starts with "/"
3. If unsure, lean toward "chat" (safest default)
4. Confidence should reflect how certain you are (0.0 to 1.0)`;

// --- Implementation ---

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function classifyByKeywords(message: string): ClassificationResult {
  const lower = message.toLowerCase();

  if (lower.startsWith('/')) {
    return { intent: 'command', confidence: 0.6 };
  }

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'command') continue; // slash already handled
    for (const keyword of keywords) {
      if (keyword === '/' && !lower.startsWith('/')) continue;
      if (lower.includes(keyword.toLowerCase())) {
        return { intent: intent as ClassificationResult['intent'], confidence: 0.4 };
      }
    }
  }

  return { intent: 'chat', confidence: 0.3 };
}

export class GeminiIntentClassifier implements IntentClassifier {
  private readonly client: IntentLlmClient;
  private readonly config: IntentClassifierConfig;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    client: IntentLlmClient,
    config?: IntentClassifierConfig,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
  ) {
    this.client = client;
    this.config = config ?? DEFAULT_CONFIG;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 60_000,
      halfOpenMaxProbes: 1,
      ...circuitBreakerConfig,
    });
  }

  readonly classify = async (
    message: string,
    context?: ClassificationContext,
  ): Promise<ClassificationResult> => {
    // Slash command override — highest priority
    if (message.trimStart().startsWith('/')) {
      return { intent: 'command', confidence: 0.95 };
    }

    try {
      const result = await this.circuitBreaker.execute(() =>
        this.client.generateStructured(
          this.buildUserPrompt(message, context),
          SYSTEM_PROMPT,
        ),
      );
      return this.validateResult(result);
    } catch {
      // Fallback to keyword matching
      return classifyByKeywords(message);
    }
  };

  private buildUserPrompt(message: string, context?: ClassificationContext): string {
    let prompt = `Classify this message:\n\n"${message}"`;
    if (context) {
      prompt += `\n\nContext: channel=${context.channelId}`;
    }
    return prompt;
  }

  private validateResult(raw: GenerateResult): ClassificationResult {
    const intent = raw.intent;
    const confidence = clampConfidence(raw.confidence);

    if (!VALID_INTENTS.has(intent)) {
      return { intent: this.config.fallbackIntent as ClassificationResult['intent'], confidence: 0.3 };
    }

    return {
      intent: intent as ClassificationResult['intent'],
      confidence,
    };
  }
}
