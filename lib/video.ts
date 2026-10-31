import { FunctionsHttpError } from '@biltme/backend';
import { bilt } from '@/lib/bilt';

export type VideoCredentials = { url: string; token: string };
export async function getVideoCredentials(matchId: string): Promise<VideoCredentials> {
  const { data, error } = await bilt.functions.invoke('match-video-token', { body: { matchId } });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const body: unknown = await error.context.json();
        if (
          body &&
          typeof body === 'object' &&
          'message' in body &&
          typeof body.message === 'string'
        )
          message = body.message;
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
