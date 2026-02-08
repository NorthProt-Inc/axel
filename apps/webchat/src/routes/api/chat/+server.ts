import type { RequestHandler } from './$types';

/**
 * SSR API proxy for chat.
 * Forwards requests to the Axel Gateway.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://localhost:3000';

	const response = await fetch(`${gatewayUrl}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	return new Response(response.body, {
		status: response.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
