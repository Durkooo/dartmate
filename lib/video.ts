import { FunctionsHttpError } from '@biltme/backend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bilt } from '@/lib/bilt';

export type Facing = 'user' | 'environment';
export type CameraPrefs = { match: Facing; call: Facing };
const CAMERA_PREFS_KEY = 'dartmate:camera-prefs';
const DEFAULT_CAMERA_PREFS: CameraPrefs = { match: 'environment', call: 'user' };
export async function loadCameraPrefs(): Promise<CameraPrefs> {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_PREFS_KEY);
    if (!raw) return DEFAULT_CAMERA_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_CAMERA_PREFS;
    const get = (k: 'match' | 'call', fallback: Facing): Facing => {
      const v = (parsed as Record<string, unknown>)[k];
      return v === 'user' || v === 'environment' ? v : fallback;
    };
    return { match: get('match', 'environment'), call: get('call', 'user') };
  } catch {
    return DEFAULT_CAMERA_PREFS;
  }
}
export async function saveCameraPrefs(prefs: CameraPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(CAMERA_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignoruj — predvoľba sa len neuloží.
  }
}

export type VideoCredentials = { url: string; token: string };

async function invokeForCredentials(
  functionName: string,
  body: Record<string, string>,
  label: string,
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
    // Názov funkcie + parameter v hláške — podľa screenshotu vidno, ktorý endpoint appka volala a s čím.
    throw new Error(`[${functionName} ${label}] ${message}`);
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
  return invokeForCredentials('match-video-token', { matchId }, `mid:${matchId.slice(0, 12)}`);
}

/**
 * Token do súkromnej videomiestnosti dvoch priateľov (chat).
 * Edge funkcia `dm-call-token` overí priateľstvo a vráti token
 * do spoločnej miestnosti dvojice (rovnakej bez ohľadu na to, kto volá).
 */
export function getCallCredentials(peerId: string): Promise<VideoCredentials> {
  return invokeForCredentials('dm-call-token', { peer: peerId }, `peer:${peerId.slice(0, 8)}`);
}
