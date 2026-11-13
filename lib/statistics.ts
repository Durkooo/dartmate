import { bilt } from '@/lib/bilt';
import type { Game } from '@/lib/darts';
import type { OnlineMatch, OnlineTurn } from '@/lib/online';

export type ScoringTotals = {
  points: number;
  darts: number;
  highest: number;
  scores180: number;
};
export type StatisticsTotals = ScoringTotals & {
  matches: number;
  wins: number;
  losses: number;
  solo: number;
};
export type HistoryEntry =
  | { kind: 'offline'; id: string; date: string; game: Game }
  | { kind: 'online'; id: string; date: string; match: OnlineMatch };

type QueryPage<T> = { data: T[] | null; error: { message: string } | null };
type ScoringTurn = Pick<
  OnlineTurn,
  'match_id' | 'turn_number' | 'score' | 'darts' | 'bust' | 'remaining' | 'leg_number'
> & {
  online_matches: Pick<OnlineMatch, 'status'>;
};
export type VisitTurn = Pick<
  OnlineTurn,
  'match_id' | 'turn_number' | 'score' | 'darts' | 'bust' | 'remaining' | 'leg_number'
>;

/** Jeden môj hod (3 šípky) v jednotnej podobe pre offline aj online zápasy. */
type Visit = {
  match: string;
  leg: string;
  points: number;
  darts: number;
  /** Zostatok pred hodom. */
  before: number;
  checkout: boolean;
  doubleOut: boolean;
};
export type AdvancedStats = {
  /** Priemer prvých 9 šípok legu. */
  first9: number | null;
  /** Úspešnosť zatvorenia: zatvorené legy / hody zo zostatku na jednu šípku (≤ 40 párne, 50). */
  checkoutPct: number | null;
  checkouts: number;
  checkoutChances: number;
  highestCheckout: number;
  tons100: number;
  tons140: number;
  count180: number;
  /** Najmenej šípok na vyhraný leg. */
  bestLeg: number | null;
  /** Priemer na 3 šípky v posledných zápasoch (od najstaršieho). */
  trend: { id: string; date: string; avg: number }[];
};
/** Zostatok, ktorý sa dá zavrieť jednou šípkou na double (alebo bull). */
function oneDartFinish(rest: number) {
  return rest === 50 || (rest >= 2 && rest <= 40 && rest % 2 === 0);
}
const round1 = (n: number) => Math.round(n * 10) / 10;

export function advancedStatistics(
  offline: Game[],
  online: OnlineMatch[],
  onlineTurns: VisitTurn[],
): AdvancedStats {
  const visits: Visit[] = [];
  const dates = new Map<string, string>();
  for (const game of offline) {
    if (game.winner === null) continue;
    const key = `offline:${game.id}`;
    dates.set(key, game.date);
    for (const t of game.turns) {
      if (t.player !== 0 || t.undone) continue;
      const points = t.bust ? 0 : t.score;
      visits.push({
        match: key,
        leg: `${key}:${t.leg}`,
        points,
        darts: t.darts ?? 3,
        before: t.remaining + points,
        checkout: !t.bust && t.remaining === 0,
        doubleOut: game.doubleOut,
      });
    }
  }
  const byId = new Map(online.map((m) => [m.id, m]));
  for (const m of online) dates.set(`online:${m.id}`, m.created_at);
  const ordered = [...onlineTurns].sort((a, b) =>
    a.match_id === b.match_id ? a.turn_number - b.turn_number : a.match_id < b.match_id ? -1 : 1,
  );
  for (const t of ordered) {
    const m = byId.get(t.match_id);
    if (!m) continue;
    const key = `online:${t.match_id}`;
    const points = t.bust ? 0 : t.score;
    visits.push({
      match: key,
      leg: `${key}:${t.leg_number}`,
      points,
      darts: t.darts || 3,
      before: t.remaining + points,
      checkout: !t.bust && t.remaining === 0,
      doubleOut: m.double_out,
    });
  }
  let f9Points = 0;
  let f9Darts = 0;
  const legDarts = new Map<string, number>();
  const perMatch = new Map<string, { points: number; darts: number }>();
  let checkouts = 0;
  let chances = 0;
  let highestCheckout = 0;
  let tons100 = 0;
  let tons140 = 0;
  let count180 = 0;
  let bestLeg: number | null = null;
  for (const v of visits) {
    // Prvých 9 šípok legu (prechodný hod pomerne).
    const used = legDarts.get(v.leg) ?? 0;
    if (used < 9 && v.darts) {
      const take = Math.min(v.darts, 9 - used);
      f9Points += (v.points * take) / v.darts;
      f9Darts += take;
    }
    const legTotal = used + v.darts;
    legDarts.set(v.leg, legTotal);
    const match = perMatch.get(v.match) ?? { points: 0, darts: 0 };
    match.points += v.points;
    match.darts += v.darts;
    perMatch.set(v.match, match);
    if (v.points >= 100) tons100 += 1;
    if (v.points >= 140) tons140 += 1;
    if (v.points === 180) count180 += 1;
    if (v.doubleOut && (oneDartFinish(v.before) || v.checkout)) chances += 1;
    if (v.checkout) {
      if (v.doubleOut) checkouts += 1;
      highestCheckout = Math.max(highestCheckout, v.before);
      bestLeg = bestLeg === null ? legTotal : Math.min(bestLeg, legTotal);
    }
  }
  const trend = [...perMatch.entries()]
    .filter(([, m]) => m.darts > 0)
    .map(([id, m]) => ({ id, date: dates.get(id) ?? '', avg: round1((m.points * 3) / m.darts) }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(-15);
  return {
    first9: f9Darts ? round1((f9Points * 3) / f9Darts) : null,
    checkoutPct: chances ? Math.round((checkouts / chances) * 100) : null,
    checkouts,
    checkoutChances: chances,
    highestCheckout,
    tons100,
    tons140,
    count180,
    bestLeg,
    trend,
  };
}

export function scoringTotals(
  turns: { score: number; bust: boolean; darts?: number }[],
): ScoringTotals {
  return turns.reduce<ScoringTotals>(
    (totals, turn) => {
      const score = turn.bust ? 0 : turn.score;
      return {
        points: totals.points + score,
        darts: totals.darts + (turn.darts ?? 3),
        highest: Math.max(totals.highest, score),
        scores180: totals.scores180 + (score === 180 ? 1 : 0),
      };
    },
    { points: 0, darts: 0, highest: 0, scores180: 0 },
  );
}

export function combinedStatistics(
  offline: Game[],
  online: OnlineMatch[],
  onlineScoring: ScoringTotals,
  userId: string,
): StatisticsTotals {
  const completed = offline.filter((game) => game.winner !== null);
  const local = scoringTotals(
    completed.flatMap((game) => game.turns.filter((turn) => turn.player === 0 && !turn.undone)),
  );
  return {
    matches: completed.length + online.length,
    wins:
      completed.filter((game) => !game.solo && game.winner === 0).length +
      online.filter((match) => match.winner_id === userId).length,
    losses:
      completed.filter((game) => !game.solo && game.winner === 1).length +
      online.filter((match) => match.winner_id !== null && match.winner_id !== userId).length,
    solo: completed.filter((game) => game.solo).length,
    points: local.points + onlineScoring.points,
    darts: local.darts + onlineScoring.darts,
    highest: Math.max(local.highest, onlineScoring.highest),
    scores180: local.scores180 + onlineScoring.scores180,
  };
}

export function matchHistory(offline: Game[], online: OnlineMatch[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...offline
      .filter((game) => game.winner !== null)
      .map(
        (game): HistoryEntry => ({
          kind: 'offline',
          id: `offline:${game.id}`,
          date: game.date,
          game,
        }),
      ),
    ...online.map(
      (match): HistoryEntry => ({
        kind: 'online',
        id: `online:${match.id}`,
        date: match.created_at,
        match,
      }),
    ),
  ];
  return entries.sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id.localeCompare(a.id),
  );
}

/** Read every page so totals and the merged timeline never omit older matches. */
export async function loadAccountStatistics(userId: string) {
  const matches: OnlineMatch[] = [];
  let last: OnlineMatch | undefined;
  for (;;) {
    const participants = `host_id.eq.${userId},guest_id.eq.${userId}`;
    // Keep participant membership AND the keyset boundary in one logical filter.
    const filter = last
      ? `and(or(${participants}),or(created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})))`
      : participants;
    const request = bilt
      .from('online_matches')
      .select('*')
      .eq('status', 'finished')
      .or(filter)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(500);
    const { data, error }: QueryPage<OnlineMatch> = await request;
    if (error) throw new Error(error.message);
    matches.push(...(data ?? []));
    if (!data?.length || data.length < 500) break;
    last = data.at(-1);
  }
  const matchIds = new Set(matches.map((match) => match.id));
  let scoring = scoringTotals([]);
  const turns: VisitTurn[] = [];
  if (!matches.length) return { matches, scoring, turns };
  let cursor: Pick<OnlineTurn, 'match_id' | 'turn_number'> | undefined;
  for (;;) {
    let request = bilt
      .from('online_turns')
      .select(
        'match_id, turn_number, score, darts, bust, remaining, leg_number, online_matches!inner(status)',
      )
      .eq('player_id', userId)
      .eq('online_matches.status', 'finished')
      .order('match_id', { ascending: true })
      .order('turn_number', { ascending: true })
      .limit(500);
    if (cursor)
      request = request.or(
        `match_id.gt.${cursor.match_id},and(match_id.eq.${cursor.match_id},turn_number.gt.${cursor.turn_number})`,
      );
    const { data, error }: QueryPage<ScoringTurn> = await request;
    if (error) throw new Error(error.message);
    const mine = (data ?? []).filter((turn) => matchIds.has(turn.match_id));
    for (const t of mine)
      turns.push({
        match_id: t.match_id,
        turn_number: t.turn_number,
        score: t.score,
        darts: t.darts,
        bust: t.bust,
        remaining: t.remaining,
        leg_number: t.leg_number,
      });
    const page = scoringTotals(mine);
    scoring = {
      points: scoring.points + page.points,
      darts: scoring.darts + page.darts,
      highest: Math.max(scoring.highest, page.highest),
      scores180: scoring.scores180 + page.scores180,
    };
    if (!data?.length || data.length < 500) break;
    cursor = data.at(-1);
  }
  return { matches, scoring, turns };
}

export type HeadToHead = {
  matches: number;
  wins: number;
  losses: number;
  legsWon: number;
  legsLost: number;
  /** Priemer na 3 šípky [ja, priateľ]. */
  avg: [number | null, number | null];
  count180: [number, number];
};

type SideTotals = { points: number; darts: number; c180: number };
const emptySide = (): SideTotals => ({ points: 0, darts: 0, c180: 0 });
function addVisit(side: SideTotals, score: number, bust: boolean, darts: number) {
  const points = bust ? 0 : score;
  side.points += points;
  side.darts += darts;
  if (points === 180) side.c180 += 1;
}
const avgOf = (s: SideTotals) => (s.darts ? round1((s.points * 3) / s.darts) : null);

/** Ty vs priateľ: dohrané online zápasy medzi vami + lokálne zápasy proti nemu na tomto telefóne. */
export async function loadHeadToHead(
  userId: string,
  friendId: string,
  offline: Game[],
): Promise<HeadToHead> {
  const me = emptySide();
  const them = emptySide();
  let matches = 0;
  let wins = 0;
  let losses = 0;
  let legsWon = 0;
  let legsLost = 0;
  for (const game of offline) {
    if (game.winner === null || game.solo || game.opponentId !== friendId) continue;
    matches += 1;
    if (game.winner === 0) wins += 1;
    else losses += 1;
    // Staršie uložené hry nemusia mať legy (hralo sa na jeden leg).
    legsWon += game.legs?.[0] ?? (game.winner === 0 ? 1 : 0);
    legsLost += game.legs?.[1] ?? (game.winner === 1 ? 1 : 0);
    for (const t of game.turns)
      if (!t.undone) addVisit(t.player === 0 ? me : them, t.score, t.bust, t.darts ?? 3);
  }
  const { data, error }: QueryPage<OnlineMatch> = await bilt
    .from('online_matches')
    .select('*')
    .eq('status', 'finished')
    .or(
      `and(host_id.eq.${userId},guest_id.eq.${friendId}),and(host_id.eq.${friendId},guest_id.eq.${userId})`,
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const online = data ?? [];
  for (const m of online) {
    matches += 1;
    if (m.winner_id === userId) wins += 1;
    else if (m.winner_id) losses += 1;
    const mineLegs = m.host_id === userId ? m.host_legs : m.guest_legs;
    const theirLegs = m.host_id === userId ? m.guest_legs : m.host_legs;
    legsWon += mineLegs;
    legsLost += theirLegs;
  }
  if (online.length) {
    const {
      data: turns,
      error: turnsError,
    }: QueryPage<Pick<OnlineTurn, 'player_id' | 'score' | 'darts' | 'bust'>> = await bilt
      .from('online_turns')
      .select('player_id, score, darts, bust')
      .in(
        'match_id',
        online.map((m) => m.id),
      )
      .limit(10000);
    if (turnsError) throw new Error(turnsError.message);
    for (const t of turns ?? [])
      addVisit(t.player_id === userId ? me : them, t.score, t.bust, t.darts || 3);
  }
  return {
    matches,
    wins,
    losses,
    legsWon,
    legsLost,
    avg: [avgOf(me), avgOf(them)],
    count180: [me.c180, them.c180],
  };
}
