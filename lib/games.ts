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
  /** Id súpera (priateľ z appky → výsledok sa pošle rovno jemu). */
  opponentId?: string;
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

export function newCricket(players: [string, string], opponentId?: string): CricketGame {
  return {
    players,
    opponentId,
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

// ───────────────────── Počet kôl (spoločné) ─────────────────────
/** null = nekonečno (hrá sa, kým hráč tréning neukončí). */
export type RoundsCount = number | null;
export const ROUND_OPTIONS: RoundsCount[] = [5, 10, 15, 20, null];
export const roundsLabel = (r: RoundsCount) => (r === null ? '∞' : String(r));
/** „Kolo 3 z 10“ / „Kolo 3“ pri nekonečne. */
export const roundOf = (current: number, total: RoundsCount) =>
  total === null ? `Kolo ${current}` : `Kolo ${Math.min(current, total)} z ${total}`;
/** Ukončenie tréningu s nekonečnom kôl (alebo skôr). */
export function endTraining<T extends { done: boolean }>(g: T): T {
  return { ...g, done: true };
}

// ───────────────────────── 121 ─────────────────────────
/** 10 pokusov na zatvorenie s vybraným počtom šípok (3/6/9/12). Zatvorené =
 *  ďalší cieľ o 1 vyšší, nezatvorené = späť na 121. */
export const C121_ATTEMPTS = 10;
export const C121_START = 121;
export const C121_DART_OPTIONS = [3, 6, 9, 12] as const;
export type C121Darts = (typeof C121_DART_OPTIONS)[number];
export type C121Game = {
  target: number;
  attempt: number;
  successes: number;
  best: number;
  done: boolean;
  /** Šípky na jeden pokus (staršie uložené hry = 9). */
  darts?: C121Darts;
  /** Počet pokusov (null = nekonečno; staršie hry = 10). */
  rounds?: RoundsCount;
  /** Najdlhšia séria zatvorení po sebe. */
  bestStreak?: number;
  streak?: number;
  past: Omit<C121Game, 'past'>[];
};
export const newC121 = (darts: C121Darts = 9, rounds: RoundsCount = 10): C121Game => ({
  rounds,
  target: C121_START,
  attempt: 0,
  successes: 0,
  best: 0,
  done: false,
  darts,
  bestStreak: 0,
  streak: 0,
  past: [],
});
export function c121Attempt(g: C121Game, success: boolean): C121Game {
  if (g.done) return g;
  const { past, ...prev } = g;
  const attempt = g.attempt + 1;
  const streak = success ? (g.streak ?? 0) + 1 : 0;
  return {
    target: success ? g.target + 1 : C121_START,
    attempt,
    successes: g.successes + (success ? 1 : 0),
    best: success ? Math.max(g.best, g.target) : g.best,
    done:
      (g.rounds === undefined ? C121_ATTEMPTS : g.rounds) !== null &&
      attempt >= (g.rounds ?? C121_ATTEMPTS),
    darts: g.darts ?? 9,
    rounds: g.rounds === undefined ? C121_ATTEMPTS : g.rounds,
    streak,
    bestStreak: Math.max(g.bestStreak ?? 0, streak),
    past: [...past, prev],
  };
}
export function c121Undo(g: C121Game): C121Game {
  const prev = g.past.at(-1);
  return prev ? { ...prev, past: g.past.slice(0, -1) } : g;
}

// ───────────────────────── Highscore ─────────────────────────
/** 10 kôl po 3 šípky, cieľ = čo najvyšší súčet bodov. */
export const HIGHSCORE_ROUNDS = 10;
export type HighscoreGame = { scores: number[]; done: boolean; rounds?: RoundsCount };
export const newHighscore = (rounds: RoundsCount = HIGHSCORE_ROUNDS): HighscoreGame => ({
  scores: [],
  done: false,
  rounds,
});
export const highscoreRounds = (g: HighscoreGame) =>
  g.rounds === undefined ? HIGHSCORE_ROUNDS : g.rounds;
export function highscoreRound(g: HighscoreGame, score: number): HighscoreGame {
  if (g.done || score < 0 || score > 180) return g;
  const scores = [...g.scores, score];
  const total = highscoreRounds(g);
  return { ...g, scores, done: total !== null && scores.length >= total };
}
export function highscoreUndo(g: HighscoreGame): HighscoreGame {
  return g.scores.length ? { ...g, scores: g.scores.slice(0, -1), done: false } : g;
}
export const highscoreTotal = (g: HighscoreGame) => g.scores.reduce((a, b) => a + b, 0);

// ───────────────────────── Finishing 50 ─────────────────────────
/** 20 kôl, v každom náhodné zatvorenie 2–50 na 3 šípky. Body: zatvorené
 *  1 šípkou = 3, 2 šípkami = 2, 3 šípkami = 1, nezatvorené = 0. */
export const FINISH_ROUNDS = 20;
export type FinishGame = {
  /** Počet kôl (null = nekonečno; staršie hry = 20). */
  rounds?: RoundsCount;
  targets: number[];
  /** Body za odohrané kolá (0–3). */
  results: number[];
  done: boolean;
};
const randomFinish = () => 2 + Math.floor(Math.random() * 49);
export const finishRounds = (g: FinishGame) => (g.rounds === undefined ? FINISH_ROUNDS : g.rounds);
export const newFinish = (rounds: RoundsCount = FINISH_ROUNDS): FinishGame => ({
  rounds,
  targets: [randomFinish()],
  results: [],
  done: false,
});
/** Číslo aktuálneho kola. */
export const finishTarget = (g: FinishGame) => g.targets[g.results.length] ?? null;
export function finishRound(g: FinishGame, points: 0 | 1 | 2 | 3): FinishGame {
  if (g.done) return g;
  const results = [...g.results, points];
  const total = finishRounds(g);
  const done = total !== null && results.length >= total;
  // Ďalšie číslo sa vyžrebuje až keď treba (nekonečno nemá dopredu zoznam).
  const targets =
    !done && g.targets.length <= results.length ? [...g.targets, randomFinish()] : g.targets;
  return { ...g, targets, results, done };
}
export function finishUndo(g: FinishGame): FinishGame {
  return g.results.length ? { ...g, results: g.results.slice(0, -1), done: false } : g;
}
export const finishTotal = (g: FinishGame) => g.results.reduce((a, b) => a + b, 0);
/** Odporúčaná cesta zatvorenia (do 50) pri double out. */
export function finishHint(n: number): string {
  if (n === 50) return 'Bull';
  if (n % 2 === 0 && n <= 40) return `D${n / 2}`;
  // Nepárne alebo nad 40: single tak, aby ostal obľúbený double.
  for (const d of [16, 20, 8, 18, 12, 10, 4, 2, 1]) {
    const single = n - d * 2;
    if (single >= 1 && single <= 20) return `S${single} D${d}`;
  }
  return n > 40 ? `S${n - 40} D20` : `S1 D${(n - 1) / 2}`;
}

// ─────────────────────── Random Checkout ───────────────────────
/** Náhodné zatvoriteľné čísla 2–170 (double out), na každé zvolený počet šípok.
 *  Zatvorené = body vo výške čísla, nezatvorené = nič, ide sa ďalej. */
export const RC_DART_OPTIONS = [3, 6, 9] as const;
export type RcDarts = (typeof RC_DART_OPTIONS)[number];
export type RandomCheckoutGame = {
  rounds: RoundsCount;
  darts: RcDarts;
  targets: number[];
  results: boolean[];
  done: boolean;
};
const BOGEY = [159, 162, 163, 165, 166, 168, 169];
function randomCheckoutNumber(): number {
  for (;;) {
    const n = 2 + Math.floor(Math.random() * 169);
    if (!BOGEY.includes(n)) return n;
  }
}
export const newRandomCheckout = (rounds: RoundsCount, darts: RcDarts): RandomCheckoutGame => ({
  rounds,
  darts,
  targets: [randomCheckoutNumber()],
  results: [],
  done: false,
});
export const rcTarget = (g: RandomCheckoutGame) => g.targets[g.results.length] ?? null;
export function rcRound(g: RandomCheckoutGame, closed: boolean): RandomCheckoutGame {
  if (g.done) return g;
  const results = [...g.results, closed];
  const done = g.rounds !== null && results.length >= g.rounds;
  const targets =
    !done && g.targets.length <= results.length
      ? [...g.targets, randomCheckoutNumber()]
      : g.targets;
  return { ...g, targets, results, done };
}
export function rcUndo(g: RandomCheckoutGame): RandomCheckoutGame {
  return g.results.length ? { ...g, results: g.results.slice(0, -1), done: false } : g;
}
/** Body = súčet zatvorených čísel. */
export const rcPoints = (g: RandomCheckoutGame) =>
  g.results.reduce((sum, ok, i) => sum + (ok ? g.targets[i] : 0), 0);

/** Odporúčaná cesta zatvorenia do 170 (najmenej šípok, obľúbené čísla). */
const PREFERRED: { label: string; value: number }[] = [
  ...[20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map((n) => ({ label: `T${n}`, value: n * 3 })),
  { label: 'Bull', value: 50 },
  { label: '25', value: 25 },
  ...Array.from({ length: 20 }, (_, i) => 20 - i).map((n) => ({ label: `S${n}`, value: n })),
  ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ label: `T${n}`, value: n * 3 })),
];
const DOUBLES: { label: string; value: number }[] = [
  ...[20, 16, 18, 10, 8, 12, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1].map((n) => ({
    label: `D${n}`,
    value: n * 2,
  })),
  { label: 'Bull', value: 50 },
];
export function checkoutRoute(n: number): string {
  for (const d of DOUBLES) if (d.value === n) return d.label;
  // Najprv obľúbený double na konci, až potom šípky pred ním.
  for (const d of DOUBLES)
    for (const a of PREFERRED) if (a.value + d.value === n) return `${a.label} ${d.label}`;
  for (const d of DOUBLES)
    for (const a of PREFERRED)
      for (const b of PREFERRED)
        if (a.value + b.value + d.value === n) return `${a.label} ${b.label} ${d.label}`;
  return '';
}

// ─────────────────────── Bull Challenge ───────────────────────
/** 3 šípky na kolo na bull (50) alebo 25. Kolo bez zásahu = koniec hry. */
export type BullDart = 50 | 25 | 0;
export type BullGame = {
  /** Šípky po kolách (každé kolo max 3). */
  rounds: BullDart[][];
  done: boolean;
};
export const newBull = (): BullGame => ({ rounds: [[]], done: false });
export function bullDart(g: BullGame, d: BullDart): BullGame {
  if (g.done) return g;
  const rounds = g.rounds.map((r) => [...r]);
  const cur = rounds[rounds.length - 1];
  cur.push(d);
  if (cur.length < 3) return { rounds, done: false };
  // Kolo dohrané: bez zásahu = game over, inak ďalšie kolo.
  if (cur.every((x) => x === 0)) return { rounds, done: true };
  rounds.push([]);
  return { rounds, done: false };
}
export function bullUndo(g: BullGame): BullGame {
  const rounds = g.rounds.map((r) => [...r]);
  let cur = rounds[rounds.length - 1];
  if (!cur.length && rounds.length > 1) {
    rounds.pop();
    cur = rounds[rounds.length - 1];
  }
  if (!cur.length) return g;
  cur.pop();
  return { rounds, done: false };
}
export const bullDarts = (g: BullGame) => g.rounds.flat();
export const bullScore = (g: BullGame) => bullDarts(g).reduce<number>((a, b) => a + b, 0);

// ─────────────────────── História tréningov ───────────────────────
export type TrainingMode =
  | 'clock'
  | 'bobs'
  | 'c121'
  | 'highscore'
  | 'finishing'
  | 'randomCheckout'
  | 'bull';
/** Jeden dohraný (uložený) tréning: výsledok a štatistiky na zobrazenie/poslanie. */
export type TrainingEntry = {
  id: string;
  mode: TrainingMode;
  date: string;
  /** Hlavný výsledok (text). */
  result: string;
  /** Veľké číslo na obrázku. */
  score: string;
  /** Číselná hodnota výsledku na porovnanie (rekord, priemer). */
  value: number | null;
  stats: { label: string; value: string }[];
};

// ───────────────────────── Úložisko ─────────────────────────
export type GameRecords = {
  cricketPlayed: number;
  cricketWins: number;
  /** Najmenej šípok v Around the Clock. */
  clockBest: number | null;
  bobsBest: number | null;
  /** Najvyššie zatvorené číslo v 121. */
  c121Best: number | null;
  highscoreBest?: number | null;
  finishBest?: number | null;
  /** Najviac bodov v Random Checkout. */
  rcBest?: number | null;
  bullBest?: number | null;
};
type ExtraGamesState = {
  hydrated: boolean;
  cricket: CricketGame | null;
  clock: ClockGame | null;
  bobs: BobsGame | null;
  c121: C121Game | null;
  highscore: HighscoreGame | null;
  finishing: FinishGame | null;
  randomCheckout: RandomCheckoutGame | null;
  bull: BullGame | null;
  /** Uložené tréningy (najnovšie prvé, max 300). */
  trainingHistory?: TrainingEntry[];
  records: GameRecords;
  setCricket: (g: CricketGame | null) => void;
  setClock: (g: ClockGame | null) => void;
  setBobs: (g: BobsGame | null) => void;
  setC121: (g: C121Game | null) => void;
  setHighscore: (g: HighscoreGame | null) => void;
  setFinishing: (g: FinishGame | null) => void;
  setRandomCheckout: (g: RandomCheckoutGame | null) => void;
  setBull: (g: BullGame | null) => void;
  addTrainingEntry: (e: Omit<TrainingEntry, 'id' | 'date'>) => void;
  /** Uloží rekord dohranej hry a hru zavrie. */
  finish: (mode: 'cricket' | TrainingMode) => void;
};
const emptyRecords: GameRecords = {
  cricketPlayed: 0,
  cricketWins: 0,
  clockBest: null,
  bobsBest: null,
  c121Best: null,
  highscoreBest: null,
  finishBest: null,
  rcBest: null,
  bullBest: null,
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
      highscore: null,
      finishing: null,
      randomCheckout: null,
      bull: null,
      trainingHistory: [],
      records: emptyRecords,
      setCricket: (cricket) => set({ cricket }),
      setClock: (clock) => set({ clock }),
      setBobs: (bobs) => set({ bobs }),
      setC121: (c121) => set({ c121 }),
      setHighscore: (highscore) => set({ highscore }),
      setFinishing: (finishing) => set({ finishing }),
      setRandomCheckout: (randomCheckout) => set({ randomCheckout }),
      setBull: (bull) => set({ bull }),
      addTrainingEntry: (e) =>
        set((s) => ({
          trainingHistory: [
            {
              ...e,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              date: new Date().toISOString(),
            },
            ...(s.trainingHistory ?? []),
          ].slice(0, 300),
        })),
      finish: (mode) => {
        const s = get();
        // Staré uložené rekordy nemusia mať nové položky → doplníme predvolené.
        const r = { ...emptyRecords, ...s.records };
        if (mode === 'cricket' && s.cricket?.winner != null) {
          r.cricketPlayed += 1;
          if (s.cricket.winner === 0) r.cricketWins += 1;
        }
        if (mode === 'clock' && s.clock?.done)
          r.clockBest = better(r.clockBest, s.clock.darts, true);
        if (mode === 'bobs' && s.bobs?.over) r.bobsBest = better(r.bobsBest, s.bobs.score);
        if (mode === 'c121' && s.c121?.done && s.c121.best)
          r.c121Best = better(r.c121Best, s.c121.best);
        if (mode === 'highscore' && s.highscore?.done)
          r.highscoreBest = better(r.highscoreBest ?? null, highscoreTotal(s.highscore));
        if (mode === 'finishing' && s.finishing?.done)
          r.finishBest = better(r.finishBest ?? null, finishTotal(s.finishing));
        if (mode === 'randomCheckout' && s.randomCheckout?.done)
          r.rcBest = better(r.rcBest ?? null, rcPoints(s.randomCheckout));
        if (mode === 'bull' && s.bull?.done)
          r.bullBest = better(r.bullBest ?? null, bullScore(s.bull));
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
        highscore: s.highscore,
        finishing: s.finishing,
        randomCheckout: s.randomCheckout,
        bull: s.bull,
        trainingHistory: s.trainingHistory,
        records: s.records,
      }),
      onRehydrateStorage: () => () => {
        useExtraGames.setState({ hydrated: true });
      },
    },
  ),
);
