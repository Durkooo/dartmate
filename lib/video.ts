import { FunctionsHttpError } from '@biltme/backend';
import { bilt } from '@/lib/bilt';

export type VideoCredentials = { url: string; token: string };

async function invokeForCredentials(
  functionName: string,
  body: Record<string, string>,
): Promise<VideoCredentials> {
  const { data, error } = await bilt.functions.invoke(functionName, { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed: unknown = await error.context.json();
        if (
          parsed &&
          typeof parsed === 'object' &&
          'message' in parsed &&
          typeof parsed.message === 'string'
        )
          message = parsed.message;
      } catch {
        /* Keep the SDK error when the response body cannot be read. */
      }
    }
    throw new Error(message);
  }
  const result: unknown = data;
  if (
    !result ||
    typeof result !== 'object' ||
    !('url' in result) ||
    !('token' in result) ||
    typeof result.url !== 'string' ||
    typeof result.token !== 'string'
  )
    throw new Error('Videohovor sa nepodarilo pripojiť.');
  return { url: result.url, token: result.token };
}

/** Token do videomiestnosti online zápasu (overuje účasť v zápase). */
export function getVideoCredentials(matchId: string): Promise<VideoCredentials> {
  return invokeForCredentials('match-video-token', { matchId });
}

/**
 * Token do súkromnej videomiestnosti dvoch priateľov (chat).
 * Edge funkcia `dm-call-token` overí priateľstvo a vráti token
 * do spoločnej miestnosti dvojice (rovnakej bez ohľadu na to, kto volá).
 */
export function getCallCredentials(peerId: string): Promise<VideoCredentials> {
  return invokeForCredentials('dm-call-token', { peer: peerId });
}
