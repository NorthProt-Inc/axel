import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Client } from 'pg';

const SUMMARY_PROMPT = `다음은 AI 에이전트(Axel)와 사용자(Mark) 간의 대화 메시지입니다.
이 세션의 핵심 내용을 3-5문장으로 요약해주세요.
주요 논의 주제, 결정 사항, 중요한 정보를 포함하세요.
JSON 형식으로 반환: {"summary": "...", "emotional_tone": "..."}
emotional_tone은 다음 중 하나: positive, negative, neutral, mixed
반드시 유효한 JSON만 반환하세요. markdown fence 없이.`;

const MERGE_PROMPT = `다음은 하나의 긴 대화 세션에서 시간순으로 추출된 구간 요약들입니다.
이 구간 요약들을 종합하여 전체 세션의 핵심 요약을 3-5문장으로 작성해주세요.
JSON 형식으로 반환: {"summary": "...", "emotional_tone": "..."}
emotional_tone은 다음 중 하나: positive, negative, neutral, mixed
반드시 유효한 JSON만 반환하세요. markdown fence 없이.`;

/** Max messages per chunk for 2-pass summarization */
const CHUNK_SIZE = 100;

/** Max messages to load per session for single-pass */
const SINGLE_PASS_LIMIT = 200;

interface SessionRow {
	readonly session_id: string;
	readonly started_at: string;
}

interface MessageRow {
	readonly role: string;
	readonly content: string;
	readonly timestamp: string;
}

interface SummaryResponse {
	readonly summary: string;
	readonly emotional_tone: string;
}

export interface AiBackfillResult {
	readonly sessionsSummarized: number;
	readonly sessionSummariesInserted: number;
}

function getGeminiClient(): GoogleGenerativeAI {
	const apiKey = process.env['AXEL_GOOGLE_API_KEY'];
	if (!apiKey) {
		throw new Error('AXEL_GOOGLE_API_KEY environment variable is required for AI backfill');
	}
	return new GoogleGenerativeAI(apiKey);
}

function getModelName(): string {
	return process.env['AXEL_GOOGLE_FLASH_MODEL'] ?? 'gemini-3-flash-preview';
}

function formatMessages(messages: readonly MessageRow[]): string {
	return messages.map((m) => `[${m.role}] ${m.content}`).join('\n');
}

function parseSummaryResponse(text: string): SummaryResponse {
	const cleaned = text
		.replace(/```json\n?/g, '')
		.replace(/```\n?/g, '')
		.trim();
	const parsed = JSON.parse(cleaned) as Record<string, unknown>;

	const summary = typeof parsed['summary'] === 'string' ? parsed['summary'] : '';
	const tone =
		typeof parsed['emotional_tone'] === 'string' ? parsed['emotional_tone'] : 'neutral';
	const validTones = ['positive', 'negative', 'neutral', 'mixed'];

	return {
		summary,
		emotional_tone: validTones.includes(tone) ? tone : 'neutral',
	};
}

async function generateSummary(
	geminiClient: GoogleGenerativeAI,
	modelName: string,
	systemPrompt: string,
	content: string,
): Promise<SummaryResponse> {
	const model = geminiClient.getGenerativeModel({ model: modelName });
	const result = await model.generateContent({
		contents: [{ role: 'user', parts: [{ text: content }] }],
		systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
	});

	const text = result.response.text();
	return parseSummaryResponse(text);
}

async function summarizeLargeSession(
	gemini: GoogleGenerativeAI,
	modelName: string,
	dbClient: Client,
	sessionId: string,
): Promise<SummaryResponse> {
	// Load all messages for this session
	const allMsgs = await dbClient.query<MessageRow>(
		`SELECT role, content, "timestamp"::text FROM messages
		 WHERE session_id = $1
		 ORDER BY "timestamp" ASC`,
		[sessionId],
	);

	const messages = allMsgs.rows;
	if (messages.length === 0) {
		return { summary: 'No messages in session.', emotional_tone: 'neutral' };
	}

	// If small enough, single pass
	if (messages.length <= SINGLE_PASS_LIMIT) {
		return generateSummary(gemini, modelName, SUMMARY_PROMPT, formatMessages(messages));
	}

	// 2-pass: chunk → summarize each → merge
	const chunks: MessageRow[][] = [];
	for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
		chunks.push(messages.slice(i, i + CHUNK_SIZE));
	}

	console.error(
		`  Session has ${messages.length} messages, using 2-pass (${chunks.length} chunks)`,
	);

	const chunkSummaries: string[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i]!;
		console.error(
			`  Summarizing chunk ${i + 1}/${chunks.length} (${chunk.length} messages)...`,
		);
		const result = await generateSummary(
			gemini,
			modelName,
			SUMMARY_PROMPT,
			formatMessages(chunk),
		);
		chunkSummaries.push(`[구간 ${i + 1}] ${result.summary}`);
	}

	// Merge pass
	console.error('  Merging chunk summaries...');
	return generateSummary(gemini, modelName, MERGE_PROMPT, chunkSummaries.join('\n\n'));
}

async function summarizeSmallSession(
	gemini: GoogleGenerativeAI,
	modelName: string,
	dbClient: Client,
	sessionId: string,
): Promise<SummaryResponse> {
	const msgs = await dbClient.query<MessageRow>(
		`SELECT role, content, "timestamp"::text FROM messages
		 WHERE session_id = $1
		 ORDER BY "timestamp" DESC
		 LIMIT $2`,
		[sessionId, SINGLE_PASS_LIMIT],
	);

	// Reverse to chronological order
	const messages = msgs.rows.reverse();
	if (messages.length === 0) {
		return { summary: 'No messages in session.', emotional_tone: 'neutral' };
	}

	return generateSummary(gemini, modelName, SUMMARY_PROMPT, formatMessages(messages));
}

export async function backfillAiDryRun(client: Client): Promise<AiBackfillResult> {
	// Count sessions needing summaries
	const sessRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM sessions WHERE summary IS NULL`,
	);
	const sessCount = Number.parseInt(sessRes.rows[0]?.cnt ?? '0', 10);

	// Count existing session_summaries
	const sumRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM session_summaries`,
	);
	const existingCount = Number.parseInt(sumRes.rows[0]?.cnt ?? '0', 10);

	return {
		sessionsSummarized: sessCount,
		sessionSummariesInserted: sessCount - existingCount,
	};
}

export async function backfillAi(client: Client): Promise<AiBackfillResult> {
	const gemini = getGeminiClient();
	const modelName = getModelName();

	// Find sessions needing summaries
	const sessions = await client.query<SessionRow>(
		`SELECT session_id, started_at::text
		 FROM sessions
		 WHERE summary IS NULL
		 ORDER BY started_at ASC`,
	);

	if (sessions.rows.length === 0) {
		console.error('  No sessions need AI summarization.');
		return { sessionsSummarized: 0, sessionSummariesInserted: 0 };
	}

	// Get message counts per session
	const msgCounts = await client.query<{ session_id: string; cnt: string }>(
		`SELECT session_id, COUNT(*)::text AS cnt
		 FROM messages
		 WHERE session_id = ANY($1)
		 GROUP BY session_id`,
		[sessions.rows.map((s) => s.session_id)],
	);
	const countMap = new Map(
		msgCounts.rows.map((r) => [r.session_id, Number.parseInt(r.cnt, 10)]),
	);

	let summarized = 0;
	let inserted = 0;

	for (const session of sessions.rows) {
		const msgCount = countMap.get(session.session_id) ?? 0;
		console.error(
			`\n  Processing session ${session.session_id.slice(0, 8)}... (${msgCount} messages)`,
		);

		const result =
			msgCount > SINGLE_PASS_LIMIT
				? await summarizeLargeSession(gemini, modelName, client, session.session_id)
				: await summarizeSmallSession(gemini, modelName, client, session.session_id);

		// Update sessions table
		await client.query(
			`UPDATE sessions SET summary = $1, emotional_tone = $2 WHERE session_id = $3`,
			[result.summary, result.emotional_tone, session.session_id],
		);
		summarized++;

		// Insert into session_summaries
		const existing = await client.query<{ cnt: string }>(
			`SELECT COUNT(*)::text AS cnt FROM session_summaries WHERE session_id = $1`,
			[session.session_id],
		);
		if (Number.parseInt(existing.rows[0]?.cnt ?? '0', 10) === 0) {
			await client.query(
				`INSERT INTO session_summaries (session_id, summary)
				 VALUES ($1, $2)`,
				[session.session_id, result.summary],
			);
			inserted++;
		}

		console.error(`  Summary: ${result.summary.slice(0, 100)}...`);
		console.error(`  Tone: ${result.emotional_tone}`);
	}

	return {
		sessionsSummarized: summarized,
		sessionSummariesInserted: inserted,
	};
}
