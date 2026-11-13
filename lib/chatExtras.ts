import { bilt } from '@/lib/bilt';

/* Doplnky chatu: prečítané, „píše…“, reakcie a odpovede. Všetko je voliteľné —
 * kým backend nemá potrebné funkcie (exports/chat-and-leaderboard.sql), vracia
 * prázdne hodnoty a appka sa správa ako doteraz. */

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎯', '🔥', '🖕'] as const;
export type Reaction = { messageId: number; userId: string; emoji: string };
export type ChatState = { peerLastReadId: number; peerTyping: boolean };

const missing = (message: string) =>
  /function|schema cache|not find|does not exist|relation/i.test(message);
/** Keď funkcia na serveri chýba, ďalej ju nevoláme (žiadne zbytočné chyby). */
const unavailable = new Set<string>();

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (unavailable.has(name)) return null;
  const { data, error } = await bilt.rpc(name, args);
  if (error) {
    if (missing(error.message)) unavailable.add(name);
    return null;
  }
  return data as unknown;
}
const field = (row: unknown, key: string): unknown =>
  typeof row === 'object' && row !== null ? Reflect.get(row, key) : undefined;

export async function loadChatState(peer: string): Promise<ChatState | null> {
  try {
    const data = await rpc('conversation_state', { peer });
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      peerLastReadId: Number(field(row, 'peer_last_read_id') ?? 0),
      peerTyping: field(row, 'peer_typing') === true,
    };
  } catch {
    return null;
  }
}

export async function loadReactions(messageIds: number[]): Promise<Reaction[]> {
  if (!messageIds.length || unavailable.has('message_reactions')) return [];
  try {
    const { data, error } = await bilt
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);
    if (error) {
      if (missing(error.message)) unavailable.add('message_reactions');
      return [];
    }
    const out: Reaction[] = [];
    for (const r of (Array.isArray(data) ? data : []) as unknown[]) {
      const messageId = Number(field(r, 'message_id'));
      const userId = field(r, 'user_id');
      const emoji = field(r, 'emoji');
      if (Number.isFinite(messageId) && typeof userId === 'string' && typeof emoji === 'string')
        out.push({ messageId, userId, emoji });
    }
    return out;
  } catch {
    return [];
  }
}

export function markRead(peer: string, upTo: number): void {
  void rpc('mark_conversation_read', { peer, up_to: upTo }).catch(() => undefined);
}

let lastTyping = 0;
/** Najviac raz za 3 s počas písania. */
export function sendTyping(peer: string): void {
  const now = Date.now();
  if (now - lastTyping < 3000) return;
  lastTyping = now;
  void rpc('set_typing', { peer }).catch(() => undefined);
}

export async function react(messageId: number, emoji: string | null): Promise<void> {
  const { error } = await bilt.rpc('react_to_message', { target: messageId, reaction: emoji });
  if (error) {
    throw new Error(
      missing(error.message) || /check constraint|violates/i.test(error.message)
        ? 'Táto reakcia sa ešte pripravuje na serveri.'
        : error.message,
    );
  }
}

export function setReply(messageId: number, original: number): void {
  void rpc('set_message_reply', { target: messageId, original }).catch(() => undefined);
}

/** reply_to zo správy (stĺpec pribudne až s novým SQL). */
export function replyOf(message: unknown): number | null {
  const v = field(message, 'reply_to');
  return typeof v === 'number' ? v : null;
}

/** Krátky text správy pre citáciu. */
export function snippet(body: string, hasImage: boolean): string {
  const text = body.split('\n')[0]?.trim() ?? '';
  if (!text) return hasImage ? '📷 Fotografia' : '';
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}
