import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Tables } from '@biltme/backend';
import { bilt } from '@/lib/bilt';
import { feedback } from '@/lib/darts';
import { playerError, usePlayers } from '@/lib/players';

export type OnlineMatch = Tables<'online_matches'>;
export type OnlineTurn = Tables<'online_turns'>;
export type DirectMessage = Tables<'direct_messages'>;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function opponentName(match: OnlineMatch, userId: string) {
  return match.host_id === userId ? match.guest_nickname : match.host_nickname;
}
export function opponentId(match: OnlineMatch, userId: string) {
  return match.host_id === userId ? match.guest_id : match.host_id;
}
export function timeLabel(date: string) {
  return new Date(date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
export function appIsActive() {
  return (
    AppState.currentState === 'active' &&
    (Platform.OS !== 'web' || document.visibilityState !== 'hidden')
  );
}
/** Systémové správy videohovorov (`📹call:{timestamp}`) — číslo sa nikde nezobrazuje. */
export const CALL_PREFIX = '📹call:';
export function isCallMessage(body: string | null | undefined): boolean {
  return !!body && body.startsWith(CALL_PREFIX);
}
const READ_CHATS_KEY = 'dartmate:read-chats';
/** peerId → ISO čas poslednej prečítanej správy (zapíše sa pri otvorení konverzácie). */
export async function loadReadChats(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_CHATS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
export async function markChatRead(peerId: string, at?: string): Promise<void> {
  try {
    const map = await loadReadChats();
    const stamp = at ?? new Date().toISOString();
    if ((map[peerId] ?? '') >= stamp) return;
    map[peerId] = stamp;
    await AsyncStorage.setItem(READ_CHATS_KEY, JSON.stringify(map));
  } catch {
    // Ignoruj — neprečítanosť sa len nezapamätá.
  }
}
/** Neprečítaná = posledná správa je od priateľa a je novšia než posledné čítanie. */
export function hasUnread(
  contact: { user_id?: string | null; last_sender_id?: string | null; last_message_at?: string | null },
  myId: string,
  read: Record<string, string>,
): boolean {
  if (!contact.last_message_at || contact.last_sender_id === myId) return false;
  return (read[contact.user_id ?? ''] ?? '') < contact.last_message_at;
}
/** peerId → čas, kedy som sa naposledy pripojil k hovoru s daným priateľom. */
const JOINED_CALLS_KEY = 'dartmate:joined-calls';
export async function loadJoinedCalls(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(JOINED_CALLS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
export async function markCallJoined(peerId: string): Promise<void> {
  try {
    const map = await loadJoinedCalls();
    map[peerId] = Date.now();
    await AsyncStorage.setItem(JOINED_CALLS_KEY, JSON.stringify(map));
  } catch {
    // Ignoruj — zmeškanosť sa len nezapamätá.
  }
}
export async function loadContacts() {
  const { data, error } = await bilt.rpc('list_social_contacts');
  if (error) throw new Error(error.message);
  return (data ?? []).filter((c: any) => c.user_id && c.nickname);
}
export type SocialContact = Awaited<ReturnType<typeof loadContacts>>[number] & {
  /** Práve hrá online zápas (dopočíta backend; kým chýba, berie sa ako nehrá). */
  in_match?: boolean | null;
};
export async function loadOpenMatches() {
  const { data, error } = await bilt
    .from('online_matches')
    .select('*')
    .in('status', ['invited', 'active'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function inviteMatch(peer: string, starting: number, doubleOut: boolean, legsToWin = 1) {
  const { data, error } = await bilt.rpc('invite_online_match', {
    peer,
    starting_score: starting,
    use_double_out: doubleOut,
    legs_to_win: Math.min(9, Math.max(1, Math.floor(legsToWin))),
  });
  if (error) throw new Error(error.message);
  if (!data?.[0])
    throw new Error('Pozvánku nemožno odoslať. Skontroluj priateľa a nastavenie nicku.');
  return data[0];
}
/** Vráti posledné kolo (posledné dva ťahy, príp. jeden) — body sa vrátia obom hráčom, vráti aj uzavretý leg. */
export async function undoOnlineTurn(mid: string) {
  const { data, error } = await bilt.rpc('undo_online_turn', { mid });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('Ťah sa nepodarilo vrátiť (možno niet čo vrátiť).');
  return data[0];
}
export async function respondMatch(
  mid: string,
  decision: 'accept' | 'decline' | 'cancel' | 'abandon',
) {
  const { data, error } = await bilt.rpc('respond_online_match', { mid, decision });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('Stav zápasu sa zmenil. Obnov zápas a skús znova.');
  return data[0];
}
export async function loadMatch(id: string) {
  if (!uuidPattern.test(id)) return null;
  const { data: match, error } = await bilt
    .from('online_matches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) return null;
  // A turn may be written between these reads. Only show the same confirmed version.
  const turns: OnlineTurn[] = [];
  let before = match.turn_count + 1;
  while (before > 1) {
    const { data: page, error: turnError } = await bilt
      .from('online_turns')
      .select('*')
      .eq('match_id', id)
      .lt('turn_number', before)
      .order('turn_number', { ascending: false })
      .limit(200);
    if (turnError) throw new Error(turnError.message);
    if (!page?.length) break;
    turns.push(...page);
    before = page[page.length - 1].turn_number;
    if (page.length < 200) break;
  }
  const contacts = await loadContacts();
  return { match, turns, contacts };
}
export async function loadStatistics() {
  const { data, error } = await bilt.rpc('my_online_statistics');
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}
export type OnlineStatistics = Awaited<ReturnType<typeof loadStatistics>>;

/** Pull-only updates, scoped to the focused screen and current account. */
export function useOnlineQuery<T>(key: string | null, loader: () => Promise<T>, interval = 3500) {
  const [snapshot, setSnapshot] = useState<{
    key: string | null;
    data: T | null;
    error: string;
    syncedAt: number;
  }>({ key: null, data: null, error: '', syncedAt: 0 });
  const generation = useRef(0);
  const focused = useRef(false);
  const flight = useRef<Promise<void> | null>(null);
  const lastError = useRef('');
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);
  const refresh = useCallback(async () => {
    if (!key || !focused.current || !appIsActive()) return;
    const gen = generation.current;
    const load = loaderRef.current;
    if (flight.current) {
      await flight.current;
      if (flight.current) {
        await flight.current;
        return;
      }
    }
    if (!focused.current || gen !== generation.current) return;
    const run = async () => {
      try {
        const data = await load();
        if (gen !== generation.current || !focused.current) return;
        lastError.current = '';
        setSnapshot({ key, data, error: '', syncedAt: Date.now() });
      } catch (error) {
        if (gen !== generation.current || !focused.current) return;
        const message = playerError({
          message: error instanceof Error ? error.message : 'Pripojenie zlyhalo.',
        });
        if (lastError.current !== message) feedback.error();
        lastError.current = message;
        setSnapshot((s) => {
          return {
            key,
            data: s.key === key ? s.data : null,
            syncedAt: s.key === key ? s.syncedAt : 0,
            error: message,
          };
        });
      }
    };
    const pending = run();
    flight.current = pending;
    await pending;
    if (flight.current === pending) flight.current = null;
  }, [key]);
  useFocusEffect(
    useCallback(() => {
      generation.current += 1;
      focused.current = true;
      void refresh();
      const timer = setInterval(() => {
        if (!flight.current) void refresh();
      }, interval);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      const onVisible = () => {
        if (appIsActive()) void refresh();
      };
      if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
      return () => {
        focused.current = false;
        generation.current += 1;
        clearInterval(timer);
        sub.remove();
        if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
      };
    }, [refresh, interval]),
  );
  const current = snapshot.key === key;
  return {
    data: current ? snapshot.data : null,
    error: current ? snapshot.error : '',
    syncedAt: current ? snapshot.syncedAt : 0,
    loading: !!key && (!current || (!snapshot.syncedAt && !snapshot.error)),
    refresh,
  };
}

export function useOnlinePresence() {
  const userId = usePlayers((s) => s.session?.user.id);
  useEffect(() => {
    if (!userId) return undefined;
    let stopped = false;
    const heartbeat = async (active: boolean) => {
      if (usePlayers.getState().session?.user.id !== userId) return;
      try {
        const { error } = await bilt.rpc('touch_presence', { active });
        if (error && !stopped) console.warn('Presence update:', error.message);
      } catch (error) {
        if (!stopped)
          console.warn(
            'Presence update:',
            error instanceof Error ? error.message : 'Connection failed',
          );
      }
    };
    void heartbeat(appIsActive());
    const timer = setInterval(() => {
      if (appIsActive()) void heartbeat(true);
    }, 20000);
    const changed = () => void heartbeat(appIsActive());
    const sub = AppState.addEventListener('change', changed);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', changed);
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', changed);
      void heartbeat(false);
    };
  }, [userId]);
}
