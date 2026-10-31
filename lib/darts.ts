import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as Haptics from 'expo-haptics';

export const palette = {
  ink: '#192438',
  paper: '#F4F5F9',
  white: '#FFFFFF',
  muted: '#687184',
  yellow: '#F7CF46',
  line: '#DEE2EA',
  onInk: '#BDC8DB',
  lavender: '#DED7F4',
  blue: '#D8E7F5',
  peach: '#F6DED1',
  danger: '#B63044',
  success: '#28714E',
};
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
};
export type Message = { id: string; friendId: string; text: string; mine: boolean; time: string };
export type Turn = { player: 0 | 1; score: number; bust: boolean; remaining: number };
export type Game = {
  id: string;
  opponentId: string;
  opponentName: string;
  starting: 301 | 501;
  doubleOut: boolean;
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
  for (const turn of game.turns) result[turn.player] = turn.remaining;
  return result;
}
export function activePlayer(game: Game): 0 | 1 {
  return game.turns.length % 2 === 0 ? 0 : 1;
}
export function average(game: Game, player: 0 | 1): string {
  const turns = game.turns.filter((t) => t.player === player);
  if (!turns.length) return '—';
  return (turns.reduce((sum, t) => sum + (t.bust ? 0 : t.score), 0) / turns.length).toFixed(1);
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
  startGame: (friend: Friend, starting: 301 | 501, doubleOut: boolean) => void;
  submitTurn: (score: number, finishedDouble: boolean) => void;
  undo: () => void;
  archiveGame: () => void;
  discardGame: () => void;
  retryStorage: () => Promise<void>;
}
function savedState(s: DartsState) {
  return { friends: s.friends, messages: s.messages, game: s.game, history: s.history };
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
      startGame: (friend, starting, doubleOut) =>
        set({
          game: {
            id: id(),
            opponentId: friend.id,
            opponentName: friend.name,
            starting,
            doubleOut,
            turns: [],
            winner: null,
            date: new Date().toISOString(),
          },
        }),
      submitTurn: (score, finishedDouble) => {
        const game = get().game;
        if (!game || game.winner !== null || !validScore(score)) return;
        const player = activePlayer(game);
        const remaining = scores(game)[player] - score;
        const bust =
          remaining < 0 ||
          (game.doubleOut &&
            (remaining === 1 || (remaining === 0 && (!finishedDouble || !canFinish(score, true)))));
        const turn: Turn = {
          player,
          score,
          bust,
          remaining: bust ? scores(game)[player] : remaining,
        };
        set({
          game: {
            ...game,
            turns: [...game.turns, turn],
            winner: !bust && remaining === 0 ? player : null,
          },
        });
      },
      undo: () =>
        set((s) => ({
          game: s.game ? { ...s.game, turns: s.game.turns.slice(0, -1), winner: null } : null,
        })),
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
      onRehydrateStorage: () => (_state, error) => {
        useDarts.setState({ hydrated: true, storageError: !!error });
        if (error) feedback.error();
      },
    },
  ),
);
