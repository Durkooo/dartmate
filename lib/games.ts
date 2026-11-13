import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/* Ďalšie herné režimy (Cricket a tréningy). Majú vlastné úložisko, aby sa
 * nedotkli x01 zápasov, histórie ani štatistík. */

// ───────────────────────── Cricket ─────────────────────────
/** Čísla v Crickete v poradí na tabuli; 25 = bull. */
export const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25] as const;
export type CricketCore = {
  players: [string, string];
  /** Zásahy (0–3) pre každé číslo, [hráč][číslo]. */
  marks: [number[], number[]];
  points: [number, number];
  turn: 0 | 1;
  /** Šípky hodené v aktuálnom kole (0–3). */
  dartsInTurn: number;
  totalDarts: [number, number];
  winner: 0 | 1 | null;
};
export type CricketGame = CricketCore & { past: CricketCore[] };

export function newCricket(players: [string, string]): CricketGame {
  return {
    players,
    marks: [CRICKET_TARGETS.map(() => 0), CRICKET_TARGETS.map(() => 0)],
    points: [0, 0],
    turn: 0,
    dartsInTurn: 0,
    totalDarts: [0, 0],
    winner: null,
    past: [],
  };
}
function core(g: CricketGame): CricketCore {
  const { past: _past, ...rest } = g;
  return {
    ...rest,
    marks: [[...rest.marks[0]], [...rest.marks[1]]],
    points: [...rest.points],
    totalDarts: [...rest.totalDarts],
  };
}
const closedAll = (marks: number[]) => marks.every((m) => m >= 3);

/** Jedna šípka: index čísla (alebo null = mimo) a násobok (bull max 2). */
export function cricketDart(g: CricketGame, target: number | null, mult: 1 | 2 | 3): CricketGame {
  if (g.winner !== null) return g;
  const next: CricketGame = { ...core(g), past: [...g.past.slice(-80), core(g)] };
  const p = next.turn;
  const o: 0 | 1 = p === 0 ? 1 : 0;
  next.totalDarts[p] += 1;
  if (target !== null) {
    const value = CRICKET_TARGETS[target];
    const hits = value === 25 ? Math.min(mult, 2) : mult;
    const total = next.marks[p][target] + hits;
    next.marks[p][target] = Math.min(3, total);
    const extra = total - 3;
    // Body len za číslo, ktoré mám zavreté a súper ešte nie.
    if (extra > 0 && next.marks[o][target] < 3) next.points[p] += extra * value;
  }
  if (closedAll(next.marks[p]) && next.points[p] >= next.points[o]) {
    next.winner = p;
    return next;
  }
  next.dartsInTurn += 1;
  if (next.dartsInTurn >= 3) {
    next.dartsInTurn = 0;
    next.turn = o;
  }
  return next;
}
/** Koniec kola skôr (napr. hráč hodil menej šípok, než zadal). */
export function cricketEndTurn(g: CricketGame): CricketGame {
  if (g.winner !== null) return g;
  const next: CricketGame = { ...core(g), past: [...g.past.slice(-80), core(g)] };
  next.dartsInTurn = 0;
  next.turn = next.turn === 0 ? 1 : 0;
  return next;
}
export function cricketUndo(g: CricketGame): CricketGame {
  const prev = g.past.at(-1);
  return prev ? { ...prev, past: g.past.slice(0, -1) } : g;
}

// ─────────────────────── Around the Clock ───────────────────────
/** Cieľ 1–20, potom 21 = bull; hotovo po zásahu bullu. */
export type ClockGame = { target: number; darts: number; done: boolean; past: number[] };
export const newClock = (): ClockGame => ({ target: 1, darts: 0, done: false, past: [] });
export function clockDart(g: ClockGame, hit: boolean): ClockGame {
  if (g.done) return g;
  const target = hit ? g.target + 1 : g.target;
  return {
    target,
    darts: g.darts + 1,
    done: target > 21,
    past: [...g.past.slice(-200), g.target],
  };
}
export function clockUndo(g: ClockGame): ClockGame {
  if (!g.past.length) return g;
  return { target: g.past.at(-1)!, darts: g.darts - 1, done: false, past: g.past.slice(0, -1) };
}
export const clockLabel = (target: number) => (target > 20 ? 'Bull' : String(target));

// ───────────────────────── Bob's 27 ─────────────────────────
/** 21 kôl: D1…D20 a D-bull, 3 šípky na double. Zásah = +hodnota doublu,
 *  žiadny zásah = −hodnota. Pod nulou hra končí. */
export type BobsGame = {
  round: number;
  score: number;
  hits: number;
  over: boolean;
  past: { score: number; hits: number }[];
};
export const BOBS_ROUNDS = 21;
export const bobsDouble = (round: number) => (round >= 20 ? 50 : (round + 1) * 2);
export const bobsLabel = (round: number) => (round >= 20 ? 'D-Bull' : `D${round + 1}`);
export const newBobs = (): BobsGame => ({ round: 0, score: 27, hits: 0, over: false, past: [] });
export function bobsRound(g: BobsGame, hits: 0 | 1 | 2 | 3): BobsGame {
  if (g.over) return g;
  const value = bobsDouble(g.round);
  const score = g.score + (hits ? hits * value : -value);
  const round = g.round + 1;
  return {
    round,
    score,
    hits: g.hits + hits,
    over: score < 0 || round >= BOBS_ROUNDS,
    past: [...g.past, { score: g.score, hits: g.hits }],
  };
}
export function bobsUndo(g: BobsGame): BobsGame {
  const prev = g.past.at(-1);
  if (!prev) return g;
  return { round: g.round - 1, ...prev, over: false, past: g.past.slice(0, -1) };
}

// ───────────────────────── 121 ─────────────────────────
/** 10 pokusov po 9 šípok (3 kolá) na zatvorenie. Zatvorené = cieľ +1, inak ostáva. */
export type C121Game = {
  target: number;
  attempt: number;
  successes: number;
  best: number;
  done: boolean;
  past: Omit<C121Game, 'past'>[];
};
export const C121_ATTEMPTS = 10;
export const newC121 = (): C121Game => ({
  target: 121,
  attempt: 0,
  successes: 0,
  best: 0,
  done: false,
  past: [],
});
export function c121Attempt(g: C121Game, success: boolean): C121Game {
  if (g.done) return g;
  const { past, ...prev } = g;
  const attempt = g.attempt + 1;
  return {
    target: success ? g.target + 1 : g.target,
    attempt,
    successes: g.successes + (success ? 1 : 0),
    best: success ? Math.max(g.best, g.target) : g.best,
    done: attempt >= C121_ATTEMPTS,
    past: [...past, prev],
  };
}
export function c121Undo(g: C121Game): C121Game {
  const prev = g.past.at(-1);
  return prev ? { ...prev, past: g.past.slice(0, -1) } : g;
}

// ───────────────────────── Úložisko ─────────────────────────
export type GameRecords = {
  cricketPlayed: number;
  cricketWins: number;
  /** Najmenej šípok v Around the Clock. */
  clockBest: number | null;
  bobsBest: number | null;
  /** Najvyššie zatvorené číslo v 121. */
  c121Best: number | null;
};
type ExtraGamesState = {
  hydrated: boolean;
  cricket: CricketGame | null;
  clock: ClockGame | null;
  bobs: BobsGame | null;
  c121: C121Game | null;
  records: GameRecords;
  setCricket: (g: CricketGame | null) => void;
  setClock: (g: ClockGame | null) => void;
  setBobs: (g: BobsGame | null) => void;
  setC121: (g: C121Game | null) => void;
  /** Uloží rekord dohranej hry a hru zavrie. */
  finish: (mode: 'cricket' | 'clock' | 'bobs' | 'c121') => void;
};
const emptyRecords: GameRecords = {
  cricketPlayed: 0,
  cricketWins: 0,
  clockBest: null,
  bobsBest: null,
  c121Best: null,
};
const better = (prev: number | null, value: number, lower = false) =>
  prev === null ? value : lower ? Math.min(prev, value) : Math.max(prev, value);

export const useExtraGames = create<ExtraGamesState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      cricket: null,
      clock: null,
      bobs: null,
      c121: null,
      records: emptyRecords,
      setCricket: (cricket) => set({ cricket }),
      setClock: (clock) => set({ clock }),
      setBobs: (bobs) => set({ bobs }),
      setC121: (c121) => set({ c121 }),
      finish: (mode) => {
        const s = get();
        const r = { ...s.records };
        if (mode === 'cricket' && s.cricket?.winner != null) {
          r.cricketPlayed += 1;
          if (s.cricket.winner === 0) r.cricketWins += 1;
        }
        if (mode === 'clock' && s.clock?.done)
          r.clockBest = better(r.clockBest, s.clock.darts, true);
        if (mode === 'bobs' && s.bobs?.over) r.bobsBest = better(r.bobsBest, s.bobs.score);
        if (mode === 'c121' && s.c121?.done && s.c121.best)
          r.c121Best = better(r.c121Best, s.c121.best);
        set({ records: r, [mode]: null });
      },
    }),
    {
      name: 'dartmate:extra-games-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        cricket: s.cricket,
        clock: s.clock,
        bobs: s.bobs,
        c121: s.c121,
        records: s.records,
      }),
      onRehydrateStorage: () => () => {
        useExtraGames.setState({ hydrated: true });
      },
    },
  ),
);
