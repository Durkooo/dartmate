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
type ScoringTurn = Pick<OnlineTurn, 'match_id' | 'turn_number' | 'score' | 'darts' | 'bust'> & {
  online_matches: Pick<OnlineMatch, 'status'>;
};

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
  if (!matches.length) return { matches, scoring };
  let cursor: Pick<OnlineTurn, 'match_id' | 'turn_number'> | undefined;
  for (;;) {
    let request = bilt
      .from('online_turns')
      .select('match_id, turn_number, score, darts, bust, online_matches!inner(status)')
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
    const page = scoringTotals((data ?? []).filter((turn) => matchIds.has(turn.match_id)));
    scoring = {
      points: scoring.points + page.points,
      darts: scoring.darts + page.darts,
      highest: Math.max(scoring.highest, page.highest),
      scores180: scoring.scores180 + page.scores180,
    };
    if (!data?.length || data.length < 500) break;
    cursor = data.at(-1);
  }
  return { matches, scoring };
}
