import { FunctionsHttpError } from '@biltme/backend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bilt } from '@/lib/bilt';

export type Facing = 'user' | 'environment';
export type CameraDevice = { deviceId: string; label: string; facing: Facing };
export type CameraPrefs = {
  match: Facing;
  call: Facing;
  matchDeviceId?: string;
  callDeviceId?: string;
};
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
    const getId = (k: 'matchDeviceId' | 'callDeviceId'): string | undefined => {
      const v = (parsed as Record<string, unknown>)[k];
      return typeof v === 'string' && v ? v : undefined;
    };
    return {
      match: get('match', 'environment'),
      call: get('call', 'user'),
      matchDeviceId: getId('matchDeviceId'),
      callDeviceId: getId('callDeviceId'),
    };
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
/** Všetky kamery v telefóne (po povolení kamery majú aj mená). */
export async function listCameras(): Promise<CameraDevice[]> {
  try {
    const { Room } = await import('livekit-client');
    const getLocal =
      typeof (Room as unknown as Record<string, unknown>).getLocalDevices === 'function'
        ? ((Room as unknown as { getLocalDevices: (kind: string) => Promise<MediaDeviceInfo[]> }).getLocalDevices.bind(Room) as (kind: string) => Promise<MediaDeviceInfo[]>)
        : null;
    const raw: MediaDeviceInfo[] = getLocal
      ? await getLocal('videoinput')
      : typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices
        ? await navigator.mediaDevices.enumerateDevices()
        : [];
    const videos = raw.filter((d) => d.kind === 'videoinput' && d.deviceId);
    let back = 0;
    let front = 0;
    return videos.map((d, i) => {
      const label = (d.label || '').toLowerCase();
      const isFront =
        label.includes('front') || label.includes('facing front') || label.includes('user');
      const isBack =
        label.includes('back') ||
        label.includes('rear') ||
        label.includes('environment') ||
        label.includes('facing back');
      // Bez mien (ešte nebolo povolenie) ber prvú ako zadnú, ostatné striedavo.
      const facing: Facing =
        d.label === '' ? (i === 0 ? 'environment' : i % 2 === 0 ? 'environment' : 'user') : isFront && !isBack ? 'user' : 'environment';
      if (facing === 'environment') back += 1;
      else front += 1;
      const name =
        d.label || (facing === 'environment' ? `Zadná kamera ${back}` : `Predná kamera ${front}`);
      return { deviceId: d.deviceId, label: name, facing };
    });
  } catch {
    return [];
  }
}
/** Voľby pre lokálnu kameru: konkrétne zariadenie, inak len strana. */
export function trackOptions(facing: Facing, deviceId?: string) {
  return deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: facing };
}
/** Rýchle „prebudenie“ kamery v ťuknutí prstom — iOS povolí kameru len z gesta.
 *  Vytvorí a hneď zruší stopu, aby pri pripojení už bolo povolenie dané. */
export async function warmUpCamera(facing: Facing, deviceId?: string): Promise<boolean> {
  try {
    const track = await createPreferredTrack(facing, deviceId);
    track.stop();
    return true;
  } catch {
    return false;
  }
}
/** Android: explicitne vyžiada povolenia systému (iOS/web si povolenie pýta samo
 *  pri zapnutí kamery). Bez tohto kamera na Androide vôbec neštartuje. */
export async function ensureCameraPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return result['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
export async function createPreferredTrack(facing: Facing, deviceId?: string) {
  if (!(await ensureCameraPermissions())) throw new Error('Camera permission denied');
  const { createLocalVideoTrack } = await import('livekit-client');
  const res = { width: 1280, height: 720 };
  if (deviceId) {
    try {
      return await createLocalVideoTrack({ ...trackOptions(facing, deviceId), resolution: res });
    } catch {
      // deviceId už neplatí (napr. web) — skús stranu.
    }
  }
  return createLocalVideoTrack({ facingMode: facing, resolution: res });
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
