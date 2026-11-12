import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Tables, Database } from '@biltme/backend';
import { bilt } from '@/lib/bilt';
import { feedback, isMatchExpired } from '@/lib/darts';
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
/** Štatistiky jedného hráča v dohranom online zápase (rátajú aj pokazené hody). */
export type MatchPlayerStats = {
  tons80: number;
  tons100: number;
  tons140: number;
  tons170: number;
  count180: number;
  /** Priemer na 3 šípky za celý zápas, null = žiadne hody. */
  avg3: number | null;
  /** Priemer prvých 9 šípok každého legu dokopy, null = žiadne hody. */
  avg9: number | null;
  /** Najrýchlejší vyhraný leg v šípkach, null = žiadny vyhraný leg. */
  bestLeg: number | null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
export function computeMatchStats(turns: OnlineTurn[], playerId: string): MatchPlayerStats {
  const mine = turns.filter((t) => t.player_id === playerId);
  const tons80 = mine.filter((t) => t.score >= 80).length;
  const tons100 = mine.filter((t) => t.score >= 100).length;
  const tons140 = mine.filter((t) => t.score >= 140).length;
  const tons170 = mine.filter((t) => t.score >= 170).length;
  const count180 = mine.filter((t) => t.score === 180).length;
  const totalScore = mine.reduce((s, t) => s + t.score, 0);
  const totalDarts = mine.reduce((s, t) => s + t.darts, 0);
  const avg3 = totalDarts > 0 ? round1((totalScore / totalDarts) * 3) : null;
  // Prvých 9 šípok každého legu: prechodný hod sa započíta pomerne.
  let winScore = 0;
  let winDarts = 0;
  const legs = new Map<number, OnlineTurn[]>();
  for (const t of mine) {
    const list = legs.get(t.leg_number) ?? [];
    list.push(t);
    legs.set(t.leg_number, list);
  }
  for (const list of legs.values()) {
    const ordered = [...list].sort((a, b) => a.turn_number - b.turn_number);
    let used = 0;
    for (const t of ordered) {
      if (used >= 9 || !t.darts) continue;
      const take = Math.min(t.darts, 9 - used);
      winScore += (t.score * take) / t.darts;
      winDarts += take;
      used += take;
    }
  }
  const avg9 = winDarts > 0 ? round1((winScore / winDarts) * 3) : null;
  // Víťaz legu = hráč záverečného hodu (presná nula, nie bust).
  const byLeg = new Map<number, OnlineTurn[]>();
  for (const t of turns) {
    const list = byLeg.get(t.leg_number) ?? [];
    list.push(t);
    byLeg.set(t.leg_number, list);
  }
  let bestLeg: number | null = null;
  for (const list of byLeg.values()) {
    const ordered = [...list].sort((a, b) => a.turn_number - b.turn_number);
    const last = ordered[ordered.length - 1];
    if (!last || last.bust || last.remaining !== 0 || last.player_id !== playerId) continue;
    const darts = list.filter((t) => t.player_id === playerId).reduce((s, t) => s + t.darts, 0);
    if (darts > 0 && (bestLeg === null || darts < bestLeg)) bestLeg = darts;
  }
  return { tons80, tons100, tons140, tons170, count180, avg3, avg9, bestLeg };
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
/** Ako dlho sa prichádzajúca pozvánka tvári ako „volajúci čaká“ (potom je zmeškaná). */
export const CALL_WAIT_MS = 3 * 60 * 1000;
export type IncomingCallState = 'waiting' | 'missed' | 'handled';
/** Stav prichádzajúcej pozvánky: čaká / zmeškaná / vybavená (pripojená či odmietnutá). */
export function incomingCallState(
  createdAt: string | number,
  joinedAt: number,
  now: number = Date.now(),
): IncomingCallState {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 'handled';
  if (joinedAt > t) return 'handled';
  return now - t <= CALL_WAIT_MS ? 'waiting' : 'missed';
}
const READ_CHATS_KEY = 'dartmate:read-chats';
/** peerId → ISO čas poslednej prečítanej správy (zapíše sa pri otvorení konverzácie). */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function loadReadChats(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_CHATS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === 'string') out[key] = value;
    return out;
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
  contact: {
    user_id?: string | null;
    last_sender_id?: string | null;
    last_message_at?: string | null;
  },
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
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === 'number') out[key] = value;
    return out;
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
export async function loadContacts(): Promise<SocialContactRow[]> {
  const { data, error } = await bilt.rpc('list_social_contacts');
  if (error) throw new Error(error.message);
  const raw: unknown = data;
  const rows = Array.isArray(raw) ? raw.filter(isContactRow) : [];
  return rows.filter((c) => !!c.user_id && !!c.nickname);
}
/** Jeden riadok z list_social_contacts — presný typ z databázy, žiadne any. */
type SocialContactRow = Database['public']['Functions']['list_social_contacts']['Returns'][number];
function isContactRow(value: unknown): value is SocialContactRow {
  return typeof value === 'object' && value !== null && 'user_id' in value && 'nickname' in value;
}
export type SocialContact = SocialContactRow;
export async function loadOpenMatches() {
  const { data, error } = await bilt
    .from('online_matches')
    .select('*')
    .in('status', ['invited', 'active'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const matches = data ?? [];
  void expireOldMatches(matches);
  return matches;
}
/** Raz za beh appky: zápasy staršie než 3 dni sa automaticky zrušia. */
const expiryTried = new Set<string>();
type ExpirableMatch = Pick<OnlineMatch, 'id' | 'status' | 'created_at' | 'guest_id'>;
function isExpirableMatch(value: unknown): value is ExpirableMatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'guest_id' in value &&
    typeof value.guest_id === 'string' &&
    'created_at' in value &&
    typeof value.created_at === 'string' &&
    'status' in value &&
    (value.status === 'invited' ||
      value.status === 'active' ||
      value.status === 'cancelled' ||
      value.status === 'declined' ||
      value.status === 'finished')
  );
}
async function expireOldMatches(matches: ExpirableMatch[]) {
  const userId = usePlayers.getState().session?.user.id;
  if (!userId) return;
  for (const m of matches) {
    if (m.status !== 'invited' && m.status !== 'active') continue;
    if (!isMatchExpired(m.created_at)) continue;
    if (expiryTried.has(m.id)) continue;
    expiryTried.add(m.id);
    try {
      const decision =
        m.status === 'invited' ? (m.guest_id === userId ? 'decline' : 'cancel') : 'abandon';
      await respondMatch(m.id, decision);
    } catch {
      // Ignoruj (napr. súper to medzitým vyriešil) — skúsime znova po reštarte.
    }
  }
}
export async function inviteMatch(
  peer: string,
  starting: number,
  doubleOut: boolean,
  legsToWin = 1,
) {
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
  const expirable: unknown = match;
  if (isExpirableMatch(expirable)) void expireOldMatches([expirable]);
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
