import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as Haptics from 'expo-haptics';
import type { BotConfig } from '@/lib/bots';

export const palette = {
  ink: '#192438',
  paper: '#C9CFDA', // pozadie appky: svetlejší odtieň poľa 25 z terča
  white: '#FFFFFF',
  muted: '#525D71', // farba poľa 25 — čitateľná na pozadí aj na bielom
  yellow: '#F7CF46',
  line: '#DEE2EA',
  onInk: '#BDC8DB',
  lavender: '#DED7F4',
  blue: '#D8E7F5',
  peach: '#F6DED1',
  danger: '#B63044',
  success: '#28714E',
  playing: '#E8850C',
};
/** Biela dlaždica (riadky zoznamov) s tmavomodrým písmom. */
export const CARD_ROW = 'bg-surface mb-2 flex-row items-center gap-3 rounded-2xl px-4 py-3';
export const feedback = {
  selection: () => {
    void Haptics.selectionAsync().catch(() => undefined);
  },
  success: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  error: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};
export type Friend = {
  id: string;
  name: string;
  handle: string;
  color: 'lavender' | 'blue' | 'peach';
  demo: boolean;
  /** Profilová fotka (podpísaný odkaz); bez nej sa ukážu začiatočné písmená. */
  avatarUrl?: string;
};
export type Message = { id: string; friendId: string; text: string; mine: boolean; time: string };
export type Turn = {
  player: 0 | 1;
  score: number;
  bust: boolean;
  remaining: number;
  darts?: 1 | 2 | 3;
  /** Poradové číslo legu (od 0), v ktorom padol ťah. */
  leg: number;
  /** Vrátený ťah: ostáva v prehľade prečiarknutý, do skóre sa neráta. */
  undone?: boolean;
};
export type Game = {
  id: string;
  opponentId: string;
  opponentName: string;
  /** Sólo hra pre jedného hráča — ťahá vždy len on. */
  solo?: boolean;
  bot?: BotConfig;
  starting: 301 | 501;
  doubleOut: boolean;
  /** Na koľko víťazných legov sa hrá (1 = jeden leg ako doteraz). */
  legsToWin: number;
  /** Vyhraté legy [ja, súper]. */
  legs: [number, number];
  /** Medzi legmi: leg dohraný, čaká sa na začiatok ďalšieho. */
  betweenLegs: boolean;
  turns: Turn[];
  winner: 0 | 1 | null;
  date: string;
};
const sampleFriends: Friend[] = [
  { id: 'martin', name: 'Martin Kováč', handle: 'martin.k', color: 'blue', demo: true },
  { id: 'lucia', name: 'Lucia Novotná', handle: 'lucia.n', color: 'lavender', demo: true },
  { id: 'peter', name: 'Peter Šimko', handle: 'peter.s', color: 'peach', demo: true },
];
const sampleMessages: Message[] = [
  { id: 'sample-1', friendId: 'martin', text: 'Dáme večer jednu 501?', mine: false, time: '18:42' },
  {
    id: 'sample-2',
    friendId: 'lucia',
    text: 'Dnes mi to konečne lieta!',
    mine: false,
    time: '17:15',
  },
  {
    id: 'sample-3',
    friendId: 'peter',
    text: 'Budúci týždeň si dáme odvetu. Dovtedy potrénujem double 16.',
    mine: false,
    time: '16:08',
  },
];
export function scores(game: Game): [number, number] {
  const result: [number, number] = [game.starting, game.starting];
  for (const turn of game.turns) {
    if (turn.undone) continue;
    const visibleLeg = currentLeg(game) - (game.betweenLegs || game.winner !== null ? 1 : 0);
    if (turn.leg === visibleLeg) result[turn.player] = turn.remaining;
  }
  return result;
}
/** Koľko legov je dohraných = číslo práve hraného legu (od 0). */
export function currentLeg(game: Game): number {
  return game.legs[0] + game.legs[1];
}
/** Ťahy práve hraného legu (bez vrátených). */
export function legTurns(game: Game): Turn[] {
  const leg = currentLeg(game);
  return game.turns.filter((t) => t.leg === leg && !t.undone);
}
export function activePlayer(game: Game): 0 | 1 {
  if (game.solo) return 0;
  // Začínajúceho v legu striedame: párny leg začína hráč 0, nepárny hráč 1.
  // active = (starter + odohrané ťahy) % 2 — vetvenie namiesto pretypovania.
  const starterIsFirst = currentLeg(game) % 2 === 0;
  const evenTurns = legTurns(game).length % 2 === 0;
  if (starterIsFirst) return evenTurns ? 0 : 1;
  return evenTurns ? 1 : 0;
}
/** 4 najčastejšie súčty 3 šípok — vyberá podľa početnosti, vracia od najmenšieho. */
export function topScores(turnScores: number[]): number[] {
  const freq = new Map<number, number>();
  for (const s of turnScores) {
    if (!Number.isInteger(s) || s < 0 || s > 180) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, 4)
    .map(([s]) => s)
    .sort((a, b) => a - b);
}
export function average(game: Game, player: 0 | 1): string {
  const turns = game.turns.filter((t) => t.player === player && !t.undone);
  if (!turns.length) return '—';
  const points = turns.reduce((sum, t) => sum + (t.bust ? 0 : t.score), 0);
  const darts = turns.reduce((sum, t) => sum + (t.darts ?? 3), 0);
  return ((points * 3) / darts).toFixed(1);
}
export function validScore(score: number) {
  return (
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 180 &&
    ![169, 172, 173, 175, 176, 178, 179].includes(score)
  );
}
export function canFinish(score: number, doubleOut: boolean) {
  return (
    !doubleOut ||
    (score >= 2 && score <= 170 && ![159, 162, 163, 165, 166, 168, 169].includes(score))
  );
}
export function validCheckout(score: number, darts: 1 | 2 | 3, doubleOut: boolean): boolean {
  const hits = [
    ...new Set([
      0,
      25,
      50,
      ...Array.from({ length: 20 }, (_, i) => i + 1).flatMap((n) => [n, n * 2, n * 3]),
    ]),
  ];
  const finishes = doubleOut
    ? [...Array.from({ length: 20 }, (_, i) => (i + 1) * 2), 50]
    : hits.filter((n) => n > 0);
  let totals = new Set([0]);
  for (let i = 1; i < darts; i++) {
    totals = new Set([...totals].flatMap((sum) => hits.map((hit) => sum + hit)));
  }
  return finishes.some((finish) => totals.has(score - finish));
}
/** Nedokončený zápas (online aj offline) sa po tomto čase automaticky zruší. */
export const MATCH_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;
export function isMatchExpired(dateIso: string | null | undefined): boolean {
  if (!dateIso) return false;
  const t = Date.parse(dateIso);
  return Number.isFinite(t) && Date.now() - t > MATCH_EXPIRY_MS;
}
function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
interface DartsState {
  friends: Friend[];
  messages: Message[];
  game: Game | null;
  history: Game[];
  hydrated: boolean;
  storageError: boolean;
  addFriend: (name: string, handle: string) => string;
  sendMessage: (friendId: string, text: string) => void;
  startGame: (
    friend: Friend,
    starting: 301 | 501,
    doubleOut: boolean,
    legsToWin?: number,
    solo?: boolean,
    bot?: BotConfig,
  ) => void;
  submitTurn: (score: number, finishedDouble: boolean, darts?: 1 | 2 | 3) => void;
  undo: () => void;
  startNextLeg: () => void;
  archiveGame: () => void;
  discardGame: () => void;
  retryStorage: () => Promise<void>;
}
function savedState(s: DartsState) {
  return { friends: s.friends, messages: s.messages, game: s.game, history: s.history };
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Doplní predvolené hodnoty starému uloženému zápasu (spred legov). */
function fixGame(g: unknown): Record<string, unknown> {
  const game = isObject(g) ? g : {};
  const rawTurns = Array.isArray(game.turns) ? game.turns : [];
  const legs: [number, number] = [0, 0];
  if (Array.isArray(game.legs)) {
    const [a, b] = game.legs;
    legs[0] = typeof a === 'number' && Number.isFinite(a) && a >= 0 ? Math.floor(a) : 0;
    legs[1] = typeof b === 'number' && Number.isFinite(b) && b >= 0 ? Math.floor(b) : 0;
  }
  const legsToWin =
    typeof game.legsToWin === 'number' &&
    Number.isFinite(game.legsToWin) &&
    game.legsToWin >= 1 &&
    game.legsToWin <= 15
      ? Math.floor(game.legsToWin)
      : 1;
  return {
    ...game,
    legsToWin,
    legs,
    betweenLegs: false,
    winner: game.winner === 0 || game.winner === 1 ? game.winner : null,
    turns: rawTurns.filter(isObject).map((t) => ({
      ...t,
      leg:
        typeof t.leg === 'number' && Number.isFinite(t.leg) && t.leg >= 0 ? Math.floor(t.leg) : 0,
    })),
  };
}

export const useDarts = create<DartsState>()(
  persist(
    (set, get) => ({
      friends: sampleFriends,
      messages: sampleMessages,
      game: null,
      history: [],
      hydrated: false,
      storageError: false,
      addFriend: (name, handle) => {
        const friendId = id();
        set((s) => ({
          friends: [...s.friends, { id: friendId, name, handle, color: 'lavender', demo: false }],
        }));
        return friendId;
      },
      sendMessage: (friendId, text) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: id(),
              friendId,
              text,
              mine: true,
              time: new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        })),
      startGame: (friend, starting, doubleOut, legsToWin = 1, solo = false, bot) =>
        set({
          game: {
            id: id(),
            opponentId: friend.id,
            opponentName: friend.name,
            solo: bot ? false : solo,
            bot,
            starting,
            doubleOut,
            legsToWin: Math.min(15, Math.max(1, Math.floor(legsToWin))),
            legs: [0, 0],
            betweenLegs: false,
            turns: [],
            winner: null,
            date: new Date().toISOString(),
          },
        }),
      submitTurn: (score, finishedDouble, darts = 3) => {
        const game = get().game;
        if (!game || game.winner !== null || game.betweenLegs || !validScore(score)) return;
        const player = activePlayer(game);
        const remaining = scores(game)[player] - score;
        const bust =
          remaining < 0 ||
          (game.doubleOut &&
            (remaining === 1 || (remaining === 0 && (!finishedDouble || !canFinish(score, true)))));
        if (!bust && remaining === 0 && !validCheckout(score, darts, game.doubleOut)) return;
        const legWon = !bust && remaining === 0;
        const legs: [number, number] =
          legWon && player === 0
            ? [game.legs[0] + 1, game.legs[1]]
            : legWon
              ? [game.legs[0], game.legs[1] + 1]
              : game.legs;
        const matchWon = legWon && legs[player] >= game.legsToWin;
        const turn: Turn = {
          darts: legWon ? darts : 3,
          player,
          score,
          bust,
          remaining: bust ? scores(game)[player] : remaining,
          leg: currentLeg(game),
        };
        set({
          game: {
            ...game,
            turns: [...game.turns, turn],
            legs,
            betweenLegs: legWon && !matchWon,
            winner: matchWon ? player : null,
          },
        });
      },
      undo: () =>
        set((s) => {
          if (!s.game) return {};
          // Vrátené ťahy sa nemažú, len označia — v prehľade ostanú prečiarknuté.
          const idx: number[] = [];
          for (let i = s.game.turns.length - 1; i >= 0 && idx.length < 2; i--) {
            if (!s.game.turns[i].undone) idx.push(i);
          }
          const last = idx.length ? s.game.turns[idx[0]] : undefined;
          const previous = idx.length > 1 ? s.game.turns[idx[1]] : undefined;
          const pair =
            s.game.bot && last?.player === 1 && previous?.player === 0 && previous.leg === last.leg;
          const mark = new Set(pair ? idx.slice(0, 2) : idx.slice(0, 1));
          const legWon = !!last && !last.bust && last.remaining === 0 && mark.has(idx[0]);
          return {
            game: {
              ...s.game,
              turns: s.game.turns.map((t, i) => (mark.has(i) ? { ...t, undone: true } : t)),
              legs:
                legWon && last
                  ? ([
                      s.game.legs[0] - (last.player === 0 ? 1 : 0),
                      s.game.legs[1] - (last.player === 1 ? 1 : 0),
                    ] as [number, number])
                  : s.game.legs,
              winner: null,
              betweenLegs: false,
            },
          };
        }),
      startNextLeg: () =>
        set((s) =>
          s.game && s.game.betweenLegs ? { game: { ...s.game, betweenLegs: false } } : {},
        ),
      archiveGame: () =>
        set((s) => ({
          history: s.game && s.game.winner !== null ? [s.game, ...s.history] : s.history,
          game: null,
        })),
      discardGame: () => set({ game: null }),
      retryStorage: async () => {
        try {
          await AsyncStorage.setItem(
            'oche-prototype-v1',
            JSON.stringify({ state: savedState(get()), version: 0 }),
          );
          set({ storageError: false });
          feedback.success();
        } catch {
          feedback.error();
        }
      },
    }),
    {
      name: 'oche-prototype-v1',
      storage: createJSONStorage(() => ({
        getItem: (name) => AsyncStorage.getItem(name),
        setItem: async (name, value) => {
          try {
            await AsyncStorage.setItem(name, value);
          } catch {
            if (!useDarts.getState().storageError) {
              useDarts.setState({ storageError: true });
              feedback.error();
            }
          }
        },
        removeItem: (name) => AsyncStorage.removeItem(name),
      })),
      partialize: savedState,
      version: 1,
      // Staré uložené zápasy (pred legmi) doplnia predvolené hodnoty,
      // aby sa po update nerozbili (Ťahy bez legu patria do legu 0).
      migrate: (persisted: unknown) => {
        const root = isObject(persisted) ? persisted : {};
        const state = isObject(root.state) ? root.state : root;
        if (Array.isArray(state.history))
          state.history = state.history.filter(isObject).map(fixGame);
        if (state.game) state.game = fixGame(state.game);
        return { ...root, state };
      },
      onRehydrateStorage: () => (restored, error) => {
        useDarts.setState({ hydrated: true, storageError: !!error });
        if (error) feedback.error();
        // Nedokončený lokálny zápas starší než 3 dni sa automaticky zruší.
        const value: unknown = restored;
        const g = isObject(value) && isObject(value.game) ? value.game : null;
        if (g && g.winner === null && typeof g.date === 'string' && isMatchExpired(g.date)) {
          useDarts.setState({ game: null });
        }
      },
    },
  ),
);
