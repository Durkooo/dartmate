import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { bilt } from '@/lib/bilt';
import type { TrainingMode } from '@/lib/games';
import { notifyRecipient } from '@/lib/sendPush';

/* Výzva na tréning: „prekonaj môj výsledok“. Chodí ako bežná správa v chate
 * (čitateľný text + posledný riadok s kódom), takže nepotrebuje zmenu servera. */

export const CHALLENGE_HEADER = '🏆 Výzva na tréning';
export const TRAINING_TITLES: Record<TrainingMode, string> = {
  clock: 'Around the Clock',
  bobs: "Bob's 27",
  c121: '121',
  highscore: 'Highscore',
  finishing: 'Finishing 50',
  randomCheckout: 'Random Checkout',
  bull: 'Bull Challenge',
};
export const TRAINING_ROUTES: Record<TrainingMode, string> = {
  clock: '/games/clock',
  bobs: '/games/bobs',
  c121: '/games/c121',
  highscore: '/games/highscore',
  finishing: '/games/finishing',
  randomCheckout: '/games/random-checkout',
  bull: '/games/bull',
};
const isMode = (v: string): v is TrainingMode => v in TRAINING_TITLES;

export type Challenge = {
  mode: TrainingMode;
  target: number;
  /** Menej je lepšie (Around the Clock = šípky). */
  lower: boolean;
  unit: string;
};
const CODE = /#vyzva:([a-zA-Z]+):(-?\d+(?:\.\d+)?):([hl])(?::([^\n]*))?$/;

export function formatChallenge(c: Challenge, fromNick: string): string {
  return [
    CHALLENGE_HEADER,
    `${TRAINING_TITLES[c.mode]} · ${c.lower ? 'zvládni za' : 'prekonaj'} ${c.target}${c.unit ? ` ${c.unit}` : ''}`,
    `Od @${fromNick}`,
    `#vyzva:${c.mode}:${c.target}:${c.lower ? 'l' : 'h'}:${c.unit}`,
  ].join('\n');
}
export function parseChallenge(body: string | null | undefined): Challenge | null {
  if (!body || !body.startsWith(`${CHALLENGE_HEADER}\n`)) return null;
  const m = body.trim().match(CODE);
  if (!m) return null;
  const mode = isMode(m[1]) ? m[1] : undefined;
  if (!mode) return null;
  return { mode, target: Number(m[2]), lower: m[3] === 'l', unit: m[4] ?? '' };
}
/** Riadky karty bez kódu. */
export const challengeLines = (body: string) =>
  body
    .split('\n')
    .slice(1)
    .filter((l) => l && !l.startsWith('#vyzva:'));

async function sendText(peerId: string, myNick: string, body: string, preview: string) {
  const { data, error } = await bilt.rpc('send_direct_message', {
    peer: peerId,
    message_body: body,
    client_request: Crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('Správu sa nepodarilo poslať.');
  const myId: string | undefined = (await bilt.auth.getSession()).data?.session?.user.id;
  if (myId) notifyRecipient(peerId, `@${myNick}`, preview, `/conversation/${myId}`);
}
export function sendChallenge(peerId: string, myNick: string, c: Challenge) {
  return sendText(
    peerId,
    myNick,
    formatChallenge(c, myNick),
    `🏆 Výzva: ${TRAINING_TITLES[c.mode]} – ${c.lower ? 'zvládni za' : 'prekonaj'} ${c.target}`,
  );
}

/** Prijatá výzva, ktorú práve hráš (pamätá sa aj po zavretí appky). */
export type ActiveChallenge = Challenge & { fromId: string; fromNick: string };
type ChallengeState = {
  active: ActiveChallenge | null;
  accept: (c: ActiveChallenge) => void;
  clear: () => void;
};
export const useChallenge = create<ChallengeState>()(
  persist(
    (set) => ({
      active: null,
      accept: (active) => set({ active }),
      clear: () => set({ active: null }),
    }),
    {
      name: 'dartmate:challenge',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ active: s.active }),
    },
  ),
);

export const challengeMet = (c: Challenge, value: number) =>
  c.lower ? value <= c.target : value > c.target;
