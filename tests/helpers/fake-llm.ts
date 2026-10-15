import { createServer } from 'node:http';
import { once } from 'node:events';

export interface LlmRequest {
  readonly authorization: string;
  readonly body: Readonly<Record<string, unknown>>;
}
export interface LlmReply {
  readonly status?: number;
  /** Assistant message content of a normal chat completion. */
  readonly content?: string;
  /** Verbatim response body instead of a chat completion. */
  readonly raw?: string;
  /** usage.total_tokens; null omits the usage object. Default 50. */
  readonly tokens?: number | null;
  /** Drop the connection without an answer (a network failure for the client). */
  readonly drop?: boolean;
}
export interface FakeLlm {
  readonly url: string;
  readonly requests: readonly LlmRequest[];
  close(): Promise<void>;
}

/** Loopback OpenAI-compatible chat server; the handler decides every reply. */
export async function startFakeLlm(
  handler: (request: LlmRequest, count: number) => LlmReply,
): Promise<FakeLlm> {
  const requests: LlmRequest[] = [];
  const server = createServer((incoming, response) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const body =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? Object.fromEntries(Object.entries(parsed))
          : {};
      const request = { authorization: incoming.headers.authorization ?? '', body };
      requests.push(request);
      const reply = handler(request, requests.length);
      if (reply.drop === true) {
        incoming.socket.destroy();
        return;
      }
      response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
      if (reply.raw !== undefined) {
        response.end(reply.raw);
        return;
      }
      const tokens = reply.tokens === undefined ? 50 : reply.tokens;
      response.end(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: reply.content ?? '' },
              finish_reason: 'stop',
            },
          ],
          ...(tokens === null ? {} : { usage: { total_tokens: tokens } }),
        }),
      );
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake llm address');
  return {
    url: `http://127.0.0.1:${String(address.port)}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
