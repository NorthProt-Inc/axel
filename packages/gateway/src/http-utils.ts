import * as crypto from 'node:crypto';
import type * as http from 'node:http';

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

export function sendError(
	res: http.ServerResponse,
	status: number,
	message: string,
	requestId: string,
): void {
	sendJson(res, status, { error: message, requestId });
}

export function generateRequestId(): string {
	return `req_${crypto.randomBytes(8).toString('hex')}`;
}

export function parseChatInput(body: string): { content: string; channelId: string } | null {
	const parsed = parseJsonBody(body);
	if (!parsed) return null;
	const { content, channelId } = parsed;
	if (typeof content !== 'string' || content.length === 0) return null;
	if (typeof channelId !== 'string' || channelId.length === 0) return null;
	return { content, channelId };
}

export function parseJsonBody(body: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(body);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
